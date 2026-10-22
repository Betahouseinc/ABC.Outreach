// Parses an uploaded recipient CSV. Every column is kept in `fields` so it can be used as a merge tag.
const { parse } = require('csv-parse/sync');
const { normalizeKey } = require('./render');

const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;
const EMAIL_COLS = ['email', 'email_address', 'e_mail'];
const NAME_COLS = ['name', 'full_name', 'first_name'];

function parseRecipients(text) {
  const records = parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true });
  if (!records.length) return { error: 'CSV is empty' };

  const headers = Object.keys(records[0]);
  const emailCol = headers.find(h => EMAIL_COLS.includes(normalizeKey(h)));
  if (!emailCol) return { error: 'CSV must have an "email" column' };
  const nameCol = headers.find(h => NAME_COLS.includes(normalizeKey(h)));

  const seen = new Set();
  const rows = [];
  let invalid = 0, duplicates = 0;
  for (const rec of records) {
    const email = String(rec[emailCol] || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { invalid++; continue; }
    if (seen.has(email)) { duplicates++; continue; }
    seen.add(email);
    const fields = {};
    for (const h of headers) if (h !== emailCol) fields[normalizeKey(h)] = String(rec[h] ?? '').trim();
    rows.push({ email, name: nameCol ? String(rec[nameCol] || '').trim() : '', fields });
  }
  return { rows, invalid, duplicates };
}

module.exports = { parseRecipients, EMAIL_RE };
