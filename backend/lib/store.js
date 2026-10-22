// Supabase data access used by the sender and the SES webhook.
// Kept in one place so tests can swap in an in-memory fake.
const db = require('../db');

// Statuses that mean SES accepted the message.
const ACCEPTED = ['sent', 'delivered', 'bounced', 'complained'];

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

module.exports = {
  ACCEPTED,

  async getOrg(orgId) {
    return check(await db.from('organizations').select('id, name, business_address').eq('id', orgId).single());
  },

  async getCampaign(orgId, id) {
    const { data } = await db.from('campaigns').select('*').eq('id', id).eq('org_id', orgId).maybeSingle();
    return data;
  },

  // Atomically move a campaign into "sending" so a double click can't start two senders.
  async claimCampaign(orgId, id, fromStatuses) {
    const rows = check(await db.from('campaigns').update({ status: 'sending', last_error: null })
      .eq('id', id).eq('org_id', orgId).in('status', fromStatuses).select());
    return rows && rows[0] ? rows[0] : null;
  },

  async updateCampaign(id, patch) {
    check(await db.from('campaigns').update(patch).eq('id', id));
  },

  async refreshCounts(campaignId, orgId) {
    const count = async (statuses) => {
      const { count: n, error } = await db.from('recipients').select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId).eq('org_id', orgId).in('status', statuses);
      if (error) throw new Error(error.message);
      return n || 0;
    };
    const sent_count = await count(ACCEPTED);
    const failed_count = await count(['failed']);
    await this.updateCampaign(campaignId, { sent_count, failed_count });
    return { sent_count, failed_count };
  },

  // Keyset pagination on id, so marking rows as sent never shifts the next page.
  async pendingBatch(campaignId, orgId, afterId, limit) {
    let q = db.from('recipients').select('*').eq('campaign_id', campaignId).eq('org_id', orgId)
      .eq('status', 'pending').order('id', { ascending: true }).limit(limit);
    if (afterId) q = q.gt('id', afterId);
    return check(await q) || [];
  },

  async updateRecipient(id, patch) {
    check(await db.from('recipients').update(patch).eq('id', id));
  },

  // Only moves forward from the given statuses (a late Delivery must not undo a Bounce).
  async updateRecipientIf(id, fromStatuses, patch) {
    check(await db.from('recipients').update(patch).eq('id', id).in('status', fromStatuses));
  },

  async statusCounts(campaignId, orgId) {
    const out = {};
    for (const s of ['pending', 'sent', 'delivered', 'bounced', 'complained', 'suppressed', 'unsubscribed', 'failed']) {
      const { count } = await db.from('recipients').select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId).eq('org_id', orgId).eq('status', s);
      out[s] = count || 0;
    }
    return out;
  },

  async firstRecipient(campaignId, orgId) {
    const { data } = await db.from('recipients').select('*').eq('campaign_id', campaignId).eq('org_id', orgId)
      .order('id', { ascending: true }).limit(1);
    return data && data[0] ? data[0] : null;
  },

  async suppressedSet(orgId, emails) {
    if (!emails.length) return new Set();
    const rows = check(await db.from('suppressions').select('email').eq('org_id', orgId).in('email', emails.map(e => e.toLowerCase())));
    return new Set((rows || []).map(r => r.email));
  },

  async countSuppressedPending(campaignId, orgId) {
    // Small lists only: used by Test run to report how many pending addresses will be skipped.
    const pending = check(await db.from('recipients').select('email').eq('campaign_id', campaignId).eq('org_id', orgId).eq('status', 'pending').limit(10000)) || [];
    const set = await this.suppressedSet(orgId, pending.map(r => r.email));
    return { pending: pending.length, suppressed: pending.filter(r => set.has(r.email.toLowerCase())).length };
  },

  async addSuppression(orgId, email, reason, detail = null) {
    check(await db.from('suppressions').upsert(
      { org_id: orgId, email: email.toLowerCase(), reason, detail },
      { onConflict: 'org_id,email', ignoreDuplicates: true }
    ));
  },

  async insertEvent(row) {
    check(await db.from('events').insert(row));
  },

  // The "send" event written at send time links an SES message id back to its org / campaign / recipient.
  async findSendEvent(messageId) {
    const { data } = await db.from('events').select('org_id, campaign_id, recipient_id, email')
      .eq('message_id', messageId).eq('type', 'send').limit(1);
    return data && data[0] ? data[0] : null;
  },

  async verifiedDomains(orgId) {
    const rows = check(await db.from('sender_domains').select('domain').eq('org_id', orgId).eq('status', 'verified')) || [];
    return new Set(rows.map(r => r.domain));
  },
};
