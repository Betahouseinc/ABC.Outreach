// Campaign sending: pre-flight checks, Test run, Send test, and the paced send loop.
const { renderEmail, missingTags } = require('./render');

const BATCH_SIZE = 50;
const MAX_RETRIES = 3;

function domainOf(email) {
  return String(email || '').split('@')[1]?.trim().toLowerCase() || '';
}

function domainAllowed(domain, verified) {
  for (const d of verified) if (domain === d || domain.endsWith(`.${d}`)) return true;
  return false;
}

function createSender({ store, mailer, config, sleep = ms => new Promise(r => setTimeout(r, ms)), log = console }) {

  // Everything that must be true before real mail goes out. Errors block a real send; warnings don't.
  async function preflight(orgId, campaign) {
    const errors = [];
    const warnings = [];
    const org = await store.getOrg(orgId);
    const businessAddress = (org.business_address || config.defaultBusinessAddress || '').trim();
    if (!businessAddress) errors.push('Add your business postal address in Settings. It goes in every email footer.');

    const domain = domainOf(campaign.from_email);
    if (!domain) errors.push('The From email address is not valid.');
    else if (config.provider === 'ses' && !domainAllowed(domain, await store.verifiedDomains(orgId))) {
      errors.push(`${domain} is not a verified sending domain. Add it in Settings → Sending domains and click Verify.`);
    }

    const sample = await store.firstRecipient(campaign.id, orgId);
    const missing = missingTags(campaign, Object.keys((sample && sample.fields) || {}));
    if (missing.length) errors.push(`These merge tags have no value: ${missing.map(t => `{{${t}}}`).join(', ')}. Add matching CSV columns or remove them.`);

    if (!config.appSecretIsSet) (config.dryRun ? warnings : errors).push('APP_SECRET is not set on the server, so unsubscribe links would stop working after a restart.');
    if (config.dryRun) warnings.push('EMAIL_DRY_RUN is on: nothing will actually be sent.');
    return { errors, warnings, org, businessAddress, sample };
  }

  async function testRun(orgId, campaign) {
    const pf = await preflight(orgId, campaign);
    const { pending, suppressed } = await store.countSuppressedPending(campaign.id, orgId);
    const willSend = pending - suppressed;
    let preview = null;
    if (pf.sample) {
      const email = renderEmail({ campaign, recipient: pf.sample, org: pf.org, businessAddress: pf.businessAddress, baseUrl: config.baseUrl, secret: config.appSecret });
      preview = { to: pf.sample.email, subject: email.subject, html: email.html, text: email.text };
    } else {
      pf.errors.push('This campaign has no recipients yet.');
    }
    return {
      ok: pf.errors.length === 0,
      errors: pf.errors,
      warnings: pf.warnings,
      dryRun: config.dryRun,
      provider: config.provider,
      recipients: { pending, suppressed, willSend },
      ratePerSec: config.sendRatePerSec,
      estimatedMinutes: Math.ceil(willSend / config.sendRatePerSec / 60),
      preview,
    };
  }

  async function sendOne({ campaign, org, businessAddress, recipient }) {
    const email = renderEmail({ campaign, recipient, org, businessAddress, baseUrl: config.baseUrl, secret: config.appSecret });
    for (let attempt = 0; ; attempt++) {
      try {
        return await mailer.send({
          fromName: campaign.from_name, fromEmail: campaign.from_email, to: recipient.email,
          subject: recipient.id ? email.subject : `[TEST] ${email.subject}`,
          html: email.html, text: email.text, unsubscribeUrl: email.unsubscribeUrl,
        });
      } catch (err) {
        if (mailer.classifyError(err) === 'retry' && attempt < MAX_RETRIES) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw err;
      }
    }
  }

  async function sendTest(orgId, campaign, emails) {
    const pf = await preflight(orgId, campaign);
    if (!config.dryRun && pf.errors.length) return { ok: false, errors: pf.errors };
    const suppressed = await store.suppressedSet(orgId, emails);
    const results = [];
    for (const to of emails) {
      if (suppressed.has(to.toLowerCase())) { results.push({ to, status: 'suppressed' }); continue; }
      const base = pf.sample || { email: to, name: '', fields: {} };
      try {
        const out = await sendOne({ campaign, org: pf.org, businessAddress: pf.businessAddress, recipient: { email: to, name: base.name, fields: base.fields } });
        if (out.messageId) await store.insertEvent({ org_id: orgId, campaign_id: campaign.id, recipient_id: null, message_id: out.messageId, email: to.toLowerCase(), type: 'send', detail: { test: true } });
        results.push({ to, status: out.dryRun ? 'dry-run' : 'sent', messageId: out.messageId });
      } catch (err) {
        results.push({ to, status: 'failed', error: err.message });
      }
      await sleep(1000 / config.sendRatePerSec);
    }
    return { ok: true, dryRun: config.dryRun, warnings: pf.warnings, results };
  }

  async function pause(campaign, orgId, message) {
    await store.refreshCounts(campaign.id, orgId).catch(() => {});
    await store.updateCampaign(campaign.id, { status: 'paused', last_error: message });
    log.error(`[exo-mail] campaign ${campaign.id} paused: ${message}`);
    return { paused: true, error: message };
  }

  // The paced loop. Runs in the background after the API has already answered.
  async function runCampaign(orgId, campaign, { org, businessAddress }) {
    const interval = 1000 / config.sendRatePerSec;
    let afterId = null;
    try {
      for (;;) {
        const batch = await store.pendingBatch(campaign.id, orgId, afterId, BATCH_SIZE);
        if (!batch.length) break;
        const suppressed = await store.suppressedSet(orgId, batch.map(r => r.email));
        for (const r of batch) {
          afterId = r.id;
          if (suppressed.has(r.email.toLowerCase())) {
            await store.updateRecipient(r.id, { status: 'suppressed' });
            continue;
          }
          const started = Date.now();
          try {
            const out = await sendOne({ campaign, org, businessAddress, recipient: r });
            await store.updateRecipient(r.id, { status: 'sent', message_id: out.messageId || null, sent_at: new Date().toISOString(), error_msg: null });
            if (out.messageId) await store.insertEvent({ org_id: orgId, campaign_id: campaign.id, recipient_id: r.id, message_id: out.messageId, email: r.email.toLowerCase(), type: 'send', detail: null });
          } catch (err) {
            const kind = mailer.classifyError(err);
            if (kind !== 'recipient') return await pause(campaign, orgId, `${err.name || 'Error'}: ${err.message}`);
            await store.updateRecipient(r.id, { status: 'failed', error_msg: err.message });
          }
          const wait = interval - (Date.now() - started);
          if (wait > 0) await sleep(wait);
        }
        await store.refreshCounts(campaign.id, orgId);
      }
      await store.refreshCounts(campaign.id, orgId);
      await store.updateCampaign(campaign.id, { status: 'sent', sent_at: new Date().toISOString() });
      return { done: true };
    } catch (err) {
      return pause(campaign, orgId, `Unexpected error: ${err.message}`);
    }
  }

  // Called by POST /send. Returns an error, or starts the loop and returns immediately.
  async function startCampaign(orgId, campaign) {
    if (config.dryRun) return { status: 400, error: 'EMAIL_DRY_RUN is on, so nothing would be sent. Use Test run to check the campaign.' };
    if (!['draft', 'paused'].includes(campaign.status)) return { status: 400, error: `Campaign is ${campaign.status}` };
    const pf = await preflight(orgId, campaign);
    if (pf.errors.length) return { status: 400, error: pf.errors.join(' '), errors: pf.errors };
    const { pending } = await store.countSuppressedPending(campaign.id, orgId);
    if (!pending) return { status: 400, error: 'No pending recipients' };
    const claimed = await store.claimCampaign(orgId, campaign.id, ['draft', 'paused']);
    if (!claimed) return { status: 409, error: 'Campaign is already sending' };
    const done = runCampaign(orgId, claimed, { org: pf.org, businessAddress: pf.businessAddress });
    return { status: 200, pending, done };
  }

  return { preflight, testRun, sendTest, runCampaign, startCampaign };
}

module.exports = { createSender, domainOf, domainAllowed };
