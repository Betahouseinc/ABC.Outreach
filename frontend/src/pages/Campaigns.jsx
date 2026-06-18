import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api('/api/campaigns').then(r => r.json()).then(d => { setCampaigns(d); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const del = async (id, name) => {
    if (!confirm(`Delete "${name}"?`)) return;
    await api(`/api/campaigns/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Campaigns</h2>
          <p>{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''} total</p>
        </div>
        <Link to="/campaigns/new" className="btn btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Campaign
        </Link>
      </div>

      <div className="card">
        {loading ? <p style={{color:'var(--text2)',padding:'20px 0'}}>Loading...</p> : campaigns.length === 0 ? (
          <div className="empty-state">
            <h3>No campaigns yet</h3>
            <p>Create your first email campaign</p>
            <Link to="/campaigns/new" className="btn btn-primary" style={{marginTop:16}}>Create Campaign</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Name</th>
                <th>Status</th>
                <th>Recipients</th>
                <th>Sent</th>
                <th>Opens</th>
                <th>Clicks</th>
                <th>Failed</th>
                <th>Created</th>
                <th></th>
              </tr></thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/campaigns/${c.id}`} style={{color:'var(--accent)',fontWeight:500}}>{c.name}</Link>
                      <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>{c.subject}</div>
                    </td>
                    <td><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                    <td>{(c.total_recipients||0).toLocaleString()}</td>
                    <td>{(c.sent_count||0).toLocaleString()}</td>
                    <td>
                      {c.sent_count > 0 ? (
                        <span style={{color:'var(--success)'}}>{c.open_count} ({((c.open_count/c.sent_count)*100).toFixed(1)}%)</span>
                      ) : '—'}
                    </td>
                    <td>
                      {c.sent_count > 0 ? (
                        <span style={{color:'var(--accent)'}}>{c.click_count} ({((c.click_count/c.sent_count)*100).toFixed(1)}%)</span>
                      ) : '—'}
                    </td>
                    <td style={{color: c.failed_count > 0 ? 'var(--danger)' : 'var(--text2)'}}>{c.failed_count || 0}</td>
                    <td style={{color:'var(--text2)',fontSize:12}}>{new Date(c.created_at).toLocaleDateString()}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => del(c.id, c.name)} style={{color:'var(--danger)',borderColor:'rgba(239,68,68,0.3)'}}>Delete</button>
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
