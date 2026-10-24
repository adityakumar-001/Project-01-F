import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_LABELS } from '../lib/constants.js';
import { useDocumentTitle } from '../lib/hooks.js';

const PORTALS = [
  {
    role: 'emp',
    to: '/employee',
    title: 'Employee',
    tagline: 'Punch in with proof',
    text: 'Live photo, face presence, GPS distance and a clean personal attendance history.',
    points: ['Front-camera punch', '125 m store geofence', 'Month summary & records'],
    className: 'portal-emp',
  },
  {
    role: 'adm',
    to: '/admin',
    title: 'Admin',
    tagline: 'Run your stores',
    text: 'Create employees and stores, monitor today’s attendance, manage records and backups.',
    points: ['Employee & store control', 'Attendance analytics', 'Cloud & local backup'],
    className: 'portal-adm',
  },
  {
    role: 'org',
    to: '/organizer',
    title: 'Organizer',
    tagline: 'Oversee every admin',
    text: 'Create and manage admin accounts. Disabling one admin blocks all of their employees.',
    points: ['Multiple admin IDs', 'Enable / disable access', 'Organization settings'],
    className: 'portal-org',
  },
];

const STEPS = [
  { n: '01', title: 'Admin sets the store', text: 'Assign employees, store coordinates and a 125 m geofence.' },
  { n: '02', title: 'Employee punches', text: 'Live camera + face check + GPS capture, inside the store boundary.' },
  { n: '03', title: 'Admin sees proof', text: 'Photo, location link, distance, in/out time and automatic status.' },
  { n: '04', title: 'Organizer stays in control', text: 'Admin access can be disabled instantly; their employees are blocked with them.' },
];

export default function Landing() {
  useDocumentTitle('Enterprise attendance suite');
  const { session } = useAuth();
  const continueTo = session ? (session.role === 'org' ? '/organizer' : session.role === 'adm' ? '/admin' : '/employee') : '';

  return (
    <div className="landing">
      <header className="site-header">
        <Link className="brand" to="/">
          <img src="/brand/logo.png" alt="" className="brand-logo" />
          <span className="brand-text">
            <strong>Get-Attended</strong>
            <small>Pro</small>
          </span>
        </Link>
        <nav className="site-nav" aria-label="Portals">
          <Link to="/employee">Employee</Link>
          <Link to="/admin">Admin</Link>
          <Link to="/organizer">Organizer</Link>
        </nav>
        <div className="site-actions">
          {session ? (
            <Link className="btn btn-primary btn-small" to={continueTo}>
              Continue as {ROLE_LABELS[session.role]}
            </Link>
          ) : (
            <Link className="btn btn-ghost btn-small" to="/employee">Employee login</Link>
          )}
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">Photo + GPS + live time + cloud sync</span>
            <h1>Every shift,<br /><span className="gradient-text">verified.</span></h1>
            <p>
              Get-Attended Pro turns attendance into evidence. Employees punch with a live photo
              inside their store geofence; admins see exactly what happened, when and where.
            </p>
            <div className="hero-ctas">
              <Link className="btn btn-primary" to={session ? continueTo : '/employee'}>
                {session ? 'Open my portal' : 'Start with employee login'} →
              </Link>
              <Link className="btn btn-ghost" to="/admin">Admin dashboard</Link>
            </div>
            <div className="hero-proof">
              <div><strong>125 m</strong><span>geofence</span></div>
              <div><strong>3</strong><span>secure portals</span></div>
              <div><strong>100%</strong><span>photo verified</span></div>
            </div>
          </div>

          <div className="hero-art" aria-hidden="true">
            <div className="art-glow" />
            <div className="phone-card">
              <div className="phone-top">
                <span>Today</span>
                <span className="live-dot">Live</span>
              </div>
              <div className="phone-time">09:12<span>:48</span></div>
              <div className="phone-date">Monday, 21 October</div>
              <div className="punch-tile">
                <span className="punch-icon">📸</span>
                <div>
                  <strong>Attendance IN</strong>
                  <small>Face verified · 42 m from store</small>
                </div>
                <span className="check-bubble">✓</span>
              </div>
              <div className="mini-stats">
                <div><strong>18</strong><span>Present</span></div>
                <div><strong>2</strong><span>Half day</span></div>
                <div><strong>1</strong><span>IN only</span></div>
              </div>
              <div className="phone-foot">
                <span className="sync-dot online" /> Synced with cloud
              </div>
            </div>
            <div className="floating-card float-one">
              <span>📍</span>
              <div><strong>In range</strong><small>Store · 42 m</small></div>
            </div>
            <div className="floating-card float-two">
              <span>⚡</span>
              <div><strong>Half day logic</strong><small>OUT before 6 PM</small></div>
            </div>
          </div>
        </section>

        <section className="section-block portals-section">
          <div className="section-heading">
            <span className="eyebrow">Three focused portals</span>
            <h2>One system. Clear roles.</h2>
            <p>Each portal is separate, permission-scoped and works online or offline.</p>
          </div>
          <div className="portal-grid">
            {PORTALS.map((portal) => (
              <Link key={portal.role} to={portal.to} className={`portal-card ${portal.className}`}>
                <span className="portal-role">{portal.title}</span>
                <h3>{portal.tagline}</h3>
                <p>{portal.text}</p>
                <ul>
                  {portal.points.map((point) => <li key={point}>✓ {point}</li>)}
                </ul>
                <span className="portal-link">Open portal →</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="section-block how-section">
          <div className="section-heading">
            <span className="eyebrow">How it works</span>
            <h2>Proof at every step.</h2>
          </div>
          <div className="steps-grid">
            {STEPS.map((step) => (
              <div className="step-card" key={step.n}>
                <span className="step-number">{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="cta-band">
          <div>
            <h2>Ready to see attendance differently?</h2>
            <p>Open any portal below. Existing IDs and local data continue to work.</p>
          </div>
          <div className="cta-band-actions">
            <Link className="btn btn-inverse" to="/employee">Employee</Link>
            <Link className="btn btn-inverse-ghost" to="/admin">Admin</Link>
            <Link className="btn btn-inverse-ghost" to="/organizer">Organizer</Link>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="brand">
          <img src="/brand/logo.png" alt="" className="brand-logo" />
          <span className="brand-text"><strong>Get-Attended</strong><small>Pro</small></span>
        </div>
        <p>Enterprise attendance suite with photo, GPS and audit-ready records.</p>
        <span>© {new Date().getFullYear()} Get-Attended</span>
      </footer>
    </div>
  );
}
