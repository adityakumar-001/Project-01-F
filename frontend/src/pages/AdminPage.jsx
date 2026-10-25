import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api.js';
import { ApiError, errorMessage } from '../lib/api.js';
import { DEFAULT_EMPLOYEE_PASSWORD } from '../lib/constants.js';
import {
  buildBackup,
  downloadText,
  employeeCoords,
  fmtDate,
  fmtDuration,
  getStatus,
  mapsLink,
  mergeEmployees,
  mergeRecords,
  monthKey,
  nextEmployeeId,
  parseBackup,
  parseLatLon,
  readFileText,
  recordsToCsv,
  todayStr,
  validateNewId,
  validatePassword,
  workedSeconds,
} from '../lib/domain.js';
import {
  getAdmin,
  getAdminEmail,
  getAdmins,
  getEmployees,
  getRecords,
  getToken,
  isCloudMode,
  normalizeAdmin,
  normalizeEmployee,
  normalizeId,
  normalizeRecord,
  saveAdmin,
  saveAdminEmail,
  saveAdmins,
  clearAdminEmail,
  saveEmployees,
  saveRecords,
  scrubLocalSecrets,
} from '../lib/storage.js';
import { useDocumentTitle, useNow } from '../lib/hooks.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import AppShell from '../components/AppShell.jsx';
import CloudPanel from '../components/CloudPanel.jsx';
import LoginShell from '../components/LoginShell.jsx';
import PortalLogin from '../components/PortalLogin.jsx';
import {
  Avatar,
  Badge,
  EmptyState,
  Field,
  Modal,
  PasswordField,
  PhotoPicker,
  StatCard,
  Switch,
  TextField,
} from '../components/ui.jsx';

const sameId = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

function localAdminFor(id) {
  return getAdmins().find((item) => sameId(item.id, id)) || null;
}

function employeesFor(adminId, all, firstAdminId) {
  return all.filter((employee) => sameId(employee.adminId || firstAdminId, adminId));
}

function recordsFor(adminId, all, firstAdminId) {
  return all.filter((record) => (record.adminId ? sameId(record.adminId, adminId) : sameId(adminId, firstAdminId)));
}

const BLANK_EMPLOYEE_FORM = {
  id: '',
  name: '',
  pass: '',
  desg: '',
  mob: '',
  photo: '',
  store: '',
  storeArea: '',
  storeLat: '',
  storeLon: '',
  storeLink: '',
  status: 'Enabled',
};

function EmployeeFormModal({ open, mode, initial, employees, onClose, onSave }) {
  const [form, setForm] = useState(BLANK_EMPLOYEE_FORM);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (mode === 'edit' && initial) setForm({ ...BLANK_EMPLOYEE_FORM, ...initial, pass: '' });
    else setForm({ ...BLANK_EMPLOYEE_FORM, id: nextEmployeeId(employees), pass: DEFAULT_EMPLOYEE_PASSWORD });
  }, [open, mode, initial, employees]);

  const update = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const generateLink = () => {
    if (!form.storeLat || !form.storeLon) return setError('Enter latitude and longitude first.');
    setForm((prev) => ({ ...prev, storeLink: mapsLink(prev.storeLat.trim(), prev.storeLon.trim()) }));
  };

  const extractCoords = () => {
    const coords = parseLatLon(form.storeLink);
    if (!coords) return setError('Could not find latitude/longitude in that link.');
    setForm((prev) => ({ ...prev, storeLat: String(coords.lat), storeLon: String(coords.lon) }));
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const idError = validateNewId(form.id);
    if (idError) return setError(idError);
    if (!form.name.trim()) return setError('Employee name is required.');
    if (!form.store.trim()) return setError('Store name is required.');
    if (mode === 'create' && !form.pass) return setError('A starting password is required.');
    const pe = form.pass ? validatePassword(form.pass) : '';
    if (pe) return setError(pe);
    let lat = form.storeLat;
    let lon = form.storeLon;
    if ((!lat || !lon) && form.storeLink) {
      const coords = parseLatLon(form.storeLink);
      if (coords) {
        lat = String(coords.lat);
        lon = String(coords.lon);
      }
    }
    if (!lat || !lon) return setError('Store latitude and longitude are required for the 125 m geofence.');
    const latNum = Number(lat);
    const lonNum = Number(lon);
    if (!Number.isFinite(latNum) || !Number.isFinite(lonNum) || Math.abs(latNum) > 90 || Math.abs(lonNum) > 180) {
      return setError('Store latitude/longitude are out of range.');
    }
    if (mode === 'create' && employees.some((employee) => sameId(employee.id, form.id))) {
      return setError('That employee ID already exists.');
    }
    if (mode === 'edit' && employees.some((employee) => sameId(employee.id, form.id) && !sameId(employee.id, initial?.id))) {
      return setError('That employee ID already exists.');
    }
    setBusy(true);
    try {
      await onSave(
        {
          ...form,
          id: normalizeId(form.id),
          name: form.name.trim(),
          store: form.store.trim(),
          storeArea: form.storeArea.trim(),
          storeLat: String(latNum),
          storeLon: String(lonNum),
          storeLink: form.storeLink || mapsLink(latNum, lonNum),
        },
        mode,
      );
    } catch (err) {
      setError(err.message || 'Could not save this employee.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Create employee' : 'Edit employee'}
      subtitle={mode === 'create' ? 'New employees must change this password on first login.' : `Editing ${initial?.name || initial?.id || ''}`}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="employee-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : mode === 'create' ? 'Create employee' : 'Save changes'}
          </button>
        </>
      }
    >
      <form id="employee-form" onSubmit={submit} className="stack">
        <PhotoPicker
          value={form.photo}
          onChange={(photo) => setForm((prev) => ({ ...prev, photo }))}
          name={form.name || form.id}
          label="Employee photo"
        />
        <div className="form-grid">
          <TextField label="Employee name" required value={form.name} onChange={update('name')} autoFocus />
          <TextField label="Employee ID" required value={form.id} onChange={update('id')} hint="Renaming moves attendance records with it." />
          <PasswordField
            label={mode === 'create' ? 'Starting password' : 'Reset password (optional)'}
            required={mode === 'create'}
            value={form.pass}
            onChange={update('pass')}
            autoComplete="new-password"
            hint="Minimum 8 characters."
          />
          <TextField label="Designation" value={form.desg} onChange={update('desg')} placeholder="e.g. Store helper" />
          <TextField label="Mobile" value={form.mob} onChange={update('mob')} inputMode="numeric" />
          <Field label="Status">
            <select value={form.status} onChange={update('status')}>
              <option value="Enabled">Enabled</option>
              <option value="Disabled">Disabled</option>
            </select>
          </Field>
        </div>

        <div className="divider" />
        <h3 className="subhead">Store & geofence</h3>
        <div className="form-grid">
          <TextField label="Store name" required value={form.store} onChange={update('store')} placeholder="e.g. Main Branch" />
          <TextField label="Store area" value={form.storeArea} onChange={update('storeArea')} placeholder="e.g. Andheri West" />
          <TextField label="Latitude" required value={form.storeLat} onChange={update('storeLat')} inputMode="decimal" placeholder="19.0760" />
          <TextField label="Longitude" required value={form.storeLon} onChange={update('storeLon')} inputMode="decimal" placeholder="72.8777" />
          <TextField label="Store location link" value={form.storeLink} onChange={update('storeLink')} placeholder="https://maps.google.com/?q=19.07,72.87" className="span-2" />
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-tiny btn-ghost" onClick={generateLink}>Generate link from lat/lon</button>
          <button type="button" className="btn btn-tiny btn-ghost" onClick={extractCoords}>Extract lat/lon from link</button>
        </div>
        <p className="field-hint">Punch is accepted only within 125 m of these coordinates. Use the exact store location.</p>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
      </form>
    </Modal>
  );
}

