import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';

const STATUS_FILTERS = ['', 'pending', 'sent', 'delivered', 'bounced', 'complained', 'unsubscribed', 'suppressed', 'failed'];

export default function CampaignDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [counts, setCounts] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState('overview');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [drag, setDrag] = useState(false);
  const [report, setReport] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testEmails, setTestEmails] = useState('');
  const [testResult, setTestResult] = useState(null);
  const fileRef = useRef();
  const pollRef = useRef();

  const load = async () => {
    const r = await api(`/api/campaigns/${id}`);
    if (!r.ok) { nav('/campaigns'); return; }
    setCampaign(await r.json());
  };

  const loadProgress = async () => {
    const r = await api(`/api/campaigns/${id}/progress`);
    if (!r.ok) return null;
    const d = await r.json();
    setCampaign(prev => ({ ...prev, ...d }));
    setCounts(d.status_counts);
    return d;
  };

  const loadRecipients = async (p = 1, status = filter) => {
    const qs = new URLSearchParams({ page: p, limit: 50 });
    if (status) qs.set('status', status);
    const r = await api(`/api/campaigns/${id}/recipients?${qs}`);
    const d = await r.json();
    setRecipients(d.recipients || []);
    setTotal(d.total || 0);
    setPage(p);
    setFilter(status);
  };

  useEffect(() => { load(); loadProgress(); loadRecipients(1, ''); }, [id]);

  useEffect(() => {
    if (campaign?.status === 'sending') {
      pollRef.current = setInterval(async () => {
        const d = await loadProgress();
        if (d && d.status !== 'sending') { clearInterval(pollRef.current); loadRecipients(1); }
      }, 2000);
    }
    return () => clearInterval(pollRef.current);
  }, [campaign?.status]);

  const sendCampaign = async () => {
    const verb = campaign.status === 'paused' ? 'Resume sending this campaign' : 'Send this campaign to all pending recipients';
    if (!confirm(`${verb}? This sends real email.`)) return;
    setSending(true); setMsg('');
    const r = await api(`/api/campaigns/${id}/send`, { method: 'POST' });
    const d = await r.json();
    setSending(false);
    if (!r.ok) { setMsg(d.error); return; }
    setMsg(`✓ Sending started: ${d.total.toLocaleString()} pending recipients`);
    load(); loadProgress();
  };

  const runTest = async () => {
    setTesting(true); setReport(null); setMsg('');
    const r = await api(`/api/campaigns/${id}/test-run`, { method: 'POST' });
    const d = await r.json();
    setTesting(false);
    if (!r.ok) { setMsg(d.error); return; }
    setReport(d);
  };

  const sendTest = async () => {
    const emails = testEmails.split(/[\s,;]+/).filter(Boolean);
    setTesting(true); setTestResult(null); setMsg('');
    const r = await api(`/api/campaigns/${id}/send-test`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emails })
    });
    const d = await r.json();
    setTesting(false);
    if (!r.ok) { setMsg(d.error); return; }
    setTestResult(d);
  };

  const uploadFile = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const r = await api(`/api/campaigns/${id}/upload-recipients`, { method: 'POST', body: fd });
    const d = await r.json();
    if (!r.ok) { setMsg(d.error); return; }
    const skipped = d.skipped ? d.skipped.invalid + d.skipped.duplicates : 0;
    setMsg(`✓ ${d.added} recipients added (${d.total} total)${skipped ? `, ${skipped} skipped (invalid or duplicate)` : ''}`);
    load(); loadProgress(); loadRecipients(1);
  };

  if (!campaign) return <p style={{ color: 'var(--text2)', padding: 20 }}>Loading...</p>;

  const canSend = campaign.status === 'draft' || campaign.status === 'paused';
  const openRate = campaign.sent_count > 0 ? ((campaign.open_count / campaign.sent_count) * 100).toFixed(1) : 0;
  const clickRate = campaign.sent_count > 0 ? ((campaign.click_count / campaign.sent_count) * 100).toFixed(1) : 0;
  const done = counts ? campaign.total_recipients - counts.pending : campaign.sent_count + campaign.failed_count;
  const progress = campaign.total_recipients > 0 ? Math.round((done / campaign.total_recipients) * 100) : 0;
  const bounced = counts ? counts.bounced + counts.complained : 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => nav('/campaigns')}>← Back</button>
            <span className={`badge badge-${campaign.status}`}>{campaign.status}</span>
          </div>
          <h2>{campaign.name}</h2>
          <p>{campaign.subject} · From: {campaign.from_name} &lt;{campaign.from_email}&gt;</p>
        </div>
        {canSend && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={runTest} disabled={testing}>{testing ? 'Checking…' : 'Test run'}</button>
            <button className="btn btn-primary" onClick={sendCampaign} disabled={sending || campaign.total_recipients === 0}>
              {sending ? 'Starting...' : campaign.status === 'paused' ? 'Resume sending' : `Send to ${campaign.total_recipients.toLocaleString()} recipients`}
            </button>
          </div>
        )}
        {campaign.status === 'sending' && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 600 }}>Sending... {progress}%</div>
            <div className="progress-bar-wrap" style={{ width: 200, marginTop: 8 }}>
              <div className="progress-bar" style={{ width: `${progress}%`, background: 'var(--warning)' }} />
            </div>
          </div>
        )}
      </div>

      {campaign.status === 'paused' && (
        <div className="alert alert-danger">
          <strong>Sending paused.</strong> {campaign.last_error || 'Unknown error.'} Fix the problem, then click Resume sending. Recipients already sent won't get a second copy.
        </div>
      )}
      {msg && <div className={`alert ${msg.startsWith('✓') ? 'alert-success' : 'alert-danger'}`} style={{ marginBottom: 20 }}>{msg}</div>}

      {report && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Test run {report.ok ? '✓ ready to send' : '✕ not ready'}</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => setReport(null)}>Close</button>
          </div>
          {report.errors.map(e => <div key={e} className="alert alert-danger" style={{ marginBottom: 8 }}>{e}</div>)}
          {report.warnings.map(w => <div key={w} className="alert alert-info" style={{ marginBottom: 8 }}>{w}</div>)}
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: '8px 0 16px' }}>
            {report.recipients.willSend.toLocaleString()} will be sent · {report.recipients.suppressed.toLocaleString()} skipped (suppressed) ·
            about {report.estimatedMinutes} min at {report.ratePerSec}/sec via {report.provider.toUpperCase()}
          </p>
          {report.preview && (
            <>
              <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Preview for {report.preview.to} · Subject: <strong style={{ color: 'var(--text)' }}>{report.preview.subject}</strong></p>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                <iframe srcDoc={report.preview.html} sandbox="" style={{ width: '100%', height: 420, border: 'none' }} title="Rendered preview" />
              </div>
            </>
          )}
        </div>
      )}

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {[
          { label: 'Recipients', value: campaign.total_recipients?.toLocaleString() || 0 },
          { label: 'Sent', value: campaign.sent_count?.toLocaleString() || 0, color: 'var(--success)' },
          { label: 'Failed / bounced', value: (campaign.failed_count || 0) + bounced, color: (campaign.failed_count || bounced) ? 'var(--danger)' : undefined },
          { label: 'Open Rate', value: `${openRate}%`, color: 'var(--success)' },
          { label: 'Click Rate', value: `${clickRate}%`, color: 'var(--accent)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="label">{s.label}</div>
            <div className="value" style={s.color ? { color: s.color } : {}}>{s.value}</div>
          </div>
        ))}
      </div>

      {campaign.status === 'sending' && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Sending progress</span>
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>{done} / {campaign.total_recipients}</span>
          </div>
          <div className="progress-bar-wrap" style={{ height: 8 }}>
            <div className="progress-bar" style={{ width: `${progress}%`, background: 'var(--warning)' }} />
          </div>
        </div>
      )}

      <div className="tab-bar">
        {['overview', 'recipients', 'preview'].map(t => (
          <div key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => { setTab(t); if (t === 'recipients') loadRecipients(1); }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </div>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 16, fontWeight: 600 }}>Campaign Details</h3>
          {[
            ['Status', <span className={`badge badge-${campaign.status}`}>{campaign.status}</span>],
            ['Subject', campaign.subject],
            ['From', `${campaign.from_name} <${campaign.from_email}>`],
            ['Created', new Date(campaign.created_at).toLocaleString()],
            ['Sent At', campaign.sent_at ? new Date(campaign.sent_at).toLocaleString() : '—'],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ width: 120, fontSize: 12, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>{label}</span>
              <span style={{ fontSize: 14, color: 'var(--text)' }}>{val}</span>
            </div>
          ))}

          {counts && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 16 }}>
              {Object.entries(counts).filter(([, n]) => n > 0).map(([s, n]) => (
                <span key={s} className={`badge badge-${s}`}>{s}: {n.toLocaleString()}</span>
              ))}
            </div>
          )}

          {canSend && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Send test</h3>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
                Sends this email (subject starts with [TEST]) to up to 5 addresses, using the first recipient's merge-tag values.
                While Amazon SES is in sandbox mode, these addresses must be verified in SES. Domain and address checks: <Link to="/settings" style={{ color: 'var(--accent)' }}>Settings</Link>.
              </p>
              <div style={{ display: 'flex', gap: 8, maxWidth: 640 }}>
                <div className="form-group" style={{ flex: 1, margin: 0 }}>
                  <input value={testEmails} onChange={e => setTestEmails(e.target.value)} placeholder="you@example.com, colleague@example.com" />
                </div>
                <button className="btn btn-secondary" onClick={sendTest} disabled={testing || !testEmails.trim()}>{testing ? 'Sending…' : 'Send test'}</button>
              </div>
              {testResult && (
                <div className="alert alert-info" style={{ marginTop: 12 }}>
                  {testResult.dryRun && <div>Dry run is on: nothing was actually sent.</div>}
                  {testResult.results.map(r => <div key={r.to}>{r.to}: {r.status}{r.error ? ` (${r.error})` : ''}</div>)}
                </div>
              )}

              <h3 style={{ fontSize: 14, fontWeight: 600, margin: '24px 0 12px' }}>Add more recipients</h3>
              <div
                className={`upload-zone${drag ? ' drag' : ''}`}
                style={{ padding: 20 }}
                onDragOver={e => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={e => { e.preventDefault(); setDrag(false); uploadFile(e.dataTransfer.files[0]); }}
                onClick={() => fileRef.current?.click()}
              >
                <p style={{ fontSize: 13 }}>Drop a CSV or click to add recipients</p>
                <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { uploadFile(e.target.files[0]); e.target.value = ''; }} />
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'recipients' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Recipients ({total.toLocaleString()})</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUS_FILTERS.map(s => (
                <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => loadRecipients(1, s)} style={{ fontSize: 11 }}>
                  {s || 'All'}
                </button>
              ))}
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Email</th><th>Name</th><th>Status</th><th>Opened</th><th>Clicked</th>
              </tr></thead>
              <tbody>
                {recipients.map(r => (
                  <tr key={r.id}>
                    <td>{r.email}</td>
                    <td style={{ color: 'var(--text2)' }}>{r.name || '—'}</td>
                    <td><span className={`badge badge-${r.status}`} title={r.error_msg || ''}>{r.status}</span></td>
                    <td>{r.opened ? <span style={{ color: 'var(--success)' }}>✓ {r.open_at ? new Date(r.open_at).toLocaleString() : ''}</span> : '—'}</td>
                    <td>{r.clicked ? <span style={{ color: 'var(--accent)' }}>✓ {r.click_at ? new Date(r.click_at).toLocaleString() : ''}</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > 50 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => loadRecipients(page - 1)}>← Prev</button>
              <span style={{ fontSize: 13, color: 'var(--text2)', padding: '6px 12px' }}>Page {page} of {Math.ceil(total / 50)}</span>
              <button className="btn btn-secondary btn-sm" disabled={page * 50 >= total} onClick={() => loadRecipients(page + 1)}>Next →</button>
            </div>
          )}
        </div>
      )}

      {tab === 'preview' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <iframe srcDoc={campaign.html_body} sandbox="" style={{ width: '100%', height: 600, border: 'none' }} title="Email preview" />
        </div>
      )}
    </div>
  );
}
