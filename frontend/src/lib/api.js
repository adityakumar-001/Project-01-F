import {
  getApiSecret,
  getApiUrl,
  getToken,
  setToken,
} from './storage.js';

export class ApiError extends Error {
  constructor(code, message, status = 0) {
    super(message || code || 'Request failed');
    this.name = 'ApiError';
    this.code = code || 'error';
    this.status = status;
  }
}

export function isAuthError(error) {
  return ['unauthorized', 'invalid-token', 'session-expired', 'login-required'].includes(error?.code);
}

export function errorMessage(error) {
  const code = error?.code;
  const messages = {
    'no-api': 'Cloud sync is not configured yet.',
    'login-required': 'Please sign in again.',
    unauthorized: 'Your session expired. Please sign in again.',
    'invalid-token': 'Your session expired. Please sign in again.',
    'session-expired': 'Your session expired. Please sign in again.',
    wrong: 'Incorrect ID or password.',
    disabled: 'This account has been disabled by the admin.',
    'admin-disabled': 'The admin who owns this account is disabled.',
    'id-pass-required': 'ID and password are required.',
    duplicate: 'That ID already exists.',
    'not-found': 'Record not found.',
    'wrong-current-password': 'Current password is incorrect.',
    'answers': 'Security answers do not match.',
    'password-too-short': 'Password must be at least 8 characters.',
    'weak-password': 'Password is too weak. Use at least 8 characters.',
    'id-invalid': 'Enter a valid ID.',
    forbidden: 'You do not have permission to do that.',
    'company-required': 'Company name is required. Enter the admin’s company name.',
    'db-error': 'The server could not complete that request.',
    'api-secret-invalid': 'API secret is incorrect.',
    'bad-request': 'The request was rejected by the server.',
  };
  if (messages[code]) return messages[code];
  if (error instanceof ApiError) return error.message;
  if (error?.name === 'TypeError') return 'Cannot reach the cloud server. Check the URL and connection.';
  return error?.message || 'Something went wrong.';
}

export async function request(path, options = {}) {
  const base = getApiUrl();
  if (!base) throw new ApiError('no-api');
  const { method = 'GET', body, auth = true, timeout = 20000 } = options;
  const token = getToken();
  if (auth && !token) throw new ApiError('login-required');

  const headers = { Accept: 'application/json' };
  const secret = getApiSecret();
  if (secret) headers['x-api-secret'] = secret;
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let response;
  try {
    response = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new ApiError('timeout', 'The cloud server took too long to respond.');
    throw new ApiError('network', 'Cannot reach the cloud server.');
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (response.status === 401) {
    setToken('');
    throw new ApiError(data?.error || 'unauthorized', errorMessage({ code: 'unauthorized' }), 401);
  }

  if (!response.ok) {
    const code = data?.error || `http-${response.status}`;
    throw new ApiError(code, errorMessage({ code }), response.status);
  }

  if (data && data.ok === false) {
    throw new ApiError(data.error || 'error', errorMessage(data), response.status);
  }

  if (!data) throw new ApiError('bad-response', 'The cloud server returned an unexpected response.', response.status);
  return data;
}

export async function login(role, id, pass) {
  const paths = {
    org: '/api/organizer/login',
    adm: '/api/admin/login',
    emp: '/api/employee/login',
  };
  const data = await request(paths[role], { method: 'POST', auth: false, body: { id, pass } });
  if (!data.token) throw new ApiError('bad-response', 'The server did not return a session token.');
  setToken(data.token);
  return data;
}

export async function logout() {
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } catch {
    /* token may already be invalid */
  } finally {
    setToken('');
  }
}

export async function changePassword(currentPass, newPass) {
  return request('/api/me/password', { method: 'PUT', body: { currentPass, newPass } });
}

export async function updateMe(payload) {
  return request('/api/me', { method: 'PUT', body: payload });
}

export async function forgot(role, payload) {
  const paths = {
    org: '/api/organizer/forgot',
    adm: '/api/admin/forgot',
    emp: '/api/employee/forgot',
  };
  return request(paths[role], { method: 'POST', auth: false, body: payload });
}

export async function pull() {
  return request('/api/pull');
}

export async function push(payload) {
  return request('/api/push', { method: 'POST', body: payload });
}

export async function createAdmin(payload) {
  return request('/api/admins', { method: 'POST', body: payload });
}

export async function updateAdmin(id, payload) {
  return request(`/api/admins/${encodeURIComponent(id)}`, { method: 'PUT', body: payload });
}

export async function deleteAdmin(id) {
  return request(`/api/admins/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function setAdminStatus(id, enabled) {
  return request(`/api/admins/${encodeURIComponent(id)}/${enabled ? 'enable' : 'disable'}`, { method: 'POST' });
}

export async function createEmployee(payload) {
  return request('/api/employees', { method: 'POST', body: payload });
}

export async function updateEmployee(id, payload) {
  return request(`/api/employees/${encodeURIComponent(id)}`, { method: 'PUT', body: payload });
}

export async function deleteEmployee(id) {
  return request(`/api/employees/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function setEmployeeStatus(id, enabled) {
  return request(`/api/employees/${encodeURIComponent(id)}/${enabled ? 'enable' : 'disable'}`, { method: 'POST' });
}

export async function renameEmployee(oldId, newId, name) {
  return request('/api/employees/rename', { method: 'POST', body: { oldId, newId, name } });
}

export async function updateAdminSelf(payload) {
  return request('/api/admin', { method: 'PUT', body: payload });
}

export async function updateOrganizer(payload) {
  return request('/api/organizer', { method: 'PUT', body: payload });
}

export async function clearRecords() {
  return request('/api/records', { method: 'DELETE' });
}

export async function getMyInfo() {
  return request('/api/me');
}
