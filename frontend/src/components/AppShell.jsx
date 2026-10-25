import { useEffect, useState } from 'react';
import { NAV_ITEMS, ROLE_LABELS } from '../lib/constants.js';
import { fmtCountdown } from '../lib/domain.js';
import { useApiConfig } from '../lib/hooks.js';
import { Avatar } from './ui.jsx';

const PORTAL_LABELS = {
  org: 'Organizer Portal',
  adm: 'Admin Portal',
  emp: 'Employee Portal',
};

export default function AppShell({
  role,
  active,
  onNavigate,
  title,
  subtitle,
  user,
  company,
  photo,
  onLogout,
  remainingMs,
  children,
  actions,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const config = useApiConfig();
  const items = NAV_ITEMS[role] || [];
  const cloud = Boolean(config.url);

  useEffect(() => {
    setMenuOpen(false);
  }, [active]);

  const navigate = (key) => {
    onNavigate(key);
    setMenuOpen(false);
  };

  return (
    <div className="app-shell">
      <div className={`sidebar-backdrop ${menuOpen ? 'show' : ''}`} onClick={() => setMenuOpen(false)} role="presentation" />
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-head">
          <a className="brand" href="/" aria-label="Get-Attended home">
            <img src="/brand/logo.png" alt="" className="brand-logo" />
            <span className="brand-text">
              <strong>Get-Attended</strong>
              <small>Pro</small>
            </span>
          </a>
          <div className="portal-tag">{PORTAL_LABELS[role]}</div>
        </div>

        <nav className="side-nav" aria-label={`${ROLE_LABELS[role]} navigation`}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`nav-item ${active === item.key ? 'active' : ''}`.trim()}
              onClick={() => navigate(item.key)}
              aria-current={active === item.key ? 'page' : undefined}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="side-foot">
          <button type="button" className={`sync-mini ${cloud ? 'online' : ''}`.trim()} onClick={() => navigate('settings')}>
            <span className="sync-dot" />
            <span>
              <strong>{cloud ? 'Cloud connected' : 'Offline mode'}</strong>
              <small>{cloud ? 'Tap to manage sync' : 'Data stays on this device'}</small>
            </span>
          </button>
          <div className="user-card">
            <Avatar photo={photo} name={user} size={38} />
            <div className="user-meta">
              <strong>{user || 'Signed in'}</strong>
              <small>{ROLE_LABELS[role]}</small>
            </div>
            <button type="button" className="icon-btn logout-icon" onClick={onLogout} title="Sign out" aria-label="Sign out">
              ⎋
            </button>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <button type="button" className="menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            ☰
          </button>
          <div className="page-head">
            {company ? <div className="company-name" title="Company">{company}</div> : null}
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <div className="top-actions">
            <div className={`sync-pill ${cloud ? 'online' : ''}`.trim()}>
              <span className="sync-dot" />
              {cloud ? 'Cloud' : 'Offline'}
            </div>
            {remainingMs ? (
              <div className={`session-pill ${remainingMs < 120000 ? 'warn' : ''}`.trim()} title="Session time remaining">
                <span aria-hidden="true">⏱</span> {fmtCountdown(remainingMs)}
              </div>
            ) : null}
            {actions || null}
            <button type="button" className="btn btn-ghost btn-small signout-top" onClick={onLogout}>
              Sign out
            </button>
          </div>
        </header>

        <main className="content">{children}</main>

        <footer className="app-footer">
          <span>Get-Attended Pro · Photo + GPS + Live Time + Cloud Sync</span>
          <span>{new Date().getFullYear()} · {PORTAL_LABELS[role]}</span>
        </footer>
      </div>
    </div>
  );
}
