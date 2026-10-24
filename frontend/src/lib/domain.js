import { GEO_MAX_METERS, TIME_RULES } from './constants.js';

export function pad(value, size = 2) {
  return String(value).padStart(size, '0');
}

export function todayStr(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function timeStr(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function secsOfNow(date = new Date()) {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

export function parseTimeToSecs(value) {
  const parts = String(value || '').split(':').map(Number);
  if (!parts.length || parts.some(Number.isNaN)) return null;
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

export function fmtTime(value) {
  const secs = typeof value === 'number' ? value : parseTimeToSecs(value);
  if (secs == null) return '';
  const h = Math.floor(secs / 3600) % 24;
  const m = Math.floor((secs % 3600) / 60);
  return `${pad(h)}:${pad(m)}`;
}

export function fmtClock(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.max(0, Math.floor(secs % 60));
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function fmtCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}h ${pad(m)}m` : `${m}m ${pad(s)}s`;
}

export function fmtDate(value, style = 'long') {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  if (style === 'short') {
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function addDays(value, days) {
  const date = value instanceof Date ? new Date(value) : new Date(`${String(value).slice(0, 10)}T00:00:00`);
  date.setDate(date.getDate() + days);
  return todayStr(date);
}

export function monthDates(month) {
  const [year, mon] = String(month).split('-').map(Number);
  if (!year || !mon) return [];
  const last = new Date(year, mon, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${year}-${pad(mon)}-${pad(i + 1)}`);
}

export function isSunday(value) {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return date.getDay() === 0;
}

export function defaultRecordType(date = todayStr()) {
  return isSunday(date) ? 'WeekOff' : 'Duty';
}

export function workedSeconds(record) {
  const inSecs = parseTimeToSecs(record?.inTime);
  const outSecs = parseTimeToSecs(record?.outTime);
  if (inSecs == null || outSecs == null || outSecs < inSecs) return 0;
  return outSecs - inSecs;
}

export function fmtDuration(secs) {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${pad(m)}m`;
}

export function getStatus(record) {
  if (!record || !record.type) return { label: 'Absent', tone: 'absent' };
  if (record.type === 'StoreClose') return { label: 'Store Close', tone: 'store' };
  if (record.type === 'WeekOff') return { label: 'Week Off', tone: 'weekoff' };
  if (!record.inTime) return { label: 'Absent', tone: 'absent' };
  if (!record.outTime) return { label: 'IN Only', tone: 'inonly' };
  const outSecs = parseTimeToSecs(record.outTime);
  if (outSecs != null && outSecs < TIME_RULES.halfDayCutoff) {
    return { label: 'Half Day', tone: 'half' };
  }
  return { label: 'Present', tone: 'present' };
}

export function isMarked(record) {
  return Boolean(record && (record.inTime || record.type === 'WeekOff' || record.type === 'StoreClose'));
}

export function punchWindow(secs = secsOfNow()) {
  return {
    canIn: secs >= TIME_RULES.inStart && secs <= TIME_RULES.inEnd,
    canOut: secs <= TIME_RULES.outDeadline,
    inStartLabel: fmtTime(TIME_RULES.inStart),
    inEndLabel: fmtTime(TIME_RULES.inEnd),
    outDeadlineLabel: fmtTime(TIME_RULES.outDeadline),
  };
}

export function metersBetween(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function parseLatLon(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const pair = text.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
  if (pair) {
    const lat = Number(pair[1]);
    const lon = Number(pair[2]);
    return validCoords(lat, lon) ? { lat, lon } : null;
  }
  try {
    const url = new URL(text);
    const q = url.searchParams.get('q') || url.searchParams.get('query') || '';
    const m = q.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    if (m) {
      const lat = Number(m[1]);
      const lon = Number(m[2]);
      return validCoords(lat, lon) ? { lat, lon } : null;
    }
    const path = url.pathname.match(/@?(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (path) {
      const lat = Number(path[1]);
      const lon = Number(path[2]);
      return validCoords(lat, lon) ? { lat, lon } : null;
    }
  } catch {
    /* not a URL */
  }
  return null;
}

function validCoords(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export function mapsLink(lat, lon) {
  if (lat === '' || lon === '' || lat == null || lon == null) return '';
  return `https://maps.google.com/?q=${lat},${lon}`;
}

export function storeLink(name, coords) {
  if (coords) return mapsLink(coords.lat, coords.lon);
  return String(name || '');
}

export function employeeCoords(employee) {
  const lat = Number(employee?.storeLat);
  const lon = Number(employee?.storeLon);
  if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) return { lat, lon };
  return parseLatLon(employee?.storeLink);
}

export function withinGeofence(employee, current) {
  const target = employeeCoords(employee);
  if (!target || !current) return { needed: Boolean(target), ok: !target, distance: null };
  const distance = metersBetween(current.lat, current.lon, target.lat, target.lon);
  return { needed: true, ok: distance <= GEO_MAX_METERS, distance: Math.round(distance) };
}

export function nextId(values, prefix, start = 1) {
  let max = start - 1;
  (Array.isArray(values) ? values : []).forEach((item) => {
    const id = typeof item === 'string' ? item : item?.id;
    const match = String(id || '').match(new RegExp(`^${prefix}(\\d+)$`, 'i'));
    if (match) max = Math.max(max, Number(match[1]));
  });
  return `${prefix}${pad(max + 1, 3)}`;
}

export function nextEmployeeId(employees) {
  return nextId(employees, 'EMP', 1);
}

export function nextAdminId(admins) {
  return nextId(admins, 'ADMIN', 1);
}

export function validatePassword(value, min = 8) {
  const pass = String(value || '');
  if (pass.length < min) return `Password must be at least ${min} characters.`;
  return '';
}

export function validateNewId(value) {
  const id = String(value || '').trim();
  if (!id) return 'ID is required.';
  if (!/^[A-Za-z0-9._-]{2,40}$/.test(id)) {
    return 'ID may contain letters, numbers, dot, dash or underscore (2-40 chars).';
  }
  return '';
}

export function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function recordsToCsv(records, employees = []) {
  const byId = new Map(employees.map((employee) => [employee.id.toLowerCase(), employee]));
  const header = ['Employee ID', 'Name', 'Store', 'Date', 'Type', 'In Time', 'Out Time', 'Status', 'Hours'];
  const lines = records.map((record) => {
    const employee = byId.get(String(record.empId).toLowerCase());
    return [
      record.empId,
      record.name || employee?.name || '',
      record.store || employee?.store || '',
      record.date,
      record.type || 'Duty',
      record.inTime || '',
      record.outTime || '',
      getStatus(record).label,
      workedSeconds(record) ? fmtDuration(workedSeconds(record)) : '',
    ].map(escapeCsv).join(',');
  });
  return [header.join(','), ...lines].join('\r\n');
}

export function downloadText(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsText(file);
  });
}

