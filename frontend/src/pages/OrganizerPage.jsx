import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api.js';
import { ApiError, errorMessage } from '../lib/api.js';
import { DEFAULT_ORGANIZER } from '../lib/constants.js';
import {
  nextAdminId,
  todayStr,
  validateNewId,
  validatePassword,
} from '../lib/domain.js';
import {
  getAdmin,
  getAdmins,
  getEmployees,
  getOrganizer,
  getRecords,
  getToken,
  isCloudMode,
  normalizeId,
  normalizeOrganizer,
  removeAdminProfile,
  saveAdmin as saveAdminProfile,
  saveAdmins,
  saveEmployees,
  saveOrganizer,
  saveRecords,
  scrubLocalSecrets,
} from '../lib/storage.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDocumentTitle } from '../lib/hooks.js';
import AppShell from '../components/AppShell.jsx';
import CloudPanel from '../components/CloudPanel.jsx';
import LoginShell from '../components/LoginShell.jsx';
import PortalLogin from '../components/PortalLogin.jsx';
import {
  Avatar,
  Badge,
  Field,
  Modal,
  PasswordField,
  PhotoPicker,
  StatCard,
  Switch,
  TextField,
} from '../components/ui.jsx';

const sameId = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

function securitySet(admin) {
  return Boolean(admin?.mob && admin?.movie && admin?.birth && admin?.school);
}

const BLANK_ADMIN_FORM = {
  id: '',
  name: '',
  company: '',
  pass: '',
  mob: '',
  movie: '',
  birth: '',
  school: '',
  status: 'Enabled',
  photo: '',
};

function AdminFormModal({ open, mode, initial, onClose, onSave }) {
  const [form, setForm] = useState(BLANK_ADMIN_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (mode === 'edit' && initial) {
      setForm({ ...BLANK_ADMIN_FORM, ...initial, id: initial.id, pass: '' });
    } else {
      const admins = getAdmins();
      setForm({ ...BLANK_ADMIN_FORM, id: nextAdminId(admins) });
    }
  }, [open, mode, initial]);

  const update = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const idError = validateNewId(form.id);
    if (idError) return setError(idError);
    if (!form.name.trim()) return setError('Admin name is required.');
    if (!form.company.trim()) return setError('Company name is required.');
    if (form.company.trim().length > 150) return setError('Company name must be 150 characters or fewer.');
    if (mode === 'create' && !form.pass) return setError('Set a login password for this admin.');
    const pe = form.pass ? validatePassword(form.pass) : '';
    if (pe) return setError(pe);
    setBusy(true);
    try {
      await onSave(
        {
          ...form,
          id: normalizeId(form.id),
          name: form.name.trim(),
          company: form.company.trim(),
        },
        mode,
      );
    } catch (err) {
      setError(err.message || 'Could not save the admin.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Create admin ID' : 'Edit admin'}
      subtitle={mode === 'create' ? 'Each admin gets an isolated employee workspace.' : `Editing ${initial?.id || ''}`}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="admin-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : mode === 'create' ? 'Create admin' : 'Save changes'}
          </button>
        </>
      }
    >
      <form id="admin-form" onSubmit={submit} className="stack">
        <div className="form-grid">
          <TextField label="Admin name" required value={form.name} onChange={update('name')} placeholder="e.g. Ramesh Admin" autoFocus />
          <TextField
            label="Company name"
            required
            value={form.company}
            onChange={update('company')}
            maxLength={150}
            placeholder="e.g. MAIPL Retail Pvt Ltd"
            hint="Shown at the top of every employee portal under this admin."
          />
          <TextField label="Admin ID" required value={form.id} onChange={update('id')} hint="Letters, numbers, dot, dash or underscore." />
          <PasswordField
            label={mode === 'create' ? 'Password' : 'New password (optional)'}
            required={mode === 'create'}
            value={form.pass}
            onChange={update('pass')}
            autoComplete="new-password"
            hint="At least 8 characters."
          />
          <TextField label="Mobile" value={form.mob} onChange={update('mob')} maxLength={10} inputMode="numeric" placeholder="10-digit mobile" />
          <TextField label="Favourite movie" value={form.movie} onChange={update('movie')} placeholder="Security answer Q2" />
          <TextField label="Birth place" value={form.birth} onChange={update('birth')} placeholder="Security answer Q3" />
          <TextField label="Class 10 school" value={form.school} onChange={update('school')} placeholder="Security answer Q4" className="span-2" />
          <Field label="Status">
            <select value={form.status} onChange={update('status')}>
              <option value="Enabled">Enabled</option>
              <option value="Disabled">Disabled</option>
            </select>
          </Field>
        </div>
        <p className="field-hint">Security answers are required for password recovery. They can also be set later in the admin’s settings.</p>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
      </form>
    </Modal>
  );
}

