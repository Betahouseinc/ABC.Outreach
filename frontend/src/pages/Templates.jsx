import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', category: '', subject: '', html_body: '' });
  const [msg, setMsg] = useState('');

  const load = () => api('/api/templates').then(r => r.json()).then(setTemplates);
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    const r = await api('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    if (!r.ok) { const d = await r.json(); setMsg(d.error); return; }
    setShowNew(false);
    setForm({ name: '', category: '', subject: '', html_body: '' });
    setMsg('Template saved!');
    load();
  };

  const del = async (id, name) => {
    if (!confirm(`Delete template "${name}"?`)) return;
    await api(`/api/templates/${id}`, { method: 'DELETE' });
    if (selected?.id === id) setSelected(null);
    load();
  };

  const CATS = ['Newsletter', 'Marketing', 'Onboarding', 'Events', 'Transactional', 'Custom'];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Templates</h2>
          <p>{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Template
        </button>
      </div>

      {msg && <div className="alert alert-success" style={{ marginBottom: 20 }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '280px 1fr' : '1fr', gap: 20 }}>
        <div>
          <div className="template-grid" style={{ gridTemplateColumns: selected ? '1fr' : 'repeat(auto-fill, minmax(200px,1fr))' }}>
            {templates.map(t => (
              <div key={t.id} className={`template-card${selected?.id === t.id ? ' selected' : ''}`} onClick={() => setSelected(t === selected ? null : t)}>
                <div className="cat">{t.category || 'Custom'}</div>
                <div className="name">{t.name}</div>
                <div className="subj">{t.subject}</div>
                {!t.id.startsWith('tpl_') && (
                  <button className="btn btn-secondary btn-sm" style={{ marginTop: 10, width: '100%', color: 'var(--danger)' }} onClick={e => { e.stopPropagation(); del(t.id, t.name); }}>Delete</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {selected && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: 600 }}>{selected.name}</span>
                <span style={{ color: 'var(--text2)', fontSize: 12, marginLeft: 10 }}>{selected.subject}</span>
              </div>
              <button className="modal-close" onClick={() => setSelected(null)}>×</button>
            </div>
            <iframe srcDoc={selected.html_body} style={{ width: '100%', height: 600, border: 'none' }} title="Template preview" />
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg3)' }}>
              <p style={{ fontSize: 12, color: 'var(--text3)' }}>Variables use <span className="tag">{`{{variable_name}}`}</span> syntax — replace with your content when building campaigns.</p>
            </div>
          </div>
        )}
      </div>

      {showNew && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowNew(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>New Template</h3>
              <button className="modal-close" onClick={() => setShowNew(false)}>×</button>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Template Name</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="My Template" />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select value={form.category} onChange={e => set('category', e.target.value)}>
                  <option value="">Select...</option>
                  {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Default Subject</label>
              <input value={form.subject} onChange={e => set('subject', e.target.value)} placeholder="Subject line..." />
            </div>
            <div className="form-group">
              <label>HTML Body</label>
              <textarea value={form.html_body} onChange={e => set('html_body', e.target.value)} placeholder="Paste your HTML email here..." style={{ minHeight: 200, fontFamily: 'monospace', fontSize: 12 }} />
            </div>
            {form.html_body && (
              <details style={{ marginBottom: 16 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--accent)' }}>Preview</summary>
                <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                  <iframe srcDoc={form.html_body} style={{ width: '100%', height: 300, border: 'none' }} title="Preview" />
                </div>
              </details>
            )}
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>Save Template</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
