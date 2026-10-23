import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Icon } from '../ui';

const json = r => (r.ok ? r.json() : null);

export default function Dashboard({ settings }) {
  const [campaigns, setCampaigns] = useState(null);
  const [domains, setDomains] = useState([]);
  const [suppressed, setSuppressed] = useState(0);

  useEffect(() => {
    api('/api/campaigns').then(json).then(d => setCampaigns(Array.isArray(d) ? d : [])).catch(() => setCampaigns([]));
    api('/api/settings/domains').then(json).then(d => Array.isArray(d) && setDomains(d)).catch(() => {});
    api('/api/settings/suppressions?page=1').then(json).then(d => d && setSuppressed(d.total || 0)).catch(() => {});
  }, []);

  const list = campaigns || [];
  const drafts = list.filter(c => c.status === 'draft').length;
  const totalSent = list.reduce((a, c) => a + (c.sent_count || 0), 0);
  const totalOpens = list.reduce((a, c) => a + (c.open_count || 0), 0);
  const totalClicks = list.reduce((a, c) => a + (c.click_count || 0), 0);
  const openRate = totalSent > 0 && totalOpens > 0 ? `${((totalOpens / totalSent) * 100).toFixed(1)}%` : '—';
  const clickRate = totalSent > 0 && totalClicks > 0 ? `${((totalClicks / totalSent) * 100).toFixed(1)}%` : '—';
  const recent = list.slice(0, 5);

  const steps = [
    { done: domains.some(d => d.status === 'verified'), label: 'Sending domain verified', to: '/settings' },
    { done: !!(settings?.business_address || settings?.default_business_address), label: 'Business address added', to: '/settings' },
    { done: settings ? !settings.dry_run : false, label: 'Live sending switched on', hint: 'Set by your admin on the server' },
  ];
  const doneCount = steps.filter(s => s.done).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p>How your email campaigns are doing.</p>
        </div>
        <Link to="/campaigns/new" className="btn btn-primary"><Icon name="plus" size={16} strokeWidth={2.4} /> New campaign</Link>
      </div>

      {settings && doneCount < steps.length && (
        <section className="setup" aria-label="Setup">
          <div style={{ flex: '1 1 300px' }}>
            <h3>Finish setting up sending</h3>
            <p>{doneCount} of {steps.length} steps done.</p>
          </div>
          <ol style={{ flex: '2 1 460px' }}>
            {steps.map(s => (
              <li key={s.label} style={{ color: s.done ? 'var(--text)' : 'var(--text2)' }}>
                <span className={`tick ${s.done ? 'done' : 'todo'}`} aria-hidden="true">{s.done && <Icon name="check" size={12} strokeWidth={3} />}</span>
                {!s.done && s.to ? <Link to={s.to}>{s.label}</Link> : s.label}
                {!s.done && s.hint && <span className="cell-sub">({s.hint})</span>}
                <span className="sr-only">{s.done ? 'done' : 'not done'}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="stats-grid" aria-label="Key numbers">
        <div className="stat-card">
          <div className="label">Campaigns</div>
          <div className="value">{list.length}</div>
          <div className="sub">{drafts} draft{drafts === 1 ? '' : 's'}</div>
        </div>
        <div className="stat-card">
          <div className="label">Emails sent</div>
          <div className="value">{totalSent.toLocaleString()}</div>
          <div className="sub">Accepted for delivery</div>
        </div>
        <div className="stat-card">
          <div className="label">Open rate</div>
          <div className="value" style={openRate === '—' ? { color: 'var(--text3)' } : {}}>{openRate}</div>
          <div className="sub">{totalOpens ? `${totalOpens.toLocaleString()} opens` : 'Shows after your next send'}</div>
        </div>
        <div className="stat-card">
          <div className="label">Click rate</div>
          <div className="value" style={clickRate === '—' ? { color: 'var(--text3)' } : {}}>{clickRate}</div>
          <div className="sub">{totalClicks ? `${totalClicks.toLocaleString()} clicks` : 'Shows after your next send'}</div>
        </div>
        <div className="stat-card">
          <div className="label">Suppressed</div>
          <div className="value">{suppressed.toLocaleString()}</div>
          <div className="sub">Bounces, complaints, unsubscribes</div>
        </div>
      </section>

      <section className="card" style={{ padding: 0 }} aria-label="Recent campaigns">
        <div className="toolbar" style={{ padding: '18px 24px', margin: 0, borderBottom: '1px solid var(--border)' }}>
          <h3>Recent campaigns</h3>
          <Link to="/campaigns" style={{ fontWeight: 600 }}>View all</Link>
        </div>
        {campaigns === null ? (
          <p style={{ padding: 24, color: 'var(--text2)' }}>Loading…</p>
        ) : recent.length === 0 ? (
          <div className="empty-state">
            <h3>No campaigns yet</h3>
            <p>Create your first campaign to get started.</p>
            <Link to="/campaigns/new" className="btn btn-primary" style={{ marginTop: 8 }}>Create campaign</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th scope="col" style={{ paddingLeft: 24 }}>Campaign</th><th scope="col">Status</th>
                <th scope="col" style={{ textAlign: 'right' }}>Recipients</th><th scope="col" style={{ textAlign: 'right' }}>Sent</th>
                <th scope="col">Sent on</th>
              </tr></thead>
              <tbody>
                {recent.map(c => (
                  <tr key={c.id}>
                    <td style={{ paddingLeft: 24 }}>
                      <Link to={`/campaigns/${c.id}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{c.name}</Link>
                      <div className="cell-sub">{c.subject}</div>
                    </td>
                    <td><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                    <td style={{ textAlign: 'right' }}>{(c.total_recipients || 0).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{(c.sent_count || 0).toLocaleString()}</td>
                    <td style={{ color: 'var(--text2)' }}>{c.sent_at ? new Date(c.sent_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
