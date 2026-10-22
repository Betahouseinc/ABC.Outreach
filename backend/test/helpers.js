// In-memory stand-in for lib/store.js, plus a recording mailer.
function fakeStore({ org = { id: 'org1', name: 'Acme', business_address: '1 Main St, Sydney' }, recipients = [], suppressed = [], domains = ['example.com'] } = {}) {
  const s = {
    org,
    campaigns: {},
    recipients: recipients.map(r => ({ status: 'pending', fields: {}, ...r })),
    suppressions: suppressed.map(e => ({ org_id: org.id, email: e, reason: 'manual' })),
    events: [],
    domains: new Set(domains),

    async getOrg() { return s.org; },
    async getCampaign(orgId, id) { return s.campaigns[id] || null; },
    async claimCampaign(orgId, id, from) {
      const c = s.campaigns[id];
      if (!c || !from.includes(c.status)) return null;
      c.status = 'sending';
      return { ...c };
    },
    async updateCampaign(id, patch) { Object.assign(s.campaigns[id] || (s.campaigns[id] = { id }), patch); },
    async refreshCounts(campaignId) {
      const mine = s.recipients.filter(r => r.campaign_id === campaignId);
      const out = { sent_count: mine.filter(r => ['sent', 'delivered', 'bounced', 'complained'].includes(r.status)).length, failed_count: mine.filter(r => r.status === 'failed').length };
      await s.updateCampaign(campaignId, out);
      return out;
    },
    async pendingBatch(campaignId, orgId, afterId, limit) {
      return s.recipients.filter(r => r.campaign_id === campaignId && r.status === 'pending' && (!afterId || r.id > afterId))
        .sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, limit).map(r => ({ ...r }));
    },
    async updateRecipient(id, patch) { Object.assign(s.recipients.find(r => r.id === id), patch); },
    async updateRecipientIf(id, from, patch) {
      const r = s.recipients.find(x => x.id === id);
      if (r && from.includes(r.status)) Object.assign(r, patch);
    },
    async firstRecipient(campaignId) { return s.recipients.filter(r => r.campaign_id === campaignId).sort((a, b) => (a.id < b.id ? -1 : 1))[0] || null; },
    async suppressedSet(orgId, emails) {
      const all = new Set(s.suppressions.filter(x => x.org_id === orgId).map(x => x.email));
      return new Set(emails.map(e => e.toLowerCase()).filter(e => all.has(e)));
    },
    async countSuppressedPending(campaignId, orgId) {
      const pending = s.recipients.filter(r => r.campaign_id === campaignId && r.status === 'pending');
      const set = await s.suppressedSet(orgId, pending.map(r => r.email));
      return { pending: pending.length, suppressed: pending.filter(r => set.has(r.email)).length };
    },
    async addSuppression(orgId, email, reason, detail) {
      if (!s.suppressions.some(x => x.org_id === orgId && x.email === email)) s.suppressions.push({ org_id: orgId, email, reason, detail });
    },
    async insertEvent(row) { s.events.push(row); },
    async findSendEvent(messageId) { return s.events.find(e => e.message_id === messageId && e.type === 'send') || null; },
    async verifiedDomains() { return s.domains; },
  };
  return s;
}

function fakeMailer({ failFor = {}, dryRun = false } = {}) {
  const m = {
    sent: [],
    async send(msg) {
      const err = failFor[msg.to];
      if (err) {
        if (typeof err === 'function') { const e = err(); if (e) throw e; }
        else throw err;
      }
      m.sent.push(msg);
      return dryRun ? { messageId: null, dryRun: true } : { messageId: `msg-${m.sent.length}` };
    },
    classifyError: require('../lib/mailer').classifyError,
  };
  return m;
}

const baseConfig = {
  baseUrl: 'https://api.test',
  appSecret: 'test-secret',
  appSecretIsSet: true,
  dryRun: false,
  provider: 'ses',
  sendRatePerSec: 10,
  defaultBusinessAddress: '',
};

module.exports = { fakeStore, fakeMailer, baseConfig };
