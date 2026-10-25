import {
  DEFAULT_ADMIN,
  DEFAULT_ORGANIZER,
  STORAGE_KEYS,
} from './constants.js';

const memory = new Map();

const sameId = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

function safeStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = `__get_attended_${Date.now()}`;
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRaw(key, fallback = '') {
  const store = safeStorage();
  if (store) {
    try {
      const value = store.getItem(key);
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  }
  return memory.has(key) ? memory.get(key) : fallback;
}

export function writeRaw(key, value) {
  const store = safeStorage();
  const text = String(value ?? '');
  if (store) {
    try {
      store.setItem(key, text);
      return true;
    } catch {
      try {
        store.removeItem(key);
        store.setItem(key, text);
        return true;
      } catch {
        return false;
      }
    }
  }
  memory.set(key, text);
  return true;
}

export function removeKey(key) {
  const store = safeStorage();
  if (store) {
    try {
      store.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  memory.delete(key);
}

export function readJson(key, fallback) {
  const raw = readRaw(key, '');
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  return writeRaw(key, JSON.stringify(value));
}

export function normalizeId(value) {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, '');
}

export function normalizeOrganizer(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    ...DEFAULT_ORGANIZER,
    ...source,
    id: String(source.id || DEFAULT_ORGANIZER.id),
    pass: String(source.pass || ''),
    mob: String(source.mob || ''),
    movie: String(source.movie || ''),
    birth: String(source.birth || ''),
    school: String(source.school || ''),
    photo: String(source.photo || ''),
  };
}

export function normalizeAdmin(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    ...DEFAULT_ADMIN,
    ...source,
    id: String(source.id || ''),
    pass: String(source.pass || ''),
    name: String(source.name || ''),
    company: String(source.company || ''),
    mob: String(source.mob || ''),
    movie: String(source.movie || ''),
    birth: String(source.birth || ''),
    school: String(source.school || ''),
    photo: String(source.photo || ''),
    status: source.status === 'Disabled' ? 'Disabled' : 'Enabled',
    created: String(source.created || ''),
    mustChangePass:
      source.mustChangePass === true || source.mustChangePass === 1 || source.mustChangePass === '1',
  };
}

export function normalizeEmployee(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    ...source,
    id: String(source.id || ''),
    name: String(source.name || ''),
    pass: String(source.pass || ''),
    desg: String(source.desg || ''),
    mob: String(source.mob || ''),
    photo: String(source.photo || ''),
    store: String(source.store || ''),
    storeArea: String(source.storeArea || ''),
    storeLat: source.storeLat ?? '',
    storeLon: source.storeLon ?? '',
    storeLink: String(source.storeLink || ''),
    created: String(source.created || ''),
    status: source.status === 'Disabled' ? 'Disabled' : 'Enabled',
    adminId: String(source.adminId || ''),
    mustChangePass: source.mustChangePass === true,
  };
}

export function normalizeRecord(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    ...source,
    empId: String(source.empId || ''),
    name: String(source.name || ''),
    date: String(source.date || '').slice(0, 10),
    type: String(source.type || 'Duty'),
    inTime: String(source.inTime || ''),
    outTime: String(source.outTime || ''),
    adminId: String(source.adminId || ''),
  };
}

export function getOrganizer() {
  const stored = readJson(STORAGE_KEYS.organizer, null);
  if (stored && stored.id) return normalizeOrganizer(stored);
  return { ...DEFAULT_ORGANIZER };
}

export function saveOrganizer(value) {
  const organizer = normalizeOrganizer(value);
  writeJson(STORAGE_KEYS.organizer, organizer);
  return organizer;
}

export function getAdmins() {
  // An existing key is authoritative — even when it contains an empty array.
  // That is how a deleted last admin stays deleted instead of being replaced
  // by a built-in default account on the next read.
  const raw = readRaw(STORAGE_KEYS.admins, null);
  if (raw !== null) {
    try {
      const stored = JSON.parse(raw);
      if (Array.isArray(stored)) return stored.map(normalizeAdmin);
    } catch {
      /* Corrupted list: treat it as empty, never as "first run". */
    }
    return [];
  }

  // One-time migration from the legacy single-admin key. The old built-in
  // admin/Admin@124 account is deliberately dropped instead of migrated: it
  // must never come back after an organizer deleted it.
  const single = readJson(STORAGE_KEYS.admin, null);
  if (single && single.id) {
    const legacyPass = String(single.pass || '');
    const legacyDefault =
      sameId(single.id, 'admin') && (legacyPass === '' || legacyPass === 'Admin@124');
    if (!legacyDefault) {
      const migrated = [
        normalizeAdmin({
          ...single,
          status: single.status || 'Enabled',
        }),
      ];
      writeJson(STORAGE_KEYS.admins, migrated);
      return migrated;
    }
    removeKey(STORAGE_KEYS.admin);
  }

  // Admin accounts only ever come from the organizer (or the server).
  return [];
}

export function saveAdmins(values) {
  const admins = (Array.isArray(values) ? values : []).map(normalizeAdmin);
  writeJson(STORAGE_KEYS.admins, admins);
  return admins;
}

export function getAdmin() {
  const admins = getAdmins();
  const stored = readJson(STORAGE_KEYS.admin, null);
  if (stored && stored.id) {
    const match = admins.find((item) => sameId(item.id, stored.id));
    if (match) return match;
    // The saved profile no longer exists (deleted by the organizer). Never
    // fall through to another admin on the device.
    return normalizeAdmin({ ...DEFAULT_ADMIN, id: '', pass: '' });
  }
  // No saved profile: stay blank rather than borrowing another admin's
  // identity. Callers that need a profile pass the signed-in ID explicitly.
  return normalizeAdmin({ ...DEFAULT_ADMIN, id: '', pass: '' });
}

