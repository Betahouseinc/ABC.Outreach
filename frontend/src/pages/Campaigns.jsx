import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Icon, RowMenu, useConfirm } from '../ui';

const FILTERS = [['', 'All'], ['draft', 'Drafts'], ['sending', 'Sending'], ['paused', 'Paused'], ['sent', 'Sent']];

export default function Campaigns() {
  const nav = useNavigate();
  const [campaigns, setCampaigns] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [dialog, confirm] = useConfirm();

  const load = () => api('/api/campaigns').then(r => r.json()).then(d => setCampaigns(Array.isArray(d) ? d : [])).catch(() => setCampaigns([]));
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (campaigns || []).filter(c => (!status || c.status === status) &&
      (!q || c.name.toLowerCase().includes(q) || (c.subject || '').toLowerCase().includes(q)));
  }, [campaigns, query, status]);

  const del = async (c) => {
    const ok = await confirm({
      title: `Delete “${c.name}”?`,
      body: c.status === 'sent'
        ? 'This campaign has been sent. Deleting it removes its recipients and statistics for good.'
        : 'This removes the campaign and its recipient list for good.',
      confirmLabel: 'Delete campaign',
      danger: true,
    });
    if (!ok) return;
    setError('');
    const r = await api(`/api/campaigns/${c.id}`, { method: 'DELETE' });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error || 'Could not delete the campaign'); return; }
    load();
  };

  const total = campaigns?.length || 0;

  return (
    <div>
      {dialog}
      <div className="page-header">
        <div>
          <h2>Campaigns</h2>
          <p>{total} campaign{total !== 1 ? 's' : ''}</p>
        </div>
        <Link to="/campaigns/new" className="btn btn-primary"><Icon name="plus" size={16} strokeWidth={2.4} /> New campaign</Link>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={16} />
          <span className="sr-only">Search campaigns</span>
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name or subject" />
        </label>
        <div className="chips" role="group" aria-label="Filter by status">
          {FILTERS.map(([v, label]) => (
            <button key={v || 'all'} className={`chip${status === v ? ' on' : ''}`} aria-pressed={status === v} onClick={() => setStatus(v)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {campaigns === null ? (
          <p style={{ padding: 24, color: 'var(--text2)' }}>Loading…</p>
        ) : total === 0 ? (
          <div className="empty-state">
            <h3>No campaigns yet</h3>
            <p>Create your first email campaign.</p>
            <Link to="/campaigns/new" className="btn btn-primary" style={{ marginTop: 8 }}>Create campaign</Link>
          </div>
        ) : shown.length === 0 ? (
          <div className="empty-state"><h3>No matches</h3><p>Try a different search or filter.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th scope="col" style={{ paddingLeft: 24 }}>Name</th>
                <th scope="col">Status</th>
                <th scope="col" style={{ textAlign: 'right' }}>Recipients</th>
                <th scope="col" style={{ textAlign: 'right' }}>Sent</th>
                <th scope="col" style={{ textAlign: 'right' }}>Opens</th>
                <th scope="col" style={{ textAlign: 'right' }}>Clicks</th>
                <th scope="col" style={{ textAlign: 'right' }}>Failed</th>
                <th scope="col">Created</th>
                <th scope="col" style={{ paddingRight: 24 }}><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>
                {shown.map(c => (
                  <tr key={c.id}>
                    <td style={{ paddingLeft: 24 }}>
                      <Link to={`/campaigns/${c.id}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{c.name}</Link>
                      <div className="cell-sub">{c.subject}</div>
                    </td>
                    <td><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                    <td style={{ textAlign: 'right' }}>{(c.total_recipients || 0).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{(c.sent_count || 0).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{c.sent_count > 0 && c.open_count > 0 ? `${c.open_count} (${((c.open_count / c.sent_count) * 100).toFixed(1)}%)` : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{c.sent_count > 0 && c.click_count > 0 ? `${c.click_count} (${((c.click_count / c.sent_count) * 100).toFixed(1)}%)` : '—'}</td>
                    <td style={{ textAlign: 'right', color: c.failed_count > 0 ? 'var(--danger)' : 'var(--text2)' }}>{c.failed_count || 0}</td>
                    <td style={{ color: 'var(--text2)' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                    <td style={{ paddingRight: 24, textAlign: 'right' }}>
                      <RowMenu label={`Actions for ${c.name}`} items={[
                        { label: 'Open', onClick: () => nav(`/campaigns/${c.id}`) },
                        { label: 'Delete', danger: true, disabled: c.status === 'sending', title: c.status === 'sending' ? 'Wait until sending finishes' : undefined, onClick: () => del(c) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
