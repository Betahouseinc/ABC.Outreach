import { useState } from 'react';
import { useAuth } from '../auth';
import Logo from '../Logo';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) setError(error.message);
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          <h1 style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'8px'}}><Logo size={24} /> exo-mail</h1>
          <span>Email Marketing</span>
        </div>
        <h2 className="login-title">Sign in</h2>
        {error && <div className="login-error">{error}</div>}
        <label className="login-label">Email
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="login-label">Password
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        <button className="btn btn-primary" disabled={busy} type="submit" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
