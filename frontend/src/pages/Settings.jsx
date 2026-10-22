import { useState, useEffect } from 'react';
import { api } from '../api';
import { useConfirm } from '../ui';

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function DomainStatus({ d }) {
  const label = { verified: 'verified', pending: 'pending', not_found: 'not in SES' }[d.status] || d.status;
  const cls = d.status === 'verified' ? 'badge-sent' : d.status === 'not_found' ? 'badge-failed' : 'badge-sending';
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default function Settings({ onChange }) {
  const [dialog, confirm] = useConfirm();
  const [s, setS] = useState(null);
  const [address, setAddress] = useState('');
  const [domains, setDomains] = useState([]);
  const [newDomain, setNewDomain] = useState('');
  const [supp, setSupp] = useState({ suppressions: [], total: 0, page: 1, limit: 50 });
  const [search, setSearch] = useState('');
  const [newSupp, setNewSupp] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const flash = (m, isError) => { setMsg(isError ? '' : m); setError(isError ? m : ''); };

  const loadSettings = () => api('/api/settings').then(r => r.json()).then(d => { setS(d); setAddress(d.business_address || ''); onChange?.(d); });
  const loadDomains = () => api('/api/settings/domains').then(r => r.json()).then(d => Array.isArray(d) && setDomains(d));
  const loadSupp = (page = 1, q = search) => {
    const qs = new URLSearchParams({ page });
    if (q) qs.set('search', q);
    return api(`/api/settings/suppressions?${qs}`).then(r => r.json()).then(d => d.suppressions && setSupp(d));
  };

  useEffect(() => { loadSettings(); loadDomains(); loadSupp(1, ''); }, []);

  const saveAddress = async () => {
    setBusy('address');
    const r = await api('/api/settings', json('PUT', { business_address: address }));
    const d = await r.json();
    setBusy('');
    if (!r.ok) return flash(d.error, true);
    flash('Business address saved');
    loadSettings();
  };

  const addDomain = async (e) => {
    e.preventDefault();
    setBusy('domain');
    const r = await api('/api/settings/domains', json('POST', { domain: newDomain }));
    const d = await r.json();
    setBusy('');
    if (!r.ok) return flash(d.error, true);
    setNewDomain('');
    flash(`Added ${d.domain}. Click Verify to check it with Amazon SES.`);
    loadDomains();
  };

  const verifyDomain = async (d) => {
    setBusy(d.id);
    const r = await api(`/api/settings/domains/${d.id}/verify`, { method: 'POST' });
    const out = await r.json();
    setBusy('');
    if (!r.ok) return flash(out.error, true);
    if (out.status === 'verified') flash(`${out.domain} is verified for sending.`);
    else flash(out.note || `${out.domain} is not verified yet (DKIM: ${out.dkim_status}, MAIL FROM: ${out.mail_from_status}). DNS changes can take up to an hour.`, true);
    loadDomains();
  };

  const removeDomain = async (d) => {
    const ok = await confirm({ title: `Remove ${d.domain}?`, body: "Campaigns can't send from it until it's added again.", confirmLabel: 'Remove domain', danger: true });
    if (!ok) return;
    await api(`/api/settings/domains/${d.id}`, { method: 'DELETE' });
    loadDomains();
  };

  const addSupp = async (e) => {
    e.preventDefault();
    const r = await api('/api/settings/suppressions', json('POST', { email: newSupp }));
    const d = await r.json();
    if (!r.ok) return flash(d.error, true);
    setNewSupp('');
    flash('Added to the suppression list');
    loadSupp(1);
  };

  const removeSupp = async (row) => {
    const risky = row.reason === 'bounce' || row.reason === 'complaint';
    const ok = await confirm({
      title: `Remove ${row.email}?`,
      body: risky
        ? `This address ${row.reason === 'bounce' ? 'bounced' : 'marked your email as spam'}. Emailing it again can hurt your sender reputation.`
        : 'It will receive future campaigns again.',
      confirmLabel: 'Remove from list',
      danger: risky,
    });
    if (!ok) return;
    await api(`/api/settings/suppressions/${row.id}`, { method: 'DELETE' });
    loadSupp(supp.page);
  };

  if (!s) return <p style={{ color: 'var(--text2)', padding: 20 }}>Loading...</p>;
  const admin = s.is_admin;
  const pages = Math.max(1, Math.ceil(supp.total / supp.limit));

  return (
    <div style={{ maxWidth: 980 }}>
      {dialog}
      <div className="page-header">
        <div>
          <h2>Settings</h2>
          <p>Sending through Amazon {s.provider.toUpperCase()} · {s.send_rate_per_sec} email{s.send_rate_per_sec === 1 ? '' : 's'} per second · {s.dry_run ? 'Test mode (nothing is actually sent)' : 'Live'}</p>
        </div>
      </div>
      {!admin && <div className="alert alert-info">Only admins can change these settings.</div>}

      {error && <div className="alert alert-danger">{error}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, marginBottom: 6 }}>Business address</h3>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
          Anti-spam laws require a postal address in every marketing email. It's added to the footer automatically.
        </p>
        <div className="form-group">
          <textarea value={address} onChange={e => setAddress(e.target.value)} disabled={!admin}
            placeholder={s.default_business_address || 'Company name, street, city, postcode, country'} style={{ minHeight: 80 }} />
        </div>
        {!s.business_address && s.default_business_address && (
          <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: -10, marginBottom: 14 }}>Currently using the server default: {s.default_business_address}</p>
        )}
        {admin && <button className="btn btn-primary" onClick={saveAddress} disabled={busy === 'address'}>{busy === 'address' ? 'Saving…' : 'Save address'}</button>}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, marginBottom: 6 }}>Sending domains</h3>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
          Campaigns can only send from addresses on a verified domain. The domain must already be set up in Amazon SES (DKIM records added); Verify checks its status.
        </p>
        {admin && (
          <form onSubmit={addDomain} style={{ display: 'flex', gap: 8, marginBottom: 16, maxWidth: 480 }}>
            <div className="form-group" style={{ flex: 1, margin: 0 }}>
              <input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="example.com" />
            </div>
            <button className="btn btn-primary" disabled={!newDomain || busy === 'domain'}>Add domain</button>
          </form>
        )}
        {domains.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text3)' }}>No sending domains yet.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Domain</th><th>Status</th><th>DKIM</th><th>MAIL FROM</th><th>Last checked</th><th></th></tr></thead>
              <tbody>
                {domains.map(d => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 500 }}>{d.domain}</td>
                    <td><DomainStatus d={d} /></td>
                    <td style={{ color: 'var(--text2)', fontSize: 12 }}>{d.dkim_status || '—'}</td>
                    <td style={{ color: 'var(--text2)', fontSize: 12 }}>{d.mail_from_status || '—'}</td>
                    <td style={{ color: 'var(--text2)', fontSize: 12 }}>{d.last_checked_at ? new Date(d.last_checked_at).toLocaleString() : '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => verifyDomain(d)} disabled={busy === d.id}>{busy === d.id ? 'Checking…' : 'Verify'}</button>
                      {admin && <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6, color: 'var(--danger)' }} onClick={() => removeDomain(d)}>Remove</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: 15 }}>Suppression list ({supp.total.toLocaleString()})</h3>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
          These addresses are skipped in every campaign: hard bounces, spam complaints and unsubscribes are added automatically.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <form onSubmit={e => { e.preventDefault(); loadSupp(1); }} style={{ display: 'flex', gap: 8 }}>
            <div className="form-group" style={{ margin: 0 }}><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search email" /></div>
            <button className="btn btn-secondary">Search</button>
          </form>
          {admin && (
            <form onSubmit={addSupp} style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <div className="form-group" style={{ margin: 0 }}><input value={newSupp} onChange={e => setNewSupp(e.target.value)} placeholder="Add an email" /></div>
              <button className="btn btn-secondary" disabled={!newSupp}>Add</button>
            </form>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Email</th><th>Reason</th><th>Detail</th><th>Added</th><th></th></tr></thead>
            <tbody>
              {supp.suppressions.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--text3)' }}>No suppressed addresses.</td></tr>}
              {supp.suppressions.map(row => (
                <tr key={row.id}>
                  <td>{row.email}</td>
                  <td><span className={`badge badge-${row.reason === 'unsubscribe' ? 'unsubscribed' : row.reason === 'complaint' ? 'complained' : row.reason === 'bounce' ? 'bounced' : 'draft'}`}>{row.reason}</span></td>
                  <td style={{ color: 'var(--text2)', fontSize: 12 }}>{row.detail || '—'}</td>
                  <td style={{ color: 'var(--text2)', fontSize: 12 }}>{new Date(row.created_at).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{admin && <button className="btn btn-secondary btn-sm" onClick={() => removeSupp(row)}>Remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
            <button className="btn btn-secondary btn-sm" disabled={supp.page === 1} onClick={() => loadSupp(supp.page - 1)}>← Prev</button>
            <span style={{ fontSize: 13, color: 'var(--text2)', padding: '6px 12px' }}>Page {supp.page} of {pages}</span>
            <button className="btn btn-secondary btn-sm" disabled={supp.page >= pages} onClick={() => loadSupp(supp.page + 1)}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
