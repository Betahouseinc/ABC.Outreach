import { useState } from 'react';
import { useAuth } from '../auth';
import { api } from '../api';
import Logo from '../Logo';

const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Self-service sign-up: company + email → confirmation email → choose a password (with ?token=) → signed in.
export default function Signup() {
  const { signIn } = useAuth();
  const token = new URLSearchParams(window.location.search).get('token');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [agree, setAgree] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const start = async e => {
    e.preventDefault();
    setError(''); setBusy(true);
    const r = await post('/api/signup/start', { company, email }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r || !r.ok) { setError(d.error || 'Something went wrong. Try again.'); return; }
    setSent(true);
  };

  const complete = async e => {
    e.preventDefault();
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    setError(''); setBusy(true);
    const r = await post('/api/signup/complete', { token, password }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { setBusy(false); setError(d.error || 'Something went wrong. Try again.'); return; }
    const { error } = await signIn(d.email, password);
    setBusy(false);
    if (error) setError(error.message);
    // On success the session appears and App's /signup route redirects to the dashboard.
  };

  return (
    <div className="login-wrap">
      {token ? (
        <form className="login-card" onSubmit={complete}>
          <div className="login-logo"><Logo height={72} /></div>
          <h1 className="login-title">Choose a password</h1>
          <p className="login-sub">Your email is confirmed. Set a password to finish creating your account.</p>
          {error && <div className="login-error" role="alert">{error}</div>}
          <label className="login-label">Password
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          </label>
          <button className="btn btn-primary" disabled={busy} type="submit">{busy ? 'Creating account…' : 'Create account'}</button>
        </form>
      ) : sent ? (
        <div className="login-card">
          <div className="login-logo"><Logo height={72} /></div>
          <h1 className="login-title">Check your email</h1>
          <p className="login-sub">We sent a confirmation link to <strong>{email}</strong>. It works for 24 hours.</p>
          <a className="link-btn" href="/">Back to sign in</a>
        </div>
      ) : (
        <form className="login-card" onSubmit={start}>
          <div className="login-logo"><Logo height={72} /></div>
          <h1 className="login-title">Create your account</h1>
          <p className="login-sub">You'll send through your own Amazon SES account, which you connect after signing up.</p>
          {error && <div className="login-error" role="alert">{error}</div>}
          <label className="login-label">Company name
            <input value={company} onChange={e => setCompany(e.target.value)} required maxLength={120} autoComplete="organization" />
          </label>
          <label className="login-label">Work email
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--text2)' }}>
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} required style={{ marginTop: 3 }} />
            I'll only email people who agreed to hear from me, and I won't use bought or scraped lists.
          </label>
          <button className="btn btn-primary" disabled={busy || !agree} type="submit">{busy ? 'Sending…' : 'Continue'}</button>
          <a className="link-btn" href="/">Already have an account? Sign in</a>
        </form>
      )}
    </div>
  );
}
