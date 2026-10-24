import { ROLE_LABELS } from '../lib/constants.js';

const FEATURES = [
  { icon: '📸', title: 'Photo + face verified punches', text: 'Front camera capture with face presence check on every punch.' },
  { icon: '📍', title: 'Store geofence enforcement', text: 'Punch is only accepted within 125 m of the assigned store.' },
  { icon: '☁️', title: 'Cloud sync across portals', text: 'Organizer, admin and employee data stay in step online or offline.' },
];

export default function LoginShell({ role, title, subtitle, children }) {
  return (
    <div className="login-page">
      <section className="login-visual">
        <a className="brand brand-inverse" href="/">
          <img src="/brand/logo.png" alt="" className="brand-logo" />
          <span className="brand-text">
            <strong>Get-Attended</strong>
            <small>Pro</small>
          </span>
        </a>
        <div className="login-copy">
          <span className="eyebrow">{ROLE_LABELS[role]} access</span>
          <h1>Attendance that proves itself.</h1>
          <p>Live time, photo evidence, GPS distance and a full audit trail — built for distributed store teams.</p>
        </div>
        <div className="login-features">
          {FEATURES.map((feature) => (
            <div className="login-feature" key={feature.title}>
              <span className="login-feature-icon" aria-hidden="true">{feature.icon}</span>
              <div>
                <strong>{feature.title}</strong>
                <p>{feature.text}</p>
              </div>
            </div>
          ))}
        </div>
        <a className="back-home" href="/">← Back to portal selection</a>
      </section>

      <section className="login-main">
        <div className="login-card card">
          <div className="login-card-head">
            <span className="role-chip">{ROLE_LABELS[role]}</span>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {children}
        </div>
        <p className="login-footnote">Protected by role-scoped sessions and server-side password hashing.</p>
      </section>
    </div>
  );
}
