// Turns a campaign + recipient into the final subject / HTML / text that gets sent.
const { signUnsubscribe, signClick } = require('./tokens');

const TAG_RE = /\{\{\s*([a-zA-Z0-9_ -]+?)\s*\}\}/g;
const BUILT_IN_TAGS = ['name', 'first_name', 'email', 'unsubscribe_url', 'year', 'business_address', 'company_name'];

// "First Name" / "first-name" / "FIRST_NAME" all become "first_name".
function normalizeKey(k) {
  return String(k).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function findTags(str) {
  const tags = new Set();
  for (const m of String(str || '').matchAll(TAG_RE)) tags.add(normalizeKey(m[1]));
  return tags;
}

// Tags used in the campaign that neither the built-ins nor the CSV columns can fill.
function missingTags(campaign, fieldKeys = []) {
  const known = new Set([...BUILT_IN_TAGS, ...fieldKeys.map(normalizeKey)]);
  const used = new Set([...findTags(campaign.subject), ...findTags(campaign.html_body)]);
  return [...used].filter(t => !known.has(t)).sort();
}

function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildContext({ recipient, org, unsubscribeUrl, businessAddress }) {
  const ctx = {};
  for (const [k, v] of Object.entries(recipient.fields || {})) ctx[normalizeKey(k)] = v == null ? '' : String(v);
  const name = ctx.name || recipient.name || '';
  ctx.name = name;
  if (!ctx.first_name) ctx.first_name = name.split(/\s+/)[0] || '';
  ctx.email = recipient.email;
  ctx.unsubscribe_url = unsubscribeUrl;
  ctx.year = String(new Date().getFullYear());
  ctx.business_address = businessAddress || '';
  if (!ctx.company_name) ctx.company_name = (org && org.name) || '';
  return ctx;
}

function fillTags(str, ctx, escape) {
  return String(str || '').replace(TAG_RE, (_, key) => {
    const v = ctx[normalizeKey(key)];
    if (v == null) return '';
    return escape ? escapeHtml(v) : v;
  });
}

function addFooter(html, { businessAddress, unsubscribeUrl, templateHasUnsubscribe }) {
  const parts = [];
  if (businessAddress) parts.push(escapeHtml(businessAddress));
  if (!templateHasUnsubscribe) parts.push(`<a href="${unsubscribeUrl}" style="color:#888888;">Unsubscribe</a>`);
  if (!parts.length) return html;
  const footer = `<div style="font-family:Arial,sans-serif;font-size:12px;line-height:18px;color:#888888;text-align:center;padding:24px 16px;">${parts.join('<br>')}</div>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${footer}</body>`) : `${html}${footer}`;
}

function injectTracking(html, { baseUrl, campaignId, recipientId, secret }) {
  let out = html.replace(/href="(https?:\/\/[^"]+)"/g, (match, url) => {
    // Leave our own links (unsubscribe, tracking) alone.
    if (url.startsWith(baseUrl)) return match;
    const sig = signClick(secret, campaignId, recipientId, url);
    return `href="${baseUrl}/track/click/${campaignId}/${recipientId}?url=${encodeURIComponent(url)}&sig=${sig}"`;
  });
  const pixel = `<img src="${baseUrl}/track/open/${campaignId}/${recipientId}" width="1" height="1" style="display:none" alt="">`;
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, `${pixel}</body>`) : `${out}${pixel}`;
  return out;
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => `${label.replace(/<[^>]+>/g, '').trim()} (${href})`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

// recipient: { id?, email, name, fields }. Test sends have no id, so they get no tracking.
function renderEmail({ campaign, recipient, org, businessAddress, baseUrl, secret }) {
  const token = signUnsubscribe(secret, { orgId: org.id, email: recipient.email, campaignId: campaign.id, recipientId: recipient.id || null });
  const unsubscribeUrl = `${baseUrl}/u/${token}`;
  const ctx = buildContext({ recipient, org, unsubscribeUrl, businessAddress });
  const templateHasUnsubscribe = findTags(campaign.html_body).has('unsubscribe_url');

  let html = fillTags(campaign.html_body, ctx, true);
  html = addFooter(html, { businessAddress, unsubscribeUrl, templateHasUnsubscribe });
  if (recipient.id) html = injectTracking(html, { baseUrl, campaignId: campaign.id, recipientId: recipient.id, secret });

  return {
    subject: fillTags(campaign.subject, ctx, false).replace(/[\r\n]+/g, ' ').trim(),
    html,
    text: htmlToText(html.replace(/<img [^>]*\/track\/open\/[^>]*>/gi, '')),
    unsubscribeUrl,
  };
}

module.exports = { normalizeKey, findTags, missingTags, escapeHtml, fillTags, addFooter, injectTracking, htmlToText, renderEmail, BUILT_IN_TAGS };
