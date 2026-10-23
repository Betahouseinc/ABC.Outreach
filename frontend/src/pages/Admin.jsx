import { useState, useEffect } from 'react';
import { api } from '../api';
import { useConfirm } from '../ui';

export default function Admin() {
  const [dialog, confirm] = useConfirm();
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api('/api/admin/users').then(r => r.json())
      .then(d => Array.isArray(d) ? setUsers(d) : setError(d.error || 'Failed to load users'));

  // Owner only (OWNER_EMAILS on the server): emails sent per company, for monthly invoices.
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [usage, setUsage] = useState(null);
  useEffect(() => {
    api(`/api/admin/usage?month=${month}`).then(r => r.ok ? r.json() : null).then(setUsage).catch(() => setUsage(null));
  }, [month]);

  useEffect(() => { load(); }, []);

  const addUser = async (e) => {
    e.preventDefault();
    setError(''); setMsg(''); setBusy(true);
    const r = await api('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, is_admin: makeAdmin })
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(d.error); return; }
    setMsg(`Added ${d.email}`);
    setEmail(''); setPassword(''); setMakeAdmin(false);
    load();
  };

  const removeUser = async (id, em) => {
    if (!(await confirm({ title: `Remove ${em}?`, body: 'They lose access immediately. Their campaigns stay.', confirmLabel: 'Remove user', danger: true }))) return;
    const r = await api(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (r.ok) load();
  };

  return (
    <div>
      {dialog}
      <div className="page-header"><div><h2>Team</h2><p>People who can sign in to eXoMail.</p></div></div>
      {error && <div className="alert alert-danger">{error}</div>}
      {msg && <div className="alert alert-info">{msg}</div>}

      <div className="card" style={{ marginBottom: 20, maxWidth: 560 }}>
        <h3 style={{ marginBottom: 16, fontSize: 15 }}>Add internal user</h3>
        <div className="form-group">
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="person@company.com" />
        </div>
        <div className="form-group">
          <label>Temporary password</label>
          <input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)', margin: '4px 0 18px', cursor: 'pointer' }}>
          <input type="checkbox" checked={makeAdmin} onChange={e => setMakeAdmin(e.target.checked)} /> Make this user an admin
        </label>
        <button className="btn btn-primary" disabled={busy} onClick={addUser}>{busy ? 'Adding…' : 'Add user'}</button>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 16, fontSize: 15 }}>Users ({users.length})</h3>
        <table className="table" style={{ width: '100%' }}>
          <thead>
            <tr><th>Email</th><th>Role</th><th>Last sign in</th><th></th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>
                  {u.is_admin
                    ? <span className="badge badge-sent">admin</span>
                    : <span className="badge badge-draft">member</span>}
                </td>
                <td style={{ color: 'var(--text2)' }}>{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => removeUser(u.id, u.email)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {usage && (
        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
            <h3 style={{ fontSize: 15 }}>Usage by company</h3>
            <input type="month" aria-label="Month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} style={{ width: 'auto' }} />
          </div>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
            Campaign emails sent in the month (UTC), for invoicing. Test emails aren't counted. Only you see this.
          </p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Company</th><th style={{ textAlign: 'right' }}>Campaigns sent</th><th style={{ textAlign: 'right' }}>Emails sent</th></tr></thead>
              <tbody>
                {usage.orgs.map(o => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 500 }}>{o.name}</td>
                    <td style={{ textAlign: 'right' }}>{o.campaigns_sent.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{o.emails_sent.toLocaleString()}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight: 600 }}>Total</td><td></td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{usage.total_emails_sent.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