export function mergeEmployees(local, remote, adminId = '') {
  const map = new Map();
  (Array.isArray(local) ? local : []).forEach((employee) => {
    if (!employee?.id) return;
    if (adminId && employee.adminId && String(employee.adminId).toLowerCase() !== String(adminId).toLowerCase()) return;
    map.set(String(employee.id).toLowerCase(), employee);
  });
  (Array.isArray(remote) ? remote : []).forEach((employee) => {
    if (!employee?.id) return;
    if (adminId && employee.adminId && String(employee.adminId).toLowerCase() !== String(adminId).toLowerCase()) return;
    const key = String(employee.id).toLowerCase();
    const previous = map.get(key) || {};
    map.set(key, {
      ...previous,
      ...employee,
      pass: employee.pass || previous.pass || '',
      adminId: employee.adminId || previous.adminId || adminId,
    });
  });
  return Array.from(map.values());
}

export function mergeRecords(local, remote) {
  const map = new Map();
  (Array.isArray(local) ? local : []).forEach((record) => {
    if (!record?.empId || !record?.date) return;
    map.set(`${String(record.empId).toLowerCase()}|${record.date}`, record);
  });
  (Array.isArray(remote) ? remote : []).forEach((record) => {
    if (!record?.empId || !record?.date) return;
    const key = `${String(record.empId).toLowerCase()}|${record.date}`;
    const previous = map.get(key) || {};
    map.set(key, {
      ...previous,
      ...record,
      inPhoto: record.inPhoto || previous.inPhoto || '',
      outPhoto: record.outPhoto || previous.outPhoto || '',
    });
  });
  return Array.from(map.values());
}

export function buildBackup(employees, records, admin, adminEmail) {
  return {
    app: 'Get-Attended',
    version: 2,
    exportedAt: new Date().toISOString(),
    emp: Array.isArray(employees) ? employees : [],
    rec: Array.isArray(records) ? records : [],
    admin: admin || null,
    adminEmail: adminEmail || '',
  };
}

export function parseBackup(raw) {
  let data;
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!data || typeof data !== 'object') throw new Error('Unrecognised backup file.');
  const employees = Array.isArray(data.emp) ? data.emp : Array.isArray(data.employees) ? data.employees : [];
  const records = Array.isArray(data.rec) ? data.rec : Array.isArray(data.records) ? data.records : [];
  if (!employees.length && !records.length) throw new Error('No employee or attendance data found in this file.');
  return {
    employees,
    records,
    admin: data.admin && typeof data.admin === 'object' ? data.admin : null,
    adminEmail: String(data.adminEmail || ''),
    exportedAt: String(data.exportedAt || ''),
  };
}

export function statusClass(tone) {
  return `badge badge-${tone || 'absent'}`;
}

export function filesizeLabel(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
