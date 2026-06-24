import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Admin() {
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
    if (!window.confirm(`Remove ${em}? They will lose access immediately.`)) return;
    const r = await api(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (r.ok) load();
  };

  return (
    <div>
      <div className="page-header"><div><h2>Team</h2></div></div>
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
                    : <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'var(--bg3)', color: 'var(--text2)' }}>user</span>}
                </td>
                <td style={{ color: 'var(--text2)' }}>{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => removeUser(u.id, u.email)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