export default function OrganizerPage() {
  useDocumentTitle('Organizer');
  const { session, signIn, signOut, remainingMs } = useAuth();
  const { notify, confirm } = useToast();
  const [organizer, setOrganizer] = useState(getOrganizer);
  const [admins, setAdmins] = useState(getAdmins);
  const [active, setActive] = useState('dashboard');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [profile, setProfile] = useState(() => ({ ...getOrganizer(), newPass: '', confirm: '' }));

  const authed = session?.role === 'org';

  useEffect(() => {
    setActive('dashboard');
    setSearch('');
    setFilter('all');
    setModal(null);
  }, [session?.id]);

  const applyPull = useCallback((data) => {
    const currentAdmins = getAdmins();
    if (data.organizer) {
      const mergedOrganizer = { ...getOrganizer(), ...data.organizer };
      saveOrganizer(mergedOrganizer);
      setOrganizer(mergedOrganizer);
      setProfile({ ...mergedOrganizer, newPass: '', confirm: '' });
    }
    if (Array.isArray(data.admins)) {
      const merged = data.admins.map((incoming) => {
        const existing = currentAdmins.find((item) => item.id.toLowerCase() === String(incoming.id).toLowerCase());
        return { ...existing, ...incoming, pass: existing?.pass || '' };
      });
      saveAdmins(merged);
      setAdmins(merged);
    }
    scrubLocalSecrets();
  }, []);

  const pullCloud = useCallback(async (silent = false) => {
    if (!isCloudMode() || !getToken()) return false;
    setSyncing(true);
    try {
      const data = await api.pull();
      applyPull(data);
      if (!silent) notify('Organizer data refreshed from the cloud.', 'success');
      return true;
    } catch (error) {
      if (!silent) notify(errorMessage(error), 'error');
      else notify(`Cloud sync unavailable: ${errorMessage(error)}`, 'warning');
      return false;
    } finally {
      setSyncing(false);
    }
  }, [applyPull, notify]);

  useEffect(() => {
    if (!authed) return;
    const localOrganizer = getOrganizer();
    setOrganizer(localOrganizer);
    setProfile({ ...localOrganizer, newPass: '', confirm: '' });
    setAdmins(getAdmins());
    if (isCloudMode()) pullCloud(true);
  }, [authed, session?.id, pullCloud]);

  const handleLogin = async (id, pass) => {
    if (isCloudMode()) {
      const data = await api.login('org', normalizeId(id), pass);
      const cloudOrganizer = normalizeOrganizer({ ...(data.organizer || {}), pass: '' });
      saveOrganizer(cloudOrganizer);
      scrubLocalSecrets();
      setOrganizer(cloudOrganizer);
      setProfile({ ...cloudOrganizer, newPass: '', confirm: '' });
      signIn('org', cloudOrganizer.id || normalizeId(id));
      return;
    }
    const current = getOrganizer();
    if (current.id.toLowerCase() !== normalizeId(id).toLowerCase() || current.pass !== pass) {
      throw new ApiError('wrong');
    }
    signIn('org', current.id);
  };

  const handleLogout = async () => {
    await signOut();
    setActive('dashboard');
  };

  const pushCloud = async () => {
    if (!getToken()) throw new ApiError('login-required');
    await api.push({ admins, organizer, admin: admins[0] || null });
    return 'Organizer data saved to the cloud.';
  };

  const saveAdmin = async (form, mode) => {
    const existing = admins.find((item) => item.id.toLowerCase() === form.id.toLowerCase());
    if (mode === 'create' && existing) throw new Error('That admin ID already exists.');
    if (mode === 'edit' && existing && existing.id !== modal?.admin?.id) throw new Error('That admin ID already exists.');

    if (isCloudMode()) {
      try {
        if (mode === 'create') {
          await api.createAdmin({
            id: form.id,
            name: form.name,
            company: form.company,
            pass: form.pass,
            mob: form.mob,
            status: form.status,
          });
          await api.push({
            admins: [{ ...form, pass: '' }],
            organizer,
            admin: null,
          });
        } else {
          const original = modal?.admin;
          const rename = original && original.id !== form.id;
          if (rename || form.pass) {
            await api.updateAdmin(original.id, {
              newId: form.id,
              name: form.name,
              company: form.company,
              mob: form.mob,
              pass: form.pass || undefined,
            });
          } else {
            await api.updateAdmin(original.id, {
              newId: form.id,
              name: form.name,
              company: form.company,
              mob: form.mob,
            });
          }
          await api.push({ admins: [{ ...form, pass: '' }], organizer, admin: null });
          if (original?.status !== form.status) {
            await api.setAdminStatus(form.id, form.status === 'Enabled');
          }
        }
        await pullCloud(true);
        notify(mode === 'create' ? 'Admin created.' : 'Admin updated.', 'success');
        setModal(null);
        return;
      } catch (error) {
        throw new Error(errorMessage(error));
      }
    }

    let nextAdmins;
    if (mode === 'create') {
      const created = {
        ...form,
        pass: form.pass,
        created: todayStr(),
        mustChangePass: true,
      };
      nextAdmins = [...admins, created];
    } else {
      const originalId = modal?.admin?.id;
      nextAdmins = admins.map((item) => (item.id === originalId ? { ...item, ...form, pass: form.pass || item.pass } : item));
      if (originalId && originalId !== form.id) {
        const employees = getEmployees();
        if (employees.some((employee) => sameId(employee.adminId, originalId))) {
          saveEmployees(employees.map((employee) => (sameId(employee.adminId, originalId) ? { ...employee, adminId: form.id } : employee)));
        }
        const records = getRecords();
        if (records.some((record) => sameId(record.adminId, originalId))) {
          saveRecords(records.map((record) => (sameId(record.adminId, originalId) ? { ...record, adminId: form.id } : record)));
        }
        const current = getAdmin();
        if (sameId(current.id, originalId)) {
          saveAdminProfile({ ...current, ...form, pass: form.pass || current.pass });
        }
      }
    }
    const saved = saveAdmins(nextAdmins);
    setAdmins(saved);
    notify(mode === 'create' ? 'Admin created on this device.' : 'Admin updated on this device.', 'success');
    setModal(null);
  };

  const toggleAdmin = async (admin) => {
    const enable = admin.status !== 'Enabled';
    const ok = await confirm({
      title: enable ? 'Enable admin?' : 'Disable admin?',
      message: enable
        ? `${admin.id} will be able to sign in again.`
        : `${admin.id} and every employee under this admin will be blocked immediately.`,
      confirmLabel: enable ? 'Enable' : 'Disable',
      tone: enable ? 'primary' : 'danger',
    });
    if (!ok) return;
    try {
      if (isCloudMode()) {
        await api.setAdminStatus(admin.id, enable);
        await pullCloud(true);
      } else {
        const next = admins.map((item) => (item.id === admin.id ? { ...item, status: enable ? 'Enabled' : 'Disabled' } : item));
        setAdmins(saveAdmins(next));
      }
      notify(`${admin.id} ${enable ? 'enabled' : 'disabled'}.`, 'success');
    } catch (error) {
      notify(errorMessage(error), 'error');
    }
  };

  const removeAdmin = async (admin) => {
    const ok = await confirm({
      title: 'Delete admin?',
      message: `Delete ${admin.id}? Their employees and attendance records are kept for audit but will no longer have this admin. This cannot be undone.`,
      confirmLabel: 'Delete admin',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      if (isCloudMode()) {
        // Wait for the server before touching local storage: a network failure
        // must not make the admin look deleted on this device only.
        await api.deleteAdmin(admin.id);
      }
      // Remove every local trace (list entry, current profile, photo/email)
      // so a failed or partial pull cannot resurrect the account.
      const remaining = removeAdminProfile(admin.id);
      setAdmins(remaining);
      if (isCloudMode()) await pullCloud(true);
      notify(`${admin.id} deleted permanently.`, 'success');
    } catch (error) {
      notify(errorMessage(error), 'error');
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const idError = validateNewId(profile.id);
    if (idError) return notify(idError, 'error');
    if (!profile.currentPass) return notify('Enter your current password to save changes.', 'error');
    if (profile.newPass) {
      const pe = validatePassword(profile.newPass);
      if (pe) return notify(pe, 'error');
      if (profile.newPass !== profile.confirm) return notify('New passwords do not match.', 'error');
    }
    try {
      if (isCloudMode()) {
        const data = await api.updateOrganizer({
          id: normalizeId(profile.id),
          currentPass: profile.currentPass,
          pass: profile.newPass || undefined,
          mob: profile.mob,
          movie: profile.movie,
          birth: profile.birth,
          school: profile.school,
          photo: profile.photo,
        });
        const merged = { ...organizer, ...(data.organizer || {}), pass: '' };
        saveOrganizer(merged);
        scrubLocalSecrets();
        setOrganizer(merged);
        setProfile({ ...merged, currentPass: '', newPass: '', confirm: '' });
        if (normalizeId(profile.id) !== session.id) signIn('org', merged.id || profile.id);
        notify('Organizer profile updated in the cloud.', 'success');
      } else {
        if (profile.currentPass !== organizer.pass) throw new ApiError('wrong-current-password');
        const updated = saveOrganizer({
          ...organizer,
          id: normalizeId(profile.id),
          mob: profile.mob,
          movie: profile.movie,
          birth: profile.birth,
          school: profile.school,
          photo: profile.photo,
          pass: profile.newPass || organizer.pass,
        });
        setOrganizer(updated);
        setProfile({ ...updated, currentPass: '', newPass: '', confirm: '' });
        if (updated.id !== session.id) signIn('org', updated.id);
        notify('Organizer profile updated on this device.', 'success');
      }
    } catch (error) {
      notify(errorMessage(error), 'error');
    }
  };

  const filteredAdmins = useMemo(() => {
    const query = search.trim().toLowerCase();
    return admins.filter((admin) => {
      if (filter === 'enabled' && admin.status !== 'Enabled') return false;
      if (filter === 'disabled' && admin.status !== 'Disabled') return false;
      if (!query) return true;
      return [admin.id, admin.name, admin.company, admin.mob].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [admins, search, filter]);

  if (!authed) {
    return (
      <LoginShell
        role="org"
        title="Organizer sign in"
        subtitle="Manage admin access for the entire organization."
      >
        <PortalLogin
          role="org"
          idLabel="Organizer ID"
          idPlaceholder="e.g. organizer"
          onLogin={handleLogin}
        />
      </LoginShell>
    );
  }

  const enabled = admins.filter((admin) => admin.status === 'Enabled').length;
  const disabled = admins.length - enabled;
  const currentAdmin = admins.find((admin) => admin.id.toLowerCase() === session.id.toLowerCase());

  return (
    <AppShell
      role="org"
      active={active}
      onNavigate={setActive}
      title={
        active === 'dashboard' ? 'Organizer dashboard' : active === 'admins' ? 'Manage admins' : 'Settings'
      }
      subtitle={
        active === 'dashboard'
          ? `Signed in as ${session.id}`
          : active === 'admins'
            ? 'Create, edit, enable or delete admin accounts.'
            : 'Organizer profile, security answers and cloud connection.'
      }
      user={session.id}
      photo={organizer.photo}
      onLogout={handleLogout}
      remainingMs={remainingMs}
      actions={syncing ? <span className="badge badge-sync">Syncing…</span> : null}
    >
      {active === 'dashboard' ? (
        <>
          <div className="stat-grid">
            <StatCard label="Total admins" value={admins.length} icon="👑" tone="indigo" onClick={() => setActive('admins')} />
            <StatCard label="Enabled admins" value={enabled} icon="✓" tone="emerald" onClick={() => { setFilter('enabled'); setActive('admins'); }} />
            <StatCard label="Disabled admins" value={disabled} icon="⏸" tone="rose" onClick={() => { setFilter('disabled'); setActive('admins'); }} />
            <StatCard label="Cloud mode" value={isCloudMode() ? 'On' : 'Off'} sub={isCloudMode() ? 'Cross-device sync' : 'Local data only'} icon="☁️" tone="blue" onClick={() => setActive('settings')} />
          </div>

          <div className="two-col">
            <div className="card">
              <div className="card-head">
                <div>
                  <h2>Admin overview</h2>
                  <p className="card-desc">Disabling an admin blocks all employees under that admin.</p>
                </div>
                <button type="button" className="btn btn-primary btn-small" onClick={() => setModal({ mode: 'create' })}>+ New admin</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Admin</th><th>Company</th><th>Mobile</th><th>Security</th><th>Status</th><th>Created</th></tr>
                  </thead>
                  <tbody>
                    {admins.slice(0, 6).map((admin) => (
                      <tr key={admin.id}>
                        <td>
                          <div className="identity">
                            <Avatar name={admin.name || admin.id} photo={admin.photo} size={34} />
                            <div><strong>{admin.id}</strong><small>{admin.name || 'No name set'}</small></div>
                          </div>
                        </td>
                        <td>{admin.company || '—'}</td>
                        <td>{admin.mob || '—'}</td>
                        <td>{securitySet(admin) ? <Badge tone="present">Complete</Badge> : <Badge tone="neutral">Incomplete</Badge>}</td>
                        <td><Badge tone={admin.status === 'Enabled' ? 'present' : 'disabled'}>{admin.status}</Badge></td>
                        <td>{admin.created || '—'}</td>
                      </tr>
                    ))}
                    {!admins.length ? (
                      <tr><td colSpan={6} className="table-empty">No admins yet. Create the first admin account.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <h2>Quick actions</h2>
                  <p className="card-desc">Everything the organizer can do sits here.</p>
                </div>
              </div>
              <div className="quick-list">
                <button type="button" onClick={() => setModal({ mode: 'create' })}><span>➕</span><div><strong>Create admin</strong><small>Add another admin workspace</small></div></button>
                <button type="button" onClick={() => setActive('admins')}><span>👑</span><div><strong>Manage access</strong><small>{enabled} enabled · {disabled} disabled</small></div></button>
                <button type="button" onClick={() => { setActive('settings'); }}><span>☁️</span><div><strong>Cloud sync</strong><small>{isCloudMode() ? 'Connected to a server' : 'Connect a backend server'}</small></div></button>
                <button type="button" onClick={() => pullCloud(false)} disabled={!isCloudMode() || syncing}><span>⟳</span><div><strong>Pull latest</strong><small>Refresh the admin list</small></div></button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {active === 'admins' ? (
        <div className="card">
          <div className="card-head">
            <div>
              <h2>All admins</h2>
              <p className="card-desc">{admins.length} admin accounts · {disabled} disabled</p>
            </div>
            <div className="toolbar">
              <input
                className="search-input"
                placeholder="Search ID, name, company or mobile…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
              <button type="button" className="btn btn-primary btn-small" onClick={() => setModal({ mode: 'create' })}>+ New admin</button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Admin</th><th>Company</th><th>Mobile</th><th>Security</th><th>Status</th><th>Created</th><th className="right">Access</th><th className="right">Actions</th></tr>
              </thead>
              <tbody>
                {filteredAdmins.map((admin) => (
                  <tr key={admin.id}>
                    <td>
                      <div className="identity">
                        <Avatar name={admin.name || admin.id} photo={admin.photo} size={34} />
                        <div><strong>{admin.id}</strong><small>{admin.name || 'No name set'}</small></div>
                      </div>
                    </td>
                    <td>{admin.company || '—'}</td>
                    <td>{admin.mob || '—'}</td>
                    <td>{securitySet(admin) ? <Badge tone="present">Set</Badge> : <Badge tone="neutral">Missing</Badge>}</td>
                    <td><Badge tone={admin.status === 'Enabled' ? 'present' : 'disabled'}>{admin.status}</Badge></td>
                    <td>{admin.created || '—'}</td>
                    <td className="right">
                      <span className="switch-wrap">
                        <Switch
                          checked={admin.status === 'Enabled'}
                          onChange={() => toggleAdmin(admin)}
                          label={`${admin.status === 'Enabled' ? 'Disable' : 'Enable'} ${admin.id}`}
                        />
                      </span>
                    </td>
                    <td className="right">
                      <div className="row-actions">
                        <button type="button" className="btn btn-tiny btn-ghost" onClick={() => setModal({ mode: 'edit', admin })}>Edit</button>
                        <button type="button" className="btn btn-tiny btn-danger-ghost" onClick={() => removeAdmin(admin)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredAdmins.length ? (
                  <tr><td colSpan={8} className="table-empty">No admins match this filter.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {active === 'settings' ? (
        <div className="settings-grid">
          <div className="card">
            <div className="card-head">
              <div>
                <h2>Organizer profile</h2>
                <p className="card-desc">Your ID, mobile and recovery answers. Changing the ID keeps this session.</p>
              </div>
            </div>
            <form onSubmit={saveProfile} className="stack">
              <PhotoPicker
                value={profile.photo}
                onChange={(photo) => setProfile((prev) => ({ ...prev, photo }))}
                name={profile.id}
                label="Organizer photo"
              />
              <div className="form-grid">
                <TextField label="Organizer ID" required value={profile.id} onChange={(event) => setProfile((prev) => ({ ...prev, id: event.target.value }))} />
                <TextField label="Mobile" value={profile.mob} onChange={(event) => setProfile((prev) => ({ ...prev, mob: event.target.value }))} maxLength={10} inputMode="numeric" />
                <TextField label="Favourite movie" value={profile.movie} onChange={(event) => setProfile((prev) => ({ ...prev, movie: event.target.value }))} />
                <TextField label="Birth place" value={profile.birth} onChange={(event) => setProfile((prev) => ({ ...prev, birth: event.target.value }))} />
                <TextField label="Class 10 school" value={profile.school} onChange={(event) => setProfile((prev) => ({ ...prev, school: event.target.value }))} className="span-2" />
              </div>
              <div className="divider" />
              <h3 className="subhead">Change password</h3>
              <div className="form-grid">
                <PasswordField label="Current password" required value={profile.currentPass || ''} onChange={(event) => setProfile((prev) => ({ ...prev, currentPass: event.target.value }))} />
                <div />
                <PasswordField label="New password (optional)" value={profile.newPass} onChange={(event) => setProfile((prev) => ({ ...prev, newPass: event.target.value }))} autoComplete="new-password" hint="Leave blank to keep the current password." />
                <PasswordField label="Confirm new password" value={profile.confirm} onChange={(event) => setProfile((prev) => ({ ...prev, confirm: event.target.value }))} autoComplete="new-password" />
              </div>
              <div>
                <button type="submit" className="btn btn-primary">Save organizer settings</button>
              </div>
            </form>
          </div>

          <div className="stack">
            <div className="card">
              <div className="card-head">
                <div>
                  <h2>Cloud connection</h2>
                  <p className="card-desc">Connect the shared backend to keep admins in sync across devices.</p>
                </div>
              </div>
              <CloudPanel
                onPull={async () => {
                  const ok = await pullCloud(false);
                  if (!ok) throw new Error('Pull failed.');
                  return '';
                }}
                onPush={pushCloud}
                onReLogin={() => signOut({ remote: false })}
                pullLabel="Pull admins"
                pushLabel="Push admins"
                note="Organizer sync only covers admins and your own organizer profile; employee data is never exposed here."
              />
            </div>
            <div className="card">
              <h2>Current access</h2>
              <div className="detail-list">
                <div><span>Signed in as</span><strong>{session.id}</strong></div>
                <div><span>Session expires in</span><strong>{Math.ceil(remainingMs / 60000)} min</strong></div>
                <div><span>Admin accounts</span><strong>{admins.length}</strong></div>
                <div><span>Current admin</span><strong>{currentAdmin?.name || currentAdmin?.id || '—'}</strong></div>
                <div><span>Default organizer ID</span><strong>{DEFAULT_ORGANIZER.id}</strong></div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <AdminFormModal
        open={Boolean(modal)}
        mode={modal?.mode || 'create'}
        initial={modal?.admin}
        onClose={() => setModal(null)}
        onSave={saveAdmin}
      />
    </AppShell>
  );
}

