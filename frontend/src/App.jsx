import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import NewCampaign from './pages/NewCampaign';
import CampaignDetail from './pages/CampaignDetail';
import Templates from './pages/Templates';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Admin from './pages/Admin';
import Settings from './pages/Settings';
import { useAuth } from './auth';
import Logo from './Logo';
import { Icon } from './ui';
import { api } from './api';

const navItems = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/campaigns', label: 'Campaigns', icon: 'send' },
  { to: '/templates', label: 'Templates', icon: 'template' },
];

export default function App() {
  const { session, signOut, recovering, mustChangePassword } = useAuth();
  const [settings, setSettings] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (!session) { setSettings(null); return; }
    api('/api/settings').then(r => (r.ok ? r.json() : null)).then(setSettings).catch(() => setSettings(null));
  }, [session]);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  if (session === undefined) return <div className="loading-screen">Loading…</div>;
  if (!session && location.pathname === '/signup') return <Signup />;
  if (!session || recovering || mustChangePassword) return <Login />;

  const isAdmin = !!settings?.is_admin;
  const email = session.user?.email || '';
  const link = ({ isActive }) => 'nav-item' + (isActive ? ' active' : '');

  return (
    <div className="layout">
      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <div className="sidebar-logo">
          <NavLink to="/" aria-label="Dashboard"><Logo height={60} /></NavLink>
          <button className="menu-toggle" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
            <Icon name="menu" size={20} />
          </button>
        </div>
        <nav aria-label="Main">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={link}>
              <Icon name={item.icon} /> {item.label}
            </NavLink>
          ))}
          {isAdmin && <NavLink to="/team" className={link}><Icon name="team" /> Team</NavLink>}
          <NavLink to="/settings" className={link}><Icon name="settings" /> Settings</NavLink>
        </nav>
        <div className="sidebar-foot">
          {settings && (
            <div className="status-card">
              <span className="k">Sending status</span>
              {settings.aws_connected === false ? (
                <>
                  <span className="v"><span className="dot dot-test" aria-hidden="true" />Not connected</span>
                  <span className="s"><NavLink to="/settings">Connect your SES account</NavLink></span>
                </>
              ) : (
                <>
                  <span className="v"><span className={`dot ${settings.dry_run ? 'dot-test' : 'dot-live'}`} aria-hidden="true" />{settings.dry_run ? 'Test mode' : 'Live'}</span>
                  <span className="s">Amazon SES · {settings.send_rate_per_sec} email{settings.send_rate_per_sec === 1 ? '' : 's'}/sec</span>
                </>
              )}
            </div>
          )}
          <div className="user-row">
            <span className="avatar" aria-hidden="true">{email.charAt(0)}</span>
            <span className="who"><b title={email}>{email}</b><span>{isAdmin ? 'Admin' : 'Member'}</span></span>
          </div>
          <button className="nav-item" onClick={signOut}><Icon name="signout" /> Sign out</button>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard settings={settings} />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/campaigns/new" element={<NewCampaign />} />
          <Route path="/campaigns/:id" element={<CampaignDetail />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/settings" element={<Settings onChange={setSettings} />} />
          {isAdmin && <Route path="/team" element={<Admin />} />}
          <Route path="/signup" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
