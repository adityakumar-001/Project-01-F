export const STORAGE_KEYS = {
  organizer: 'get_attend_organizer',
  admins: 'get_attend_admins',
  admin: 'get_attend_admin',
  employees: 'get_attend_employees',
  records: 'get_attend_records',
  adminPhoto: 'get_attend_admin_photo',
  adminEmail: 'get_attend_admin_email',
  apiUrl: 'get_attend_api_url',
  apiSecret: 'get_attend_api_secret',
  token: 'get_attend_auth_token',
  session: 'get_attend_session',
};

export const DEFAULT_ORGANIZER = {
  id: 'organizer',
  pass: 'Organizer@124',
  mob: '',
  movie: '',
  birth: '',
  school: '',
  photo: '',
};

export const DEFAULT_ADMIN = {
  id: 'admin',
  pass: 'Admin@124',
  name: '',
  mob: '',
  movie: '',
  birth: '',
  school: '',
  photo: '',
  status: 'Enabled',
  created: '',
};

export const DEFAULT_EMPLOYEE_PASSWORD = 'MAIPL@001';

export const SESSION_TTL_MS = {
  org: 60 * 60 * 1000,
  adm: 60 * 60 * 1000,
  emp: 15 * 60 * 1000,
};

export const GEO_MAX_METERS = 125;

export const TIME_RULES = {
  inStart: 8 * 3600,
  inEnd: 12 * 3600,
  outDeadline: 23 * 3600 + 59 * 60 + 50,
  halfDayCutoff: 18 * 3600,
};

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ROLE_LABELS = {
  org: 'Organizer',
  adm: 'Admin',
  emp: 'Employee',
};

export const NAV_ITEMS = {
  org: [
    { key: 'dashboard', label: 'Dashboard', icon: '📊' },
    { key: 'admins', label: 'Admins', icon: '👑' },
    { key: 'settings', label: 'Settings', icon: '⚙️' },
  ],
  adm: [
    { key: 'dashboard', label: 'Dashboard', icon: '📊' },
    { key: 'employees', label: 'Employees', icon: '👥' },
    { key: 'stores', label: 'Stores', icon: '🏬' },
    { key: 'attendance', label: 'Attendance', icon: '📋' },
    { key: 'backup', label: 'Backup', icon: '💾' },
    { key: 'settings', label: 'Settings', icon: '⚙️' },
  ],
  emp: [
    { key: 'dashboard', label: 'Dashboard', icon: '📊' },
    { key: 'punch', label: 'Mark Attendance', icon: '📸' },
    { key: 'attendance', label: 'My Attendance', icon: '📋' },
    { key: 'settings', label: 'Settings', icon: '⚙️' },
  ],
};
