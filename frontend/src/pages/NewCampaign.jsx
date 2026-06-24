import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const STEPS = ['Details', 'Template', 'Recipients', 'Review'];

export default function NewCampaign() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [campaignId, setCampaignId] = useState(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef();

  const [form, setForm] = useState({
    name: '', subject: '', from_name: '', from_email: '',
    template_id: '', html_body: ''
  });

  useEffect(() => { api('/api/templates').then(r => r.json()).then(setTemplates); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectTemplate = (t) => {
    set('template_id', t.id);
    set('html_body', t.html_body);
    if (!form.subject) set('subject', t.subject);
  };

  const createCampaign = async () => {
    setError('');
    const r = await api('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    const d = await r.json();
    if (!r.ok) { setError(d.error); return false; }
    setCampaignId(d.id);
    return true;
  };

  const handleNext = async () => {
    if (step === 0) {
      if (!form.name || !form.subject || !form.from_name || !form.from_email) {
        setError('All fields are required'); return;
      }
    }
    if (step === 1 && !form.html_body) { setError('Pick a template or paste HTML'); return; }
    if (step === 2) {
      if (!campaignId) { const ok = await createCampaign(); if (!ok) return; }
      if (!uploadResult) { setError('Upload a CSV of recipients first'); return; }
    }
    setError('');
    setStep(s => s + 1);
  };

  const uploadFile = async (file) => {
    if (!file) return;
    if (!campaignId) {
      if (!form.name || !form.subject || !form.from_name || !form.from_email || !form.html_body) {
        setError('Complete steps 1 and 2 before uploading'); return;
      }
      const ok = await createCampaign();
      if (!ok) return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const r = await api(`/api/campaigns/${campaignId}/upload-recipients`, { method: 'POST', body: fd });
    const d = await r.json();
    setUploading(false);
    if (!r.ok) { setError(d.error); return; }
    setUploadResult(d);
    setError('');
  };

  const finish = () => nav(`/campaigns/${campaignId}`);

  return (
    <div>
      <div className="page-header">
        <div><h2>New Campaign</h2></div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
              background: i < step ? 'var(--success)' : i === step ? 'var(--accent)' : 'var(--bg3)',
              color: i <= step ? '#fff' : 'var(--text3)',
            }}>{i < step ? '✓' : i + 1}</div>
            <span style={{ fontSize: 13, fontWeight: i === step ? 600 : 400, color: i === step ? 'var(--text)' : 'var(--text2)' }}>{s}</span>
            {i < STEPS.length - 1 && <div style={{ width: 24, height: 1, background: 'var(--border)', marginLeft: 4 }} />}
          </div>
        ))}
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card">
        {step === 0 && (
          <div>
            <h3 style={{ marginBottom: 20, fontSize: 15 }}>Campaign Details</h3>
            <div className="form-group">
              <label>Campaign Name</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. June Newsletter" />
            </div>
            <div className="form-group">
              <label>Email Subject</label>
              <input value={form.subject} onChange={e => set('subject', e.target.value)} placeholder="Your subject line..." />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>From Name</label>
                <input value={form.from_name} onChange={e => set('from_name', e.target.value)} placeholder="Your Name / Company" />
              </div>
              <div className="form-group">
                <label>From Email</label>
                <input type="email" value={form.from_email} onChange={e => set('from_email', e.target.value)} placeholder="you@yourdomain.com" />
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: -10 }}>Note: From email must be verified in your Resend account.</p>
          </div>
        )}

        {step === 1 && (
          <div>
            <h3 style={{ marginBottom: 6, fontSize: 15 }}>Choose a Template</h3>
            <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>Select a built-in template or paste your own HTML below.</p>
            <div className="template-grid" style={{ marginBottom: 24 }}>
              {templates.map(t => (
                <div key={t.id} className={`template-card${form.template_id === t.id ? ' selected' : ''}`} onClick={() => selectTemplate(t)}>
                  <div className="cat">{t.category}</div>
                  <div className="name">{t.name}</div>
                  <div className="subj">{t.subject}</div>
                </div>
              ))}
            </div>
            <div className="form-group">
              <label>Or paste custom HTML</label>
              <textarea value={form.html_body} onChange={e => set('html_body', e.target.value)} placeholder="<!DOCTYPE html>..." style={{ minHeight: 160, fontFamily: 'monospace', fontSize: 12 }} />
            </div>
            {form.html_body && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--accent)' }}>Preview email</summary>
                <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                  <iframe srcDoc={form.html_body} style={{ width: '100%', height: 400, border: 'none' }} title="Email preview" />
                </div>
              </details>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <h3 style={{ marginBottom: 6, fontSize: 15 }}>Upload Recipients</h3>
            <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>Upload a CSV with at minimum an <code style={{ background: 'var(--bg3)', padding: '1px 6px', borderRadius: 4 }}>email</code> column. Optionally include a <code style={{ background: 'var(--bg3)', padding: '1px 6px', borderRadius: 4 }}>name</code> column.</p>

            {uploadResult ? (
              <div className="alert alert-success">
                ✓ {uploadResult.added.toLocaleString()} recipients added — {uploadResult.total.toLocaleString()} total in campaign.
                <button style={{ marginLeft: 16, background: 'none', border: 'none', color: 'var(--success)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }} onClick={() => setUploadResult(null)}>Upload another</button>
              </div>
            ) : (
              <label
                className={`upload-zone${drag ? ' drag' : ''}`}
                style={{ cursor: 'pointer', display: 'block' }}
                onDragOver={e => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={e => { e.preventDefault(); setDrag(false); uploadFile(e.dataTransfer.files[0]); }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <p>{uploading ? 'Uploading...' : 'Drop your CSV here or click to browse'}</p>
                <p style={{ fontSize: 11, marginTop: 4 }}>Columns: email, name (optional)</p>
                <input type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { uploadFile(e.target.files[0]); e.target.value = ''; }} />
              </label>
            )}

            <div style={{ marginTop: 20, padding: 16, background: 'var(--bg3)', borderRadius: 8 }}>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, fontWeight: 600 }}>CSV format example:</p>
              <pre style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}{...{}}>{'email,name\njohn@example.com,John Smith\njane@example.com,Jane Doe'}</pre>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h3 style={{ marginBottom: 20, fontSize: 15 }}>Review & Finish</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              {[
                ['Campaign Name', form.name],
                ['Subject', form.subject],
                ['From', `${form.from_name} <${form.from_email}>`],
                ['Recipients', uploadResult ? `${uploadResult.total.toLocaleString()} contacts` : '—'],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: 140, fontSize: 12, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>{label}</span>
                  <span style={{ fontSize: 14, color: 'var(--text)' }}>{val}</span>
                </div>
              ))}
            </div>
            <div className="alert alert-info" style={{ marginTop: 20 }}>
              Campaign saved as draft. You can send it from the campaign detail page.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" onClick={() => step > 0 ? setStep(s => s - 1) : nav('/campaigns')} disabled={uploading}>
            {step === 0 ? 'Cancel' : '← Back'}
          </button>
          {step < 3 ? (
            <button className="btn btn-primary" onClick={handleNext} disabled={uploading}>
              {step === 2 && !uploadResult ? 'Skip for now →' : 'Next →'}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={finish}>Go to Campaign →</button>
          )}
        </div>
      </div>
    </div>
  );
}
