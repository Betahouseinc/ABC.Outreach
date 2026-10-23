// Shared UI: icons, an in-app confirm dialog (replaces window.confirm) and a row actions menu.
import { useState, useRef, useEffect, useCallback } from 'react';

const PATHS = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  send: <><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></>,
  template: <><path d="M4 4h16v16H4z" /><path d="M4 9h16" /><path d="M9 9v11" /></>,
  team: <><path d="M3 20a6 6 0 0 1 12 0" /><circle cx="9" cy="8" r="4" /><path d="M16 4.5a4 4 0 0 1 0 7" /><path d="M21 20a6 6 0 0 0-3.5-5.5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  signout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  more: <><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>,
  check: <path d="M5 12l5 5L20 7" />,
  alert: <path d="M12 7v6M12 17h.01" />,
  info: <path d="M12 8h.01M12 12v5" />,
  back: <path d="M15 18l-6-6 6-6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  checksquare: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  shield: <><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  mail: <><path d="M4 4h16v16H4z" /><path d="M4 8l8 5 8-5" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></>,
};

export function Icon({ name, size = 18, strokeWidth = 1.9, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {PATHS[name]}
    </svg>
  );
}

// Promise-based confirm: const [dialog, confirm] = useConfirm(); ... if (await confirm({...})) ...; render {dialog}.
export function useConfirm() {
  const [req, setReq] = useState(null);
  const confirm = useCallback(opts => new Promise(resolve => setReq({ ...opts, resolve })), []);
  const close = v => { req?.resolve(v); setReq(null); };
  const dialog = req ? <ConfirmDialog {...req} onClose={close} /> : null;
  return [dialog, confirm];
}

function ConfirmDialog({ title, body, confirmLabel = 'Confirm', danger = false, onClose }) {
  const okRef = useRef();
  useEffect(() => {
    okRef.current?.focus();
    const onKey = e => { if (e.key === 'Escape') onClose(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose(false)}>
      <div className="modal sm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="modal-header"><h3 id="confirm-title">{title}</h3></div>
        {body && <div className="modal-body">{body}</div>}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onClose(false)}>Cancel</button>
          <button ref={okRef} className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => onClose(true)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// "⋯" menu. items: [{ label, onClick, danger, disabled, title }]
// The menu is position: fixed so a table's scroll box can't clip it.
export function RowMenu({ label, items }) {
  const [pos, setPos] = useState(null);
  const ref = useRef();
  const btn = useRef();
  const open = !!pos;
  const toggle = () => {
    if (open) { setPos(null); return; }
    const r = btn.current.getBoundingClientRect();
    const height = items.length * 38 + 14;
    const below = r.bottom + 6 + height < window.innerHeight;
    setPos({ top: below ? r.bottom + 6 : r.top - 6 - height, left: Math.max(8, r.right - 180) });
  };
  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const off = e => { if (!ref.current?.contains(e.target)) close(); };
    const esc = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', off);
    window.addEventListener('keydown', esc);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', off); window.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close);
    };
  }, [open]);
  const setOpen = v => { if (!v) setPos(null); };
  return (
    <div className="menu-wrap" ref={ref}>
      <button ref={btn} className="btn btn-icon" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        <Icon name="more" size={18} strokeWidth={2.6} />
      </button>
      {open && (
        <div className="menu" role="menu" style={{ position: 'fixed', top: pos.top, left: pos.left, right: 'auto' }}>
          {items.map(it => (
            <button key={it.label} role="menuitem" className={it.danger ? 'danger' : ''} disabled={it.disabled} title={it.title}
              onClick={() => { setOpen(false); it.onClick(); }}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