function EmployeeViewModal({ employee, records, onClose, onImage }) {
  if (!employee) return null;
  const coords = employeeCoords(employee);
  const mine = records.filter((record) => sameId(record.empId, employee.id)).slice(0, 8);
  return (
    <Modal
      open={Boolean(employee)}
      onClose={onClose}
      title={`${employee.name || employee.id}`}
      subtitle={`${employee.id} · ${employee.designation || employee.desg || 'Employee'}`}
      size="lg"
      footer={<button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>}
    >
      <div className="profile-summary">
        <Avatar photo={employee.photo} name={employee.name} size={72} />
        <div>
          <Badge tone={employee.status === 'Enabled' ? 'present' : 'disabled'}>{employee.status}</Badge>
          <p className="muted">{employee.desg || 'No designation'} · {employee.mob || 'No mobile'}</p>
        </div>
      </div>
      <div className="detail-list">
        <div><span>Store</span><strong>{employee.store || '—'}{employee.storeArea ? ` · ${employee.storeArea}` : ''}</strong></div>
        <div><span>Coordinates</span><strong>{coords ? `${coords.lat}, ${coords.lon}` : 'Not set'}</strong></div>
        <div><span>Store link</span><a href={employee.storeLink || (coords ? mapsLink(coords.lat, coords.lon) : '#')} target="_blank" rel="noreferrer">Open map</a></div>
        <div><span>Created</span><strong>{employee.created || '—'}</strong></div>
      </div>
      <h3 className="subhead">Recent attendance</h3>
      {mine.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Hours</th><th>Status</th><th>Evidence</th></tr></thead>
            <tbody>
              {mine.map((record) => {
                const status = getStatus(record);
                return (
                  <tr key={`${record.empId}-${record.date}`}>
                    <td>{fmtDate(record.date, 'short')}</td>
                    <td>{record.inTime || '—'}</td>
                    <td>{record.outTime || '—'}</td>
                    <td>{fmtDuration(workedSeconds(record))}</td>
                    <td><Badge tone={status.tone}>{status.label}</Badge></td>
                    <td>
                      <div className="thumb-row">
                        {record.inPhoto ? <button type="button" className="thumb" onClick={() => onImage(record.inPhoto, `${record.date} · IN`)}><img src={record.inPhoto} alt="IN evidence" /></button> : null}
                        {record.outPhoto ? <button type="button" className="thumb" onClick={() => onImage(record.outPhoto, `${record.date} · OUT`)}><img src={record.outPhoto} alt="OUT evidence" /></button> : null}
                        {!record.inPhoto && !record.outPhoto ? <span className="muted">—</span> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <EmptyState icon="📭" title="No records yet" message="Attendance punches for this employee will appear here." />}
    </Modal>
  );
}

export default function AdminPage() {
  useDocumentTitle('Admin');
  const { session, signIn, signOut, remainingMs } = useAuth();
  const { notify, confirm } = useToast();
  const now = useNow(1000);
  const authed = session?.role === 'adm';

  useEffect(() => {
    setActive('dashboard');
    setEmpModal(null);
    setViewEmployee(null);
    setImage(null);
    setEmpSearch('');
    setEmpStatus('all');
    setEmployeeFilter('');
    setDate('');
    setStatusFilter('');
    setRecSearch('');
    setFirstPass('');
    setFirstConfirm('');
    setFirstError('');
  }, [session?.id]);

  const [admin, setAdmin] = useState(getAdmin);
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [active, setActive] = useState('dashboard');
  const [syncing, setSyncing] = useState(false);
  const [empModal, setEmpModal] = useState(null);
  const [viewEmployee, setViewEmployee] = useState(null);
  const [image, setImage] = useState(null);
  const [empSearch, setEmpSearch] = useState('');
  const [empStatus, setEmpStatus] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [month, setMonth] = useState(monthKey());
  const [date, setDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [recSearch, setRecSearch] = useState('');
  const [email, setEmail] = useState(getAdminEmail);
  const [importing, setImporting] = useState(false);
  const [profile, setProfile] = useState(() => ({ ...getAdmin(), currentPass: '', newPass: '', confirm: '' }));
  const [firstPass, setFirstPass] = useState('');
  const [firstConfirm, setFirstConfirm] = useState('');
  const [firstError, setFirstError] = useState('');
  const [firstBusy, setFirstBusy] = useState(false);

  const refreshProfile = useCallback((value) => {
    setProfile({ ...value, currentPass: '', newPass: '', confirm: '' });
  }, []);

  const firstAdminId = useMemo(() => getAdmins()[0]?.id || admin.id, [admin.id]);

  const persistEmployees = useCallback((next, ownerId = admin.id) => {
    const all = getEmployees();
    const keep = all.filter((employee) => !sameId(employee.adminId || firstAdminId, ownerId));
    const normalized = next.map((employee) => normalizeEmployee({ ...employee, adminId: employee.adminId || ownerId }));
    saveEmployees([...keep, ...normalized]);
    setEmployees(normalized);
  }, [admin.id, firstAdminId]);

  const persistRecords = useCallback((next, ownerId = admin.id) => {
    const all = getRecords();
    const keep = all.filter((record) => !(record.adminId ? sameId(record.adminId, ownerId) : sameId(ownerId, firstAdminId)));
    const normalized = next.map(normalizeRecord);
    saveRecords([...keep, ...normalized]);
    setRecords(normalized);
  }, [admin.id, firstAdminId]);

  const applyPull = useCallback((data) => {
    let nextAdmin = getAdmin();
    if (data.admin) {
      nextAdmin = { ...nextAdmin, ...data.admin, pass: nextAdmin.pass || '' };
      saveAdmin(nextAdmin);
      setAdmin(nextAdmin);
      refreshProfile(nextAdmin);
    }
    if (Array.isArray(data.emp)) {
      const incoming = data.emp.map((employee) => normalizeEmployee({ ...employee, adminId: employee.adminId || nextAdmin.id }));
      persistEmployees(incoming);
    }
    if (Array.isArray(data.rec)) {
      persistRecords(data.rec.map(normalizeRecord));
    }
    scrubLocalSecrets();
  }, [persistEmployees, persistRecords, refreshProfile]);

  const storeRenamedAdmin = useCallback((oldId, updated) => {
    const others = getAdmins().filter((item) => !sameId(item.id, oldId) && !sameId(item.id, updated.id));
    saveAdmins([...others, updated]);
    saveAdmin(updated);
  }, []);

  const pullCloud = useCallback(async (silent = false) => {
    if (!isCloudMode() || !getToken()) return false;
    setSyncing(true);
    try {
      const data = await api.pull();
      applyPull(data);
      if (!silent) notify('Attendance data refreshed from the cloud.', 'success');
      return true;
    } catch (error) {
      notify(errorMessage(error), silent ? 'warning' : 'error');
      return false;
    } finally {
      setSyncing(false);
    }
  }, [applyPull, notify]);

  useEffect(() => {
    if (!authed) return;
    const localAdmin = localAdminFor(session.id);
    if (!localAdmin) {
      if (isCloudMode() && getToken()) {
        pullCloud(true).then((ok) => {
          if (!ok) {
            notify('Admin profile is unavailable. Please sign in again.', 'error');
            signOut({ remote: false });
          }
        });
      } else {
        notify('Admin profile not found. Please sign in again.', 'error');
        signOut({ remote: false });
      }
      return;
    }
    setAdmin(localAdmin);
    refreshProfile(localAdmin);
    const firstId = getAdmins()[0]?.id || localAdmin.id;
    const mine = employeesFor(localAdmin.id, getEmployees(), firstId);
    setEmployees(mine);
    setRecords(recordsFor(localAdmin.id, getRecords(), firstId));
    setEmail(getAdminEmail());
    if (isCloudMode()) pullCloud(true);
  }, [authed, session?.id, notify, pullCloud, refreshProfile, signOut]);

  const handleLogin = async (id, pass) => {
    if (isCloudMode()) {
      const data = await api.login('adm', normalizeId(id), pass);
      const cloudAdmin = normalizeAdmin({ ...(data.admin || {}), pass: '' });
      saveAdmin(cloudAdmin);
      scrubLocalSecrets();
      setAdmin(cloudAdmin);
      refreshProfile(cloudAdmin);
      signIn('adm', cloudAdmin.id || normalizeId(id));
      return;
    }
    const candidate = getAdmins().find((item) => sameId(item.id, id));
    if (!candidate || candidate.pass !== pass) throw new ApiError('wrong');
    if (candidate.status === 'Disabled') throw new ApiError('disabled');
    signIn('adm', candidate.id);
  };

  const handleLogout = async () => {
    await signOut();
    setActive('dashboard');
  };

  const pushCloud = async () => {
    if (!getToken()) throw new ApiError('login-required');
    await api.push({ emp: employees, rec: records, admin });
    return 'Attendance data saved to the cloud.';
  };

  const saveEmployee = async (form, mode) => {
    if (isCloudMode()) {
      try {
        if (mode === 'create') {
          await api.createEmployee({
            id: form.id,
            name: form.name,
            pass: form.pass,
            desg: form.desg,
            mob: form.mob,
            photo: form.photo,
            store: form.store,
            storeArea: form.storeArea,
            storeLat: form.storeLat,
            storeLon: form.storeLon,
            storeLink: form.storeLink,
            status: form.status,
          });
        } else {
          const original = empModal?.employee;
          if (original && !sameId(original.id, form.id)) {
            await api.renameEmployee(original.id, form.id, form.name);
          }
          await api.updateEmployee(form.id, {
            name: form.name,
            desg: form.desg,
            mob: form.mob,
            photo: form.photo,
            store: form.store,
            storeArea: form.storeArea,
            storeLat: form.storeLat,
            storeLon: form.storeLon,
            storeLink: form.storeLink,
            status: form.status,
            pass: form.pass || undefined,
          });
        }
        await pullCloud(true);
        notify(mode === 'create' ? 'Employee created.' : 'Employee updated.', 'success');
        setEmpModal(null);
        return;
      } catch (error) {
        throw new Error(errorMessage(error));
      }
    }

    if (mode === 'create') {
      persistEmployees([
        ...employees,
        normalizeEmployee({
          ...form,
          pass: form.pass,
          created: todayStr(),
          mustChangePass: true,
          adminId: admin.id,
        }),
      ]);
    } else {
      const original = empModal?.employee;
      const next = employees.map((employee) =>
        sameId(employee.id, original.id)
          ? normalizeEmployee({
              ...employee,
              ...form,
              pass: form.pass || employee.pass,
              mustChangePass: form.pass ? false : employee.mustChangePass,
            })
          : employee,
      );
      if (original && !sameId(original.id, form.id)) {
        persistRecords(
          records.map((record) =>
            sameId(record.empId, original.id) ? { ...record, empId: form.id, name: form.name } : record,
          ),
        );
      }
      persistEmployees(next);
    }
    notify(mode === 'create' ? 'Employee created on this device.' : 'Employee updated on this device.', 'success');
    setEmpModal(null);
  };

  const toggleEmployee = async (employee) => {
    const enable = employee.status !== 'Enabled';
    const ok = await confirm({
      title: enable ? 'Enable employee?' : 'Disable employee?',
      message: enable ? `${employee.id} will be able to punch attendance again.` : `${employee.id} will be blocked immediately.`,
      confirmLabel: enable ? 'Enable' : 'Disable',
      tone: enable ? 'primary' : 'danger',
    });
    if (!ok) return;
    try {
      if (isCloudMode()) {
        await api.setEmployeeStatus(employee.id, enable);
        await pullCloud(true);
      } else {
        persistEmployees(employees.map((item) => (item.id === employee.id ? { ...item, status: enable ? 'Enabled' : 'Disabled' } : item)));
      }
      notify(`${employee.id} ${enable ? 'enabled' : 'disabled'}.`, 'success');
    } catch (error) {
      notify(errorMessage(error), 'error');
    }
  };

  const removeEmployee = async (employee) => {
    const ok = await confirm({
      title: 'Delete employee?',
      message: `Delete ${employee.name || employee.id} (${employee.id})? Their attendance records stay for audit. This cannot be undone.`,
      confirmLabel: 'Delete employee',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      if (isCloudMode()) {
        await api.deleteEmployee(employee.id);
        await pullCloud(true);
      } else {
        persistEmployees(employees.filter((item) => item.id !== employee.id));
      }
      notify(`${employee.id} deleted. Existing records were kept.`, 'success');
    } catch (error) {
      notify(errorMessage(error), 'error');
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const idError = validateNewId(profile.id);
    if (idError) return notify(idError, 'error');
    if (!String(profile.company || '').trim()) return notify('Company name is required.', 'error');
    const nextId = normalizeId(profile.id);
    if (getAdmins().some((item) => !sameId(item.id, admin.id) && sameId(item.id, nextId))) {
      return notify('That admin ID already belongs to another admin.', 'error');
    }
    if (!profile.currentPass) return notify('Enter your current password to save profile changes.', 'error');
    if (profile.newPass) {
      const pe = validatePassword(profile.newPass);
      if (pe) return notify(pe, 'error');
      if (profile.newPass !== profile.confirm) return notify('New passwords do not match.', 'error');
    }
    try {
      if (isCloudMode()) {
        const oldId = admin.id;
        const data = await api.updateAdminSelf({
          newId: nextId,
          name: profile.name,
          company: String(profile.company || '').trim(),
          mob: profile.mob,
          movie: profile.movie,
          birth: profile.birth,
          school: profile.school,
          photo: profile.photo,
          pass: profile.newPass || undefined,
          currentPass: profile.currentPass,
        });
        const updated = { ...admin, ...(data.admin || {}), pass: '' };
        const renamed = !sameId(updated.id, oldId);
        storeRenamedAdmin(oldId, updated);
        setAdmin(updated);
        refreshProfile(updated);
        if (renamed) {
          persistEmployees(employees.map((employee) => ({ ...employee, adminId: updated.id })), updated.id);
          persistRecords(records.map((record) => ({ ...record, adminId: updated.id })), updated.id);
          signIn('adm', updated.id);
        } else {
          await pullCloud(true);
        }
        notify('Admin profile updated in the cloud.', 'success');
      } else {
        if (profile.currentPass !== admin.pass) throw new ApiError('wrong-current-password');
        const oldId = admin.id;
        const updated = {
          ...admin,
          id: nextId,
          name: profile.name,
          company: String(profile.company || '').trim(),
          mob: profile.mob,
          movie: profile.movie,
          birth: profile.birth,
          school: profile.school,
          photo: profile.photo,
          pass: profile.newPass || admin.pass,
        };
        storeRenamedAdmin(oldId, updated);
        if (!sameId(oldId, nextId)) {
          persistEmployees(employees.map((employee) => ({ ...employee, adminId: nextId })));
          persistRecords(records.map((record) => ({ ...record, adminId: nextId })));
          signIn('adm', nextId);
        }
        setAdmin(updated);
        refreshProfile(updated);
        notify('Admin profile updated on this device.', 'success');
      }
    } catch (error) {
      notify(errorMessage(error), 'error');
    }
  };

  const submitFirstPassword = async (event) => {
    event.preventDefault();
    setFirstError('');
    const pe = validatePassword(firstPass);
    if (pe) return setFirstError(pe);
    if (firstPass !== firstConfirm) return setFirstError('Passwords do not match.');
    setFirstBusy(true);
    try {
      if (isCloudMode()) {
        await api.changePassword('', firstPass);
      }
      const updated = saveAdmin({
        ...admin,
        pass: isCloudMode() ? '' : firstPass,
        mustChangePass: false,
      });
      setAdmin(updated);
      refreshProfile(updated);
      setFirstPass('');
      setFirstConfirm('');
      notify('Password updated. You can now use the admin portal.', 'success');
    } catch (error) {
      setFirstError(errorMessage(error));
    } finally {
      setFirstBusy(false);
    }
  };

  const filteredEmployees = useMemo(() => {
    const query = empSearch.trim().toLowerCase();
    return employees.filter((employee) => {
      if (empStatus !== 'all' && employee.status !== empStatus) return false;
      if (!query) return true;
      return [employee.id, employee.name, employee.desg, employee.mob, employee.store, employee.storeArea]
        .some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [employees, empSearch, empStatus]);

  const filteredRecords = useMemo(() => {
    const query = recSearch.trim().toLowerCase();
    return records
      .filter((record) => {
        if (date && record.date !== date) return false;
        if (!date && month && !record.date.startsWith(month)) return false;
        if (employeeFilter && !sameId(record.empId, employeeFilter)) return false;
        if (statusFilter && getStatus(record).label !== statusFilter) return false;
        if (!query) return true;
        return [record.empId, record.name, record.store, record.date]
          .some((value) => String(value || '').toLowerCase().includes(query));
      })
      .sort((a, b) => `${b.date}${b.inTime || ''}`.localeCompare(`${a.date}${a.inTime || ''}`));
  }, [records, date, month, employeeFilter, statusFilter, recSearch]);

  const today = todayStr();
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const todayRecords = records.filter((record) => record.date === today);
  const presentCount = todayRecords.filter((record) => getStatus(record).label === 'Present').length;
  const halfCount = todayRecords.filter((record) => getStatus(record).label === 'Half Day').length;
  const enabledEmployees = employees.filter((employee) => employee.status === 'Enabled');
  const markedIds = new Set(todayRecords.filter((record) => getStatus(record).label !== 'Absent').map((record) => record.empId));
  const absentCount = Math.max(0, enabledEmployees.length - markedIds.size);

  const stores = useMemo(() => {
    const map = new Map();
    employees.forEach((employee) => {
      const key = `${employee.store || 'Unassigned'}|${employee.storeArea || ''}`;
      const coords = employeeCoords(employee);
      if (!map.has(key)) {
        map.set(key, {
          name: employee.store || 'Unassigned',
          area: employee.storeArea || '',
          coords,
          employees: [],
          link: employee.storeLink || (coords ? mapsLink(coords.lat, coords.lon) : ''),
        });
      }
      map.get(key).employees.push(employee);
    });
    return Array.from(map.values());
  }, [employees]);

  const openStatus = (label) => {
    setDate(today);
    setMonth('');
    setStatusFilter(label);
    setEmployeeFilter('');
    setRecSearch('');
    setActive('attendance');
  };

  const resetFilters = () => {
    setMonth(monthKey());
    setDate('');
    setStatusFilter('');
    setEmployeeFilter('');
    setRecSearch('');
  };

  const exportCsv = () => {
    downloadText(`attendance-${today}.csv`, recordsToCsv(filteredRecords, employees), 'text/csv');
    notify(`${filteredRecords.length} records exported.`, 'success');
  };

  const clearAllRecords = async () => {
    const ok = await confirm({
      title: 'Clear attendance records?',
      message: 'This deletes every attendance record for your admin scope on this device and cloud. Employee profiles are kept. This cannot be undone.',
      confirmLabel: 'Clear records',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      if (isCloudMode()) {
        await api.clearRecords();
        await pullCloud(true);
      } else {
        persistRecords([]);
      }
      notify('Attendance records cleared.', 'success');
    } catch (error) {
      notify(errorMessage(error), 'error');
    }
  };

  const backupData = useCallback(
    () => buildBackup(employees, records, admin, getAdminEmail()),
    [employees, records, admin],
  );

  const downloadBackup = () => {
    const data = backupData();
    downloadText(`attendance-backup-${today}.json`, JSON.stringify(data, null, 2));
    notify('Backup downloaded. Keep it somewhere safe.', 'success');
  };

  const importBackup = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const parsed = parseBackup(await readFileText(file));
      const incomingEmployees = parsed.employees.map((employee) =>
        normalizeEmployee({ ...employee, adminId: admin.id }),
      );
      const incomingRecords = parsed.records.map((record) =>
        normalizeRecord({ ...record, adminId: admin.id }),
      );
      const mergedEmployees = mergeEmployees(employees, incomingEmployees);
      const mergedRecords = mergeRecords(records, incomingRecords);
      persistEmployees(mergedEmployees);
      persistRecords(mergedRecords);
      if (parsed.adminEmail) {
        saveAdminEmail(parsed.adminEmail);
        setEmail(parsed.adminEmail);
      }
      if (isCloudMode() && getToken()) {
        await api.push({ emp: mergedEmployees, rec: mergedRecords, admin });
      }
      notify(
        `Backup restored: ${incomingEmployees.length} employees and ${incomingRecords.length} records.`,
        'success',
        6000,
      );
    } catch (error) {
      notify(errorMessage(error) || error.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const saveEmail = () => {
    saveAdminEmail(email);
    notify(email ? 'Backup email saved.' : 'Backup email cleared.', 'success');
  };

  const emailBackup = () => {
    if (!email) return notify('Save an email address first.', 'warning');
    const data = backupData();
    const subject = encodeURIComponent(`Get-Attended backup · ${today}`);
    const body = encodeURIComponent(
      `Get-Attended backup\nDate: ${data.exportedAt}\nEmployees: ${data.emp.length}\nRecords: ${data.rec.length}\n\nDownload the JSON backup from the Admin > Backup screen and attach it to this email.`,
    );
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
    notify('Email draft opened. Attach the downloaded backup file.', 'info', 6000);
  };

  const copyTransferSteps = async () => {
    const text = [
      'Get-Attended transfer steps',
      '1. Log in as Admin and download the JSON backup.',
      '2. Send the file to the other device.',
      '3. Log in as Admin on the new device and upload it under Backup.',
      '4. Push to cloud (optional) so all devices match.',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      notify('Transfer steps copied.', 'success');
    } catch {
      notify('Could not copy automatically. Download the backup instead.', 'warning');
    }
  };

  if (!authed) {
    return (
      <LoginShell role="adm" title="Admin sign in" subtitle="Employees, stores, attendance and backups in one place.">
        <PortalLogin role="adm" idLabel="Admin ID" idPlaceholder="e.g. admin" onLogin={handleLogin} />
      </LoginShell>
    );
  }

  return (
    <AppShell
      role="adm"
      active={active}
      onNavigate={setActive}
      title={
        active === 'dashboard' ? 'Attendance dashboard'
          : active === 'employees' ? 'Employees'
            : active === 'stores' ? 'Stores'
              : active === 'attendance' ? 'Attendance records'
                : active === 'backup' ? 'Backup & sync'
                  : 'Settings'
      }
      subtitle={`${admin.name || admin.id} · ${employees.length} employees · ${isCloudMode() ? 'cloud connected' : 'offline device'}`}
      user={admin.name || session.id}
      company={admin.company || ''}
      photo={admin.photo}
      onLogout={handleLogout}
      remainingMs={remainingMs}
      actions={syncing ? <span className="badge badge-sync">Syncing…</span> : null}
    >
      {active === 'dashboard' ? (
        <>
          <div className="hero-strip">
            <div>
              <span className="eyebrow">Live overview · {nowTime}</span>
              <h2>Good {now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening'}, {admin.name || admin.id}</h2>
              <p>{markedIds.size} of {enabledEmployees.length} enabled employees have marked attendance today.</p>
            </div>
            <div className="hero-strip-actions">
              <button type="button" className="btn btn-primary" onClick={() => setEmpModal({ mode: 'create' })}>+ New employee</button>
              <button type="button" className="btn btn-ghost" onClick={() => { setActive('attendance'); resetFilters(); }}>View records</button>
            </div>
          </div>

          <div className="stat-grid five">
            <StatCard label="Total employees" value={employees.length} icon="👥" tone="indigo" onClick={() => setActive('employees')} />
            <StatCard label="Present today" value={presentCount} sub="Full day" icon="✓" tone="emerald" onClick={() => openStatus('Present')} />
            <StatCard label="Half day" value={halfCount} icon="◐" tone="amber" onClick={() => openStatus('Half Day')} />
            <StatCard label="Total records" value={records.length} icon="📋" tone="blue" onClick={() => { resetFilters(); setActive('attendance'); }} />
            <StatCard label="Absent today" value={absentCount} icon="—" tone="rose" onClick={() => { setActive('employees'); setEmpStatus('Enabled'); setEmpSearch(''); }} />
          </div>

          <div className="two-col">
            <div className="card">
              <div className="card-head">
                <div><h2>Today’s evidence</h2><p className="card-desc">Live punches captured within the store geofence.</p></div>
                <button type="button" className="link-btn" onClick={() => { setActive('attendance'); setDate(today); setMonth(''); }}>Open attendance →</button>
              </div>
              {todayRecords.length ? (
                <div className="evidence-grid">
                  {todayRecords.slice(0, 6).map((record) => {
                    const status = getStatus(record);
                    return (
                      <div className="evidence-card" key={`${record.empId}-${record.date}`}>
                        <div className="evidence-photo">
                          {record.inPhoto || record.outPhoto ? (
                            <button type="button" onClick={() => setImage({ src: record.outPhoto || record.inPhoto, title: `${record.name || record.empId} · ${record.date}` })}>
                              <img src={record.outPhoto || record.inPhoto} alt="Attendance evidence" />
                            </button>
                          ) : <span className="evidence-placeholder">No photo</span>}
                          <Badge tone={status.tone} className="evidence-badge">{status.label}</Badge>
                        </div>
                        <div className="evidence-meta">
                          <strong>{record.name || record.empId}</strong>
                          <small>{record.date} · {record.inTime || '—'}{record.outTime ? ` → ${record.outTime}` : ''}</small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState icon="📷" title="No punches today" message="Employee photos will appear here as soon as they mark attendance." />
              )}
            </div>

            <div className="card">
              <div className="card-head">
                <div><h2>Recent activity</h2><p className="card-desc">Latest records across your team.</p></div>
              </div>
              {records.length ? (
                <div className="timeline">
                  {records.slice(0, 6).map((record) => {
                    const status = getStatus(record);
                    return (
                      <div className="timeline-item" key={`${record.empId}-${record.date}`}>
                        <span className={`timeline-dot dot-${status.tone}`} />
                        <div>
                          <strong>{record.name || record.empId}</strong>
                          <small>{fmtDate(record.date, 'short')} · IN {record.inTime || '—'} · OUT {record.outTime || '—'}</small>
                        </div>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyState icon="⏳" title="No records yet" message="Attendance activity will show up in this timeline." />}
            </div>
          </div>
        </>
      ) : null}

      {active === 'employees' ? (
        <div className="card">
          <div className="card-head">
            <div><h2>Employees</h2><p className="card-desc">{employees.length} profiles · {enabledEmployees.length} enabled</p></div>
            <div className="toolbar">
              <input className="search-input" placeholder="Search employees…" value={empSearch} onChange={(event) => setEmpSearch(event.target.value)} />
              <select value={empStatus} onChange={(event) => setEmpStatus(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="Enabled">Enabled</option>
                <option value="Disabled">Disabled</option>
              </select>
              <button type="button" className="btn btn-primary btn-small" onClick={() => setEmpModal({ mode: 'create' })}>+ New employee</button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Employee</th><th>Designation</th><th>Store</th><th>Mobile</th><th>Status</th><th className="right">Access</th><th className="right">Actions</th></tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => (
                  <tr key={employee.id}>
                    <td>
                      <button type="button" className="identity identity-button" onClick={() => setViewEmployee(employee)}>
                        <Avatar photo={employee.photo} name={employee.name} size={36} />
                        <div><strong>{employee.name || employee.id}</strong><small>{employee.id}</small></div>
                      </button>
                    </td>
                    <td>{employee.desg || '—'}</td>
                    <td>
                      <div className="cell-stack"><strong>{employee.store || '—'}</strong><small>{employee.storeArea || ''}</small></div>
                    </td>
                    <td>{employee.mob || '—'}</td>
                    <td><Badge tone={employee.status === 'Enabled' ? 'present' : 'disabled'}>{employee.status}</Badge></td>
                    <td className="right"><Switch checked={employee.status === 'Enabled'} onChange={() => toggleEmployee(employee)} label={`Toggle ${employee.id}`} /></td>
                    <td className="right">
                      <div className="row-actions">
                        <button type="button" className="btn btn-tiny btn-ghost" onClick={() => setViewEmployee(employee)}>View</button>
                        <button type="button" className="btn btn-tiny btn-ghost" onClick={() => setEmpModal({ mode: 'edit', employee })}>Edit</button>
                        <button type="button" className="btn btn-tiny btn-danger-ghost" onClick={() => removeEmployee(employee)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredEmployees.length ? <tr><td colSpan={7} className="table-empty">No employees match this filter.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {active === 'stores' ? (
        <>
          <div className="stat-grid">
            <StatCard label="Stores" value={stores.length} icon="🏬" tone="indigo" />
            <StatCard label="Geofenced" value={stores.filter((store) => store.coords).length} sub="125 m radius" icon="📍" tone="emerald" />
            <StatCard label="Employees covered" value={employees.length} icon="👥" tone="blue" />
            <StatCard label="Stores missing coords" value={stores.filter((store) => !store.coords).length} icon="!" tone="rose" />
          </div>
          {stores.length ? (
            <div className="store-grid">
              {stores.map((store) => (
                <div className="card store-card" key={`${store.name}-${store.area}`}>
                  <div className="store-head">
                    <div className="store-icon">🏬</div>
                    <div>
                      <h3>{store.name}</h3>
                      <p>{store.area || 'No area set'}</p>
                    </div>
                    <Badge tone={store.coords ? 'present' : 'absent'}>{store.coords ? 'Geofenced' : 'No coords'}</Badge>
                  </div>
                  <div className="detail-list compact">
                    <div><span>Coordinates</span><strong>{store.coords ? `${store.coords.lat}, ${store.coords.lon}` : 'Not set'}</strong></div>
                    <div><span>Employees</span><strong>{store.employees.length}</strong></div>
                  </div>
                  <div className="employee-chips">
                    {store.employees.map((employee) => (
                      <button type="button" key={employee.id} className="employee-chip" onClick={() => setViewEmployee(employee)}>
                        <Avatar photo={employee.photo} name={employee.name} size={24} />
                        {employee.name || employee.id}
                      </button>
                    ))}
                  </div>
                  {store.link ? <a className="btn btn-small btn-ghost" href={store.link} target="_blank" rel="noreferrer">Open store map ↗</a> : null}
                </div>
              ))}
            </div>
          ) : <EmptyState icon="🏬" title="No stores yet" message="Create an employee with a store to see it grouped here." />}
        </>
      ) : null}

      {active === 'attendance' ? (
        <div className="card">
          <div className="card-head">
            <div><h2>Attendance records</h2><p className="card-desc">{filteredRecords.length} of {records.length} records shown.</p></div>
            <div className="toolbar wrap">
              <input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setDate(''); }} />
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              <select value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)}>
                <option value="">All employees</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.id} · {employee.name}</option>)}
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">All statuses</option>
                <option>Present</option><option>Half Day</option><option>IN Only</option><option>Absent</option><option>Week Off</option><option>Store Close</option>
              </select>
              <input className="search-input" placeholder="Search…" value={recSearch} onChange={(event) => setRecSearch(event.target.value)} />
              <button type="button" className="btn btn-tiny btn-ghost" onClick={resetFilters}>Reset</button>
              <button type="button" className="btn btn-tiny btn-primary" onClick={exportCsv}>Export CSV</button>
              <button type="button" className="btn btn-tiny btn-danger-ghost" onClick={clearAllRecords}>Clear records</button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="attendance-table">
              <thead>
                <tr><th>Employee</th><th>Date</th><th>Store</th><th>IN</th><th>OUT</th><th>Hours</th><th>Status</th><th>Evidence</th><th>Location</th></tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => {
                  const status = getStatus(record);
                  const employee = employees.find((item) => sameId(item.id, record.empId));
                  const inLink = record.inLocLink || (record.inLat ? mapsLink(record.inLat, record.inLon) : '');
                  const outLink = record.outLocLink || (record.outLat ? mapsLink(record.outLat, record.outLon) : '');
                  return (
                    <tr key={`${record.empId}-${record.date}`}>
                      <td>
                        <div className="identity">
                          <Avatar photo={employee?.photo || record.photo} name={record.name || record.empId} size={32} />
                          <div><strong>{record.name || employee?.name || record.empId}</strong><small>{record.empId}</small></div>
                        </div>
                      </td>
                      <td>{fmtDate(record.date, 'short')}</td>
                      <td>{record.store || employee?.store || '—'}</td>
                      <td>
                        <div className="cell-stack"><strong>{record.inTime || '—'}</strong>{record.inDistM != null ? <small>{record.inDistM} m</small> : null}</div>
                      </td>
                      <td>
                        <div className="cell-stack"><strong>{record.outTime || '—'}</strong>{record.outDistM != null ? <small>{record.outDistM} m</small> : null}</div>
                      </td>
                      <td>{fmtDuration(workedSeconds(record))}</td>
                      <td><Badge tone={status.tone}>{status.label}</Badge></td>
                      <td>
                        <div className="thumb-row">
                          {record.inPhoto ? <button type="button" className="thumb" onClick={() => setImage({ src: record.inPhoto, title: `${record.name || record.empId} · ${record.date} · IN` })}><img src={record.inPhoto} alt="IN" /></button> : null}
                          {record.outPhoto ? <button type="button" className="thumb" onClick={() => setImage({ src: record.outPhoto, title: `${record.name || record.empId} · ${record.date} · OUT` })}><img src={record.outPhoto} alt="OUT" /></button> : null}
                          {!record.inPhoto && !record.outPhoto ? <span className="muted">—</span> : null}
                        </div>
                      </td>
                      <td>
                        <div className="link-stack">
                          {inLink ? <a href={inLink} target="_blank" rel="noreferrer">IN map</a> : <span className="muted">—</span>}
                          {outLink ? <a href={outLink} target="_blank" rel="noreferrer">OUT map</a> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!filteredRecords.length ? <tr><td colSpan={9} className="table-empty">No records match these filters.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {active === 'backup' ? (
        <div className="settings-grid">
          <div className="stack">
            <div className="card">
              <div className="card-head">
                <div><h2>Local backup</h2><p className="card-desc">Download or restore employee profiles, attendance and admin metadata.</p></div>
              </div>
              <div className="stat-grid three">
                <StatCard label="Employees" value={employees.length} icon="👥" tone="indigo" />
                <StatCard label="Records" value={records.length} icon="📋" tone="blue" />
                <StatCard label="Mode" value={isCloudMode() ? 'Cloud' : 'Local'} icon="☁️" tone={isCloudMode() ? 'emerald' : 'amber'} />
              </div>
              <div className="backup-actions">
                <button type="button" className="btn btn-primary" onClick={downloadBackup}>Download JSON backup</button>
                <label className={`btn btn-ghost ${importing ? 'disabled' : ''}`}>
                  {importing ? 'Restoring…' : 'Upload & restore backup'}
                  <input type="file" accept=".json,application/json" onChange={importBackup} hidden disabled={importing} />
                </label>
                <button type="button" className="btn btn-ghost" onClick={copyTransferSteps}>Copy transfer steps</button>
              </div>
              <p className="field-hint">Restoring merges profiles and attendance into this admin account. Cloud mode also pushes the merged data when signed in.</p>
            </div>

            <div className="card">
              <div className="card-head">
                <div><h2>Email backup</h2><p className="card-desc">Save a destination inbox and open a pre-filled email draft.</p></div>
              </div>
              <div className="inline-form">
                <TextField label="Admin email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" />
                <button type="button" className="btn btn-primary" onClick={saveEmail}>Save email</button>
                <button type="button" className="btn btn-ghost" onClick={emailBackup}>Email backup</button>
                <button type="button" className="btn btn-ghost danger-text" onClick={() => { clearAdminEmail(); setEmail(''); notify('Backup email cleared.', 'info'); }}>Clear</button>
              </div>
              <p className="field-hint">Email clients cannot attach files automatically. The backup JSON is downloaded separately, ready to attach.</p>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div><h2>Cloud sync</h2><p className="card-desc">The optional shared backend for cross-device data.</p></div>
            </div>
            <CloudPanel
              onPull={async () => {
                const ok = await pullCloud(false);
                if (!ok) throw new Error('Cloud pull failed.');
                return '';
              }}
              onPush={pushCloud}
              onReLogin={() => signOut({ remote: false })}
              pullLabel="Sync from cloud"
              pushLabel="Push to cloud"
              note="Cloud sync stores employees and records under this admin only. Organizers manage admin accounts separately."
            />
          </div>
        </div>
      ) : null}

      {active === 'settings' ? (
        <div className="settings-grid">
          <div className="card">
            <div className="card-head">
              <div><h2>Admin profile</h2><p className="card-desc">Update your ID, contact details, photo and recovery answers.</p></div>
            </div>
            <form onSubmit={saveProfile} className="stack">
              <PhotoPicker value={profile.photo} onChange={(photo) => setProfile((prev) => ({ ...prev, photo }))} name={profile.name || profile.id} label="Admin photo" />
              <div className="form-grid">
                <TextField label="Admin ID" required value={profile.id} onChange={(event) => setProfile((prev) => ({ ...prev, id: event.target.value }))} />
                <TextField label="Name" value={profile.name} onChange={(event) => setProfile((prev) => ({ ...prev, name: event.target.value }))} />
                <TextField label="Company name" required maxLength={150} value={profile.company} onChange={(event) => setProfile((prev) => ({ ...prev, company: event.target.value }))} hint="Employees under this admin see this name at the top of their portal." />
                <TextField label="Mobile" value={profile.mob} onChange={(event) => setProfile((prev) => ({ ...prev, mob: event.target.value }))} maxLength={10} inputMode="numeric" />
                <TextField label="Favourite movie" value={profile.movie} onChange={(event) => setProfile((prev) => ({ ...prev, movie: event.target.value }))} />
                <TextField label="Birth place" value={profile.birth} onChange={(event) => setProfile((prev) => ({ ...prev, birth: event.target.value }))} />
                <TextField label="Class 10 school" value={profile.school} onChange={(event) => setProfile((prev) => ({ ...prev, school: event.target.value }))} />
              </div>
              <div className="divider" />
              <h3 className="subhead">Password</h3>
              <div className="form-grid">
                <PasswordField label="Current password" required value={profile.currentPass} onChange={(event) => setProfile((prev) => ({ ...prev, currentPass: event.target.value }))} />
                <div />
                <PasswordField label="New password (optional)" value={profile.newPass} onChange={(event) => setProfile((prev) => ({ ...prev, newPass: event.target.value }))} autoComplete="new-password" hint="Leave blank to keep current." />
                <PasswordField label="Confirm new password" value={profile.confirm} onChange={(event) => setProfile((prev) => ({ ...prev, confirm: event.target.value }))} autoComplete="new-password" />
              </div>
              <div><button type="submit" className="btn btn-primary">Save admin settings</button></div>
            </form>
          </div>
          <div className="card">
            <h2>Account facts</h2>
            <div className="detail-list">
              <div><span>Admin ID</span><strong>{admin.id}</strong></div>
              <div><span>Employee scope</span><strong>{employees.length} profiles</strong></div>
              <div><span>Attendance scope</span><strong>{records.length} records</strong></div>
              <div><span>Session remaining</span><strong>{Math.ceil(remainingMs / 60000)} min</strong></div>
              <div><span>Cloud sync</span><strong>{isCloudMode() ? 'Connected' : 'Offline'}</strong></div>
              <div><span>Organizer controls</span><strong>Enable / disable & deletion</strong></div>
            </div>
            <p className="field-hint">Disabling this admin from the Organizer portal immediately blocks this admin and every employee under them.</p>
          </div>
        </div>
      ) : null}

      <Modal
        open={Boolean(admin.mustChangePass)}
        onClose={() => {}}
        title="Set your new password"
        subtitle="Your admin ID was created with a temporary password. Choose a private password to continue."
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={handleLogout}>Sign out</button>
            <button type="submit" form="admin-first-pass-form" className="btn btn-primary" disabled={firstBusy}>
              {firstBusy ? 'Saving…' : 'Set password & continue'}
            </button>
          </>
        }
      >
        <form id="admin-first-pass-form" onSubmit={submitFirstPassword} className="stack">
          <PasswordField label="New password" required value={firstPass} onChange={(event) => setFirstPass(event.target.value)} autoComplete="new-password" hint="At least 8 characters." />
          <PasswordField label="Confirm new password" required value={firstConfirm} onChange={(event) => setFirstConfirm(event.target.value)} autoComplete="new-password" />
          {firstError ? <div className="form-error" role="alert">{firstError}</div> : null}
        </form>
      </Modal>

      <EmployeeFormModal
        open={Boolean(empModal)}
        mode={empModal?.mode || 'create'}
        initial={empModal?.employee}
        employees={employees}
        onClose={() => setEmpModal(null)}
        onSave={saveEmployee}
      />
      <EmployeeViewModal
        employee={viewEmployee}
        records={records}
        onClose={() => setViewEmployee(null)}
        onImage={(src, title) => setImage({ src, title })}
      />
      <Modal
        open={Boolean(image)}
        onClose={() => setImage(null)}
        title={image?.title || 'Attendance evidence'}
        size="lg"
        footer={<button type="button" className="btn btn-ghost" onClick={() => setImage(null)}>Close</button>}
      >
        {image ? <img className="evidence-img" src={image.src} alt="Attendance evidence" /> : null}
      </Modal>
    </AppShell>
  );
}
