import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

// Edit dialog for a draft or paused campaign: details, email HTML (or load a template), live preview.
export default function EditCampaign({ campaign, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: campaign.name, subject: campaign.subject, from_name: campaign.from_name,
    from_email: campaign.from_email, html_body: campaign.html_body, template_id: campaign.template_id || '',
  });
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const firstRef = useRef();

  useEffect(() => {
    firstRef.current?.focus();
    api('/api/templates').then(r => r.json()).then(d => Array.isArray(d) && setTemplates(d)).catch(() => {});
    const esc = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const useTemplate = id => {
    const t = templates.find(x => x.id === id);
    if (!t) { set('template_id', ''); return; }
    setForm(f => ({ ...f, template_id: t.id, html_body: t.html_body }));
  };

  const save = async () => {
    setError(''); setBusy(true);
    const r = await api(`/api/campaigns/${campaign.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(d.error || 'Could not save'); return; }
    onSaved(d);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-title" style={{ maxWidth: 1080 }}>
        <div className="modal-header">
          <h3 id="edit-title">Edit campaign</h3>
          <button className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}

        <div className="form-row">
          <div className="form-group"><label htmlFor="ec-name">Campaign name</label>
            <input id="ec-name" ref={firstRef} value={form.name} onChange={e => set('name', e.target.value)} /></div>
          <div className="form-group"><label htmlFor="ec-subject">Email subject</label>
            <input id="ec-subject" value={form.subject} onChange={e => set('subject', e.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label htmlFor="ec-from-name">From name</label>
            <input id="ec-from-name" value={form.from_name} onChange={e => set('from_name', e.target.value)} /></div>
          <div className="form-group"><label htmlFor="ec-from-email">From email</label>
            <input id="ec-from-email" type="email" value={form.from_email} onChange={e => set('from_email', e.target.value)} />
            <p className="form-hint">Must be on a verified sending domain, and ideally a mailbox that receives replies.</p></div>
        </div>

        <div className="form-group">
          <label htmlFor="ec-template">Start from a template (replaces the email content below)</label>
          <select id="ec-template" value={form.template_id} onChange={e => useTemplate(e.target.value)}>
            <option value="">Keep current content</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <div className="form-group" style={{ flex: '1 1 420px', marginBottom: 0 }}>
            <label htmlFor="ec-html">Email HTML</label>
            <textarea id="ec-html" value={form.html_body} onChange={e => set('html_body', e.target.value)}
              style={{ minHeight: 360, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 12.5 }} />
            <p className="form-hint">
              Merge tags: <span className="tag">{'{{first_name}}'}</span><span className="tag">{'{{name}}'}</span><span className="tag">{'{{company_name}}'}</span><span className="tag">{'{{unsubscribe_url}}'}</span> and any CSV column.
              Replace every other <span className="tag">{'{{…}}'}</span> placeholder with your own text; Test run lists any that are left.
            </p>
          </div>
          <div style={{ flex: '1 1 420px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Preview</span>
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
              <iframe srcDoc={form.html_body} sandbox="" title="Email preview" style={{ width: '100%', height: 400, border: 'none', display: 'block' }} />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}
