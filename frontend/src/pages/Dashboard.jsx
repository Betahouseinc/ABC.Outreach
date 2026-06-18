import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    api('/api/campaigns').then(r => r.json()).then(setCampaigns).catch(() => {});
  }, []);

  const total = campaigns.length;
  const sent = campaigns.filter(c => c.status === 'sent').length;
  const totalSent = campaigns.reduce((a, c) => a + (c.sent_count || 0), 0);
  const totalOpens = campaigns.reduce((a, c) => a + (c.open_count || 0), 0);
  const totalClicks = campaigns.reduce((a, c) => a + (c.click_count || 0), 0);
  const openRate = totalSent > 0 ? ((totalOpens / totalSent) * 100).toFixed(1) : '0.0';
  const clickRate = totalSent > 0 ? ((totalClicks / totalSent) * 100).toFixed(1) : '0.0';

  const recent = [...campaigns].slice(0, 5);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p>Overview of your email campaigns</p>
        </div>
        <Link to="/campaigns/new" className="btn btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Campaign
        </Link>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Total Campaigns</div>
          <div className="value">{total}</div>
          <div className="sub">{sent} sent</div>
        </div>
        <div className="stat-card">
          <div className="label">Emails Sent</div>
          <div className="value">{totalSent.toLocaleString()}</div>
          <div className="sub">across all campaigns</div>
        </div>
        <div className="stat-card">
          <div className="label">Open Rate</div>
          <div className="value" style={{color: 'var(--success)'}}>{openRate}%</div>
          <div className="sub">{totalOpens.toLocaleString()} opens</div>
        </div>
        <div className="stat-card">
          <div className="label">Click Rate</div>
          <div className="value" style={{color: 'var(--accent)'}}>{clickRate}%</div>
          <div className="sub">{totalClicks.toLocaleString()} clicks</div>
        </div>
      </div>

      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h3 style={{fontSize:15,fontWeight:600}}>Recent Campaigns</h3>
          <Link to="/campaigns" style={{fontSize:12,color:'var(--accent)'}}>View all →</Link>
        </div>
        {recent.length === 0 ? (
          <div className="empty-state" style={{padding:'32px 0'}}>
            <h3>No campaigns yet</h3>
            <p style={{marginTop:8}}>Create your first campaign to get started</p>
            <Link to="/campaigns/new" className="btn btn-primary" style={{marginTop:16}}>Create Campaign</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Campaign</th>
                <th>Status</th>
                <th>Recipients</th>
                <th>Opens</th>
                <th>Clicks</th>
                <th>Sent</th>
              </tr></thead>
              <tbody>
                {recent.map(c => (
                  <tr key={c.id}>
                    <td><Link to={`/campaigns/${c.id}`} style={{color:'var(--accent)',fontWeight:500}}>{c.name}</Link></td>
                    <td><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                    <td>{(c.total_recipients || 0).toLocaleString()}</td>
                    <td>{c.sent_count > 0 ? `${((c.open_count/c.sent_count)*100).toFixed(1)}%` : '—'}</td>
                    <td>{c.sent_count > 0 ? `${((c.click_count/c.sent_count)*100).toFixed(1)}%` : '—'}</td>
                    <td style={{color:'var(--text2)',fontSize:12}}>{c.sent_at ? new Date(c.sent_at).toLocaleDateString() : '—'}</td>
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
