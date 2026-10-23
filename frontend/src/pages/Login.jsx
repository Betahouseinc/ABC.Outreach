import { useState } from 'react';
import { useAuth } from '../auth';
import Logo from '../Logo';

// Sign in, "forgot password", and setting a new password after the reset email.
export default function Login() {
  const { signIn, sendReset, setNewPassword, recovering } = useAuth();
  const [mode, setMode] = useState('signin'); // signin | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setError(''); setNote(''); setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const submitSignIn = e => { e.preventDefault(); run(async () => { const { error } = await signIn(email, password); if (error) setError(error.message); }); };
  const submitReset = e => {
    e.preventDefault();
    run(async () => {
      const { error } = await sendReset(email);
      if (error) setError(error.message);
      else setNote('If that address has an account, a reset link is on its way. Check your inbox.');
    });
  };
  const submitNew = e => {
    e.preventDefault();
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    run(async () => { const { error } = await setNewPassword(password); if (error) setError(error.message); });
  };

  return (
    <div className="login-wrap">
      {recovering ? (
        <form className="login-card" onSubmit={submitNew}>
          <div className="login-logo"><Logo height={72} /></div>
          <h1 className="login-title">Choose a new password</h1>
          {error && <div className="login-error" role="alert">{error}</div>}
          <label className="login-label">New password
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          </label>
          <button className="btn btn-primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save password'}</button>
        </form>
      ) : mode === 'reset' ? (
        <form className="login-card" onSubmit={submitReset}>
          <div className="login-logo"><Logo height={72} /></div>
          <h1 className="login-title">Reset your password</h1>
          <p className="login-sub">We'll email you a link to choose a new one.</p>
          {error && <div className="login-error" role="alert">{error}</div>}
          {note && <div className="login-note" role="status">{note}</div>}
          <label className="login-label">Email
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <button className="btn btn-primary" disabled={busy} type="submit">{busy ? 'Sending…' : 'Send reset link'}</button>
          <button type="button" className="link-btn" onClick={() => { setMode('signin'); setError(''); setNote(''); }}>Back to sign in</button>
        </form>
      ) : (
        <form className="login-card" onSubmit={submitSignIn}>
          <div className="login-logo"><Logo height={72} /></div>
          <h1 className="login-title">Sign in</h1>
          <p className="login-sub">New to eXomail? <a href="/signup">Create an account</a></p>
          {error && <div className="login-error" role="alert">{error}</div>}
          <label className="login-label">Email
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label className="login-label">Password
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
          </label>
          <button className="btn btn-primary" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
          <button type="button" className="link-btn" onClick={() => { setMode('reset'); setError(''); }}>Forgot password?</button>
        </form>
      )}
    </div>
  );
}
