import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { Icon, useConfirm } from '../ui';

const STATUS_FILTERS = ['', 'pending', 'sent', 'delivered', 'bounced', 'complained', 'unsubscribed', 'suppressed', 'failed'];

function CheckItem({ kind, title, children }) {
  const icon = kind === 'ok' ? 'check' : kind === 'err' ? 'alert' : 'info';
  return (
    <li>
      <span className={`ic ${kind}`} aria-hidden="true"><Icon name={icon} size={13} strokeWidth={3} /></span>
      <span><strong>{title}</strong>{children && <p>{children}</p>}</span>
    </li>
  );
}

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
  const [dialog, confirm] = useConfirm();
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
    const resume = campaign.status === 'paused';
    const pending = counts ? counts.pending : campaign.total_recipients;
    const ok = await confirm({
      title: resume ? 'Resume sending?' : `Send to ${pending.toLocaleString()} recipient${pending === 1 ? '' : 's'}?`,
      body: resume ? 'Only recipients who have not received it yet will get this email.' : 'This sends real email. Run a Test run first if you have not.',
      confirmLabel: resume ? 'Resume sending' : 'Send now',
    });
    if (!ok) return;
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

  if (!campaign) return <p style={{ color: 'var(--text2)', padding: 20 }}>Loading…</p>;

  const canSend = campaign.status === 'draft' || campaign.status === 'paused';
  const openRate = campaign.sent_count > 0 && campaign.open_count > 0 ? `${((campaign.open_count / campaign.sent_count) * 100).toFixed(1)}%` : '—';
  const clickRate = campaign.sent_count > 0 && campaign.click_count > 0 ? `${((campaign.click_count / campaign.sent_count) * 100).toFixed(1)}%` : '—';
  const done = counts ? campaign.total_recipients - counts.pending : campaign.sent_count + campaign.failed_count;
  const progress = campaign.total_recipients > 0 ? Math.round((done / campaign.total_recipients) * 100) : 0;
  const bounced = counts ? counts.bounced + counts.complained : 0;

  return (
    <div>
      {dialog}
      <Link to="/campaigns" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500, marginBottom: 14 }}>
        <Icon name="back" size={16} /> All campaigns
      </Link>

      <div className="page-header" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h2>{campaign.name}</h2>
            <span className={`badge badge-${campaign.status}`}>{campaign.status}</span>
          </div>
          <p>“{campaign.subject}” · From {campaign.from_name} &lt;{campaign.from_email}&gt;</p>
        </div>
        {canSend && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={runTest} disabled={testing}><Icon name="checksquare" size={16} /> {testing ? 'Checking…' : 'Test run'}</button>
            <button className="btn btn-primary" onClick={sendCampaign} disabled={sending || campaign.total_recipients === 0}>
              <Icon name="send" size={16} />
              {sending ? 'Starting…' : campaign.status === 'paused' ? 'Resume sending' : `Send to ${campaign.total_recipients.toLocaleString()}`}
            </button>
          </div>
        )}
        {campaign.status === 'sending' && (
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 600 }}>Sending… {progress}%</div>
            <div className="progress-bar-wrap"><div className="progress-bar" style={{ width: `${progress}%` }} /></div>
          </div>
        )}
      </div>

      {campaign.status === 'paused' && (
        <div className="alert alert-danger" role="alert">
          <strong>Sending paused.</strong> {campaign.last_error || 'Unknown error.'} Fix the problem, then click Resume sending. Recipients already sent won't get a second copy.
        </div>
      )}
      {msg && <div className={`alert ${msg.startsWith('✓') ? 'alert-success' : 'alert-danger'}`} role="status">{msg}</div>}

      {report && (
        <section className="card" style={{ padding: 0, marginBottom: 22, display: 'flex', flexWrap: 'wrap', overflow: 'hidden' }} aria-label="Test run result">
          <div style={{ flex: '1 1 360px', padding: 24, display: 'flex', flexDirection: 'column', gap: 16, borderRight: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h3>{report.ok ? 'Ready to send' : report.errors.length === 1 ? 'Almost ready: one thing to fix' : `${report.errors.length} things to fix`}</h3>
                <p className="card-sub">Nothing was sent during this check.</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setReport(null)}>Close</button>
            </div>
            <ul className="checklist">
              {report.errors.map(e => <CheckItem key={e} kind="err" title={e} />)}
              {report.ok && <CheckItem kind="ok" title="All checks passed">Domain verified, business address set, every merge tag has a value.</CheckItem>}
              {report.warnings.map(w => <CheckItem key={w} kind="warn" title={w} />)}
            </ul>
            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div><dt className="cell-sub">Will be sent</dt><dd style={{ fontFamily: 'var(--ff-display)', fontSize: 22, fontWeight: 600 }}>{report.recipients.willSend.toLocaleString()}</dd></div>
              <div><dt className="cell-sub">Skipped</dt><dd style={{ fontFamily: 'var(--ff-display)', fontSize: 22, fontWeight: 600 }}>{report.recipients.suppressed.toLocaleString()}</dd></div>
              <div><dt className="cell-sub">Time to send</dt><dd style={{ fontFamily: 'var(--ff-display)', fontSize: 22, fontWeight: 600 }}>{report.estimatedMinutes <= 1 ? '< 1 min' : `${report.estimatedMinutes} min`}</dd></div>
            </dl>
          </div>
          {report.preview && (
            <div style={{ flex: '1 1 420px', padding: 24, background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span className="cell-sub" style={{ fontWeight: 600 }}>Preview for {report.preview.to}</span>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>Subject: <strong style={{ color: 'var(--text)' }}>{report.preview.subject}</strong></div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                <iframe srcDoc={report.preview.html} sandbox="" style={{ width: '100%', height: 340, border: 'none', display: 'block' }} title="Rendered preview" />
              </div>
            </div>
          )}
        </section>
      )}

      <div className="stats-grid">
        {[
          { label: 'Recipients', value: campaign.total_recipients?.toLocaleString() || 0 },
          { label: 'Sent', value: campaign.sent_count?.toLocaleString() || 0 },
          { label: 'Failed or bounced', value: (campaign.failed_count || 0) + bounced, color: (campaign.failed_count || bounced) ? 'var(--danger)' : undefined },
          { label: 'Open rate', value: openRate, color: openRate === '—' ? 'var(--text3)' : undefined },
          { label: 'Click rate', value: clickRate, color: clickRate === '—' ? 'var(--text3)' : undefined },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="label">{s.label}</div>
            <div className="value" style={s.color ? { color: s.color } : {}}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="tab-bar" role="tablist" aria-label="Campaign sections">
        {[['overview', 'Overview'], ['recipients', `Recipients (${campaign.total_recipients || 0})`], ['preview', 'Preview']].map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => { setTab(t); if (t === 'recipients') loadRecipients(1); }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
          {canSend && (
            <section className="card" style={{ flex: '1 1 380px' }} aria-label="Send a test">
              <h3>Send a test</h3>
              <p className="card-sub" style={{ marginBottom: 14 }}>
                Sends this email with “[TEST]” in the subject to up to 5 addresses, using the first recipient's details.
                While Amazon SES is in test mode, these addresses must be verified.
              </p>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="test-emails">Email addresses</label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <input id="test-emails" style={{ flex: '1 1 220px', width: 'auto' }} value={testEmails} onChange={e => setTestEmails(e.target.value)} placeholder="you@example.com, colleague@example.com" />
                  <button className="btn btn-primary" onClick={sendTest} disabled={testing || !testEmails.trim()}>{testing ? 'Sending…' : 'Send test'}</button>
                </div>
              </div>
              {testResult && (
                <div className="alert alert-info" style={{ marginTop: 14, marginBottom: 0 }} role="status">
                  {testResult.dryRun && <div>Test mode is on: nothing was actually sent.</div>}
                  {testResult.results.map(r => <div key={r.to}>{r.to}: {r.status}{r.error ? ` (${r.error})` : ''}</div>)}
                </div>
              )}
            </section>
          )}

          <section className="card" style={{ flex: '1 1 380px' }} aria-label="Details">
            <h3 style={{ marginBottom: 12 }}>Details</h3>
            <dl style={{ display: 'grid', gridTemplateColumns: '130px minmax(0, 1fr)', gap: '10px 16px' }}>
              <dt style={{ color: 'var(--text2)' }}>From</dt><dd>{campaign.from_name} &lt;{campaign.from_email}&gt;</dd>
              <dt style={{ color: 'var(--text2)' }}>Created</dt><dd>{new Date(campaign.created_at).toLocaleString()}</dd>
              <dt style={{ color: 'var(--text2)' }}>Sent</dt><dd>{campaign.sent_at ? new Date(campaign.sent_at).toLocaleString() : '—'}</dd>
              {counts && <><dt style={{ color: 'var(--text2)' }}>Breakdown</dt><dd style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.entries(counts).filter(([, n]) => n > 0).map(([s, n]) => <span key={s} className={`badge badge-${s}`}>{s}: {n.toLocaleString()}</span>)}
              </dd></>}
            </dl>
          </section>

          {canSend && (
            <section className="card" style={{ flex: '1 1 100%' }} aria-label="Add recipients">
              <h3 style={{ marginBottom: 12 }}>Add more recipients</h3>
              <label
                className={`upload-zone${drag ? ' drag' : ''}`}
                style={{ display: 'block', padding: 22 }}
                onDragOver={e => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={e => { e.preventDefault(); setDrag(false); uploadFile(e.dataTransfer.files[0]); }}
              >
                <Icon name="upload" size={22} style={{ color: 'var(--text3)' }} />
                <p>Drop a CSV here or click to choose a file. Duplicates are skipped.</p>
                <input type="file" accept=".csv" className="sr-only" onChange={e => { uploadFile(e.target.files[0]); e.target.value = ''; }} />
              </label>
            </section>
          )}
        </div>
      )}

      {tab === 'recipients' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="toolbar" style={{ padding: '16px 20px', margin: 0, borderBottom: '1px solid var(--border)' }}>
            <h3>Recipients ({total.toLocaleString()})</h3>
            <div className="chips" role="group" aria-label="Filter by status">
              {STATUS_FILTERS.map(s => (
                <button key={s || 'all'} className={`chip${filter === s ? ' on' : ''}`} aria-pressed={filter === s} onClick={() => loadRecipients(1, s)}>{s || 'All'}</button>
              ))}
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th scope="col" style={{ paddingLeft: 20 }}>Email</th><th scope="col">Name</th><th scope="col">Status</th><th scope="col">Opened</th><th scope="col">Clicked</th>
              </tr></thead>
              <tbody>
                {recipients.length === 0 && <tr><td colSpan={5} style={{ paddingLeft: 20, color: 'var(--text3)' }}>No recipients{filter ? ` with status “${filter}”` : ''}.</td></tr>}
                {recipients.map(r => (
                  <tr key={r.id}>
                    <td style={{ paddingLeft: 20 }}>{r.email}</td>
                    <td style={{ color: 'var(--text2)' }}>{r.name || '—'}</td>
                    <td><span className={`badge badge-${r.status}`} title={r.error_msg || ''}>{r.status}</span>{r.error_msg && <div className="cell-sub">{r.error_msg}</div>}</td>
                    <td>{r.opened ? <span style={{ color: 'var(--accent)' }}>✓ {r.open_at ? new Date(r.open_at).toLocaleString() : ''}</span> : '—'}</td>
                    <td>{r.clicked ? <span style={{ color: 'var(--accent)' }}>✓ {r.click_at ? new Date(r.click_at).toLocaleString() : ''}</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > 50 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: 16 }}>
              <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => loadRecipients(page - 1)}>← Prev</button>
              <span style={{ fontSize: 13, color: 'var(--text2)', padding: '6px 12px' }}>Page {page} of {Math.ceil(total / 50)}</span>
              <button className="btn btn-secondary btn-sm" disabled={page * 50 >= total} onClick={() => loadRecipients(page + 1)}>Next →</button>
            </div>
          )}
        </div>
      )}

      {tab === 'preview' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <iframe srcDoc={campaign.html_body} sandbox="" style={{ width: '100%', height: 640, border: 'none', display: 'block', background: '#fff' }} title="Email preview" />
        </div>
      )}
    </div>
  );
}