export function saveAdmin(value) {
  const admin = normalizeAdmin(value);
  if (!admin.id) return admin; // never create/resurrect an admin without an ID
  writeJson(STORAGE_KEYS.admin, admin);
  const admins = getAdmins();
  const index = admins.findIndex((item) => sameId(item.id, admin.id));
  if (index >= 0) admins[index] = { ...admins[index], ...admin };
  else admins.push(admin);
  saveAdmins(admins);
  return admin;
}

// Remove an admin from every local key: the admin list, the current profile,
// and the loose photo/email keys. Used after the organizer deletes the ID so
// no stale copy can sign in or come back on the next pull.
export function removeAdminProfile(id) {
  const wanted = normalizeId(id);
  if (!wanted) return getAdmins();
  const stored = readJson(STORAGE_KEYS.admin, null);
  if (stored && sameId(stored.id, wanted)) {
    removeKey(STORAGE_KEYS.admin);
    removeKey(STORAGE_KEYS.adminPhoto);
    removeKey(STORAGE_KEYS.adminEmail);
  }
  return saveAdmins(getAdmins().filter((item) => !sameId(item.id, wanted)));
}

export function getEmployees() {
  const stored = readJson(STORAGE_KEYS.employees, null);
  return Array.isArray(stored) ? stored.map(normalizeEmployee) : [];
}

export function saveEmployees(values) {
  const employees = (Array.isArray(values) ? values : []).map(normalizeEmployee);
  writeJson(STORAGE_KEYS.employees, employees);
  return employees;
}

export function getRecords() {
  const stored = readJson(STORAGE_KEYS.records, null);
  return Array.isArray(stored) ? stored.map(normalizeRecord) : [];
}

export function saveRecords(values) {
  const records = (Array.isArray(values) ? values : []).map(normalizeRecord);
  writeJson(STORAGE_KEYS.records, records);
  return records;
}

export function getSession() {
  const session = readJson(STORAGE_KEYS.session, null);
  if (!session || !session.role || !session.loginAt) return null;
  return session;
}

export function saveSession(session) {
  writeJson(STORAGE_KEYS.session, session);
  return session;
}

export function clearSession() {
  removeKey(STORAGE_KEYS.session);
}

export function getApiUrl() {
  return String(readRaw(STORAGE_KEYS.apiUrl, '') || '').replace(/\/+$/, '').trim();
}

export function getApiSecret() {
  return String(readRaw(STORAGE_KEYS.apiSecret, '') || '').trim();
}

export function setApiConfig(url, secret) {
  writeRaw(STORAGE_KEYS.apiUrl, String(url || '').replace(/\/+$/, '').trim());
  writeRaw(STORAGE_KEYS.apiSecret, String(secret || '').trim());
}

export function clearApiConfig() {
  removeKey(STORAGE_KEYS.apiUrl);
  removeKey(STORAGE_KEYS.apiSecret);
}

export function isCloudMode() {
  return getApiUrl().length > 8;
}

export function getToken() {
  return String(readRaw(STORAGE_KEYS.token, '') || '').trim();
}

export function setToken(token) {
  if (token) writeRaw(STORAGE_KEYS.token, String(token));
  else removeKey(STORAGE_KEYS.token);
}

export function clearToken() {
  removeKey(STORAGE_KEYS.token);
}

export function getAdminPhoto() {
  const admin = getAdmin();
  if (admin && admin.photo) return admin.photo;
  return String(readRaw(STORAGE_KEYS.adminPhoto, '') || '');
}

export function saveAdminPhoto(photo) {
  if (photo) writeRaw(STORAGE_KEYS.adminPhoto, photo);
  else removeKey(STORAGE_KEYS.adminPhoto);
  const admin = getAdmin();
  if (admin && admin.id) saveAdmin({ ...admin, photo: photo || '' });
}

export function getAdminEmail() {
  return String(readRaw(STORAGE_KEYS.adminEmail, '') || '').trim();
}

export function saveAdminEmail(email) {
  writeRaw(STORAGE_KEYS.adminEmail, String(email || '').trim());
}

export function clearAdminEmail() {
  removeKey(STORAGE_KEYS.adminEmail);
}

export function scrubLocalSecrets() {
  if (!isCloudMode()) return;
  const employees = getEmployees();
  let changed = false;
  employees.forEach((employee) => {
    if (employee.pass) {
      employee.pass = '';
      changed = true;
    }
  });
  if (changed) saveEmployees(employees);

  const admin = readJson(STORAGE_KEYS.admin, null);
  if (admin && admin.pass) writeJson(STORAGE_KEYS.admin, { ...admin, pass: '' });

  const admins = readJson(STORAGE_KEYS.admins, null);
  if (Array.isArray(admins)) {
    let adminsChanged = false;
    admins.forEach((item) => {
      if (item && item.pass) {
        item.pass = '';
        adminsChanged = true;
      }
    });
    if (adminsChanged) writeJson(STORAGE_KEYS.admins, admins);
  }

  const organizer = readJson(STORAGE_KEYS.organizer, null);
  if (organizer && organizer.pass) writeJson(STORAGE_KEYS.organizer, { ...organizer, pass: '' });
}
