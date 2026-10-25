import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SESSION_EXPIRED_EVENT, logout as apiLogout } from '../lib/api.js';
import { SESSION_TTL_MS, STORAGE_KEYS } from '../lib/constants.js';
import { useNow } from '../lib/hooks.js';
import {
  clearSession,
  clearToken,
  getAdmin,
  getAdmins,
  getEmployees,
  getOrganizer,
  getSession,
  isCloudMode,
  normalizeId,
  saveSession,
} from '../lib/storage.js';
import { useToast } from './ToastContext.jsx';

const AuthContext = createContext(null);

const ROLE_MAP = {
  emp: 'emp',
  employee: 'emp',
  adm: 'adm',
  admin: 'adm',
  org: 'org',
  organizer: 'org',
};

const sameId = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

// The local account list is the source of truth for offline sign-ins. Once the
// organizer deletes or disables an admin, an already-open session must stop.
function sessionAccountActive(session) {
  if (!session) return false;
  if (session.role === 'org') return true;
  if (session.role === 'adm') {
    const admin = getAdmins().find((item) => sameId(item.id, session.id));
    return Boolean(admin && admin.status !== 'Disabled');
  }
  if (session.role === 'emp') {
    const employee = getEmployees().find((item) => sameId(item.id, session.id));
    if (!employee || employee.status === 'Disabled') return false;
    // In cloud mode the employee profile can arrive before the owner admin
    // snapshot; the server already blocks login for a deleted owner.
    if (!isCloudMode() && employee.adminId) {
      const owner = getAdmins().find((item) => sameId(item.id, employee.adminId));
      if (!owner || owner.status === 'Disabled') return false;
    }
    return true;
  }
  return false;
}

function readSession() {
  const raw = getSession();
  if (!raw) return null;
  const role = ROLE_MAP[raw.role];
  const fallbackId = role === 'org' ? getOrganizer().id : role === 'adm' ? getAdmin().id : '';
  const id = normalizeId(raw.id || raw.empId || raw.adminId || fallbackId);
  if (!role || !id) return null;
  const ttl = SESSION_TTL_MS[role];
  if (!ttl || Date.now() - Number(raw.loginAt) >= ttl) {
    clearSession();
    return null;
  }
  const session = { ...raw, role, id, loginAt: Number(raw.loginAt) };
  if (!sessionAccountActive(session)) {
    clearSession();
    return null;
  }
  return session;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession);
  const { notify } = useToast();
  const now = useNow(1000);

  const signOut = useCallback(async ({ remote = true } = {}) => {
    if (remote && isCloudMode()) await apiLogout();
    else clearToken();
    clearSession();
    setSession(null);
  }, []);

  const expire = useCallback(() => {
    if (isCloudMode()) apiLogout();
    clearSession();
    clearToken();
    setSession(null);
    notify('Your session expired for security. Please sign in again.', 'warning', 6000);
  }, [notify]);

  useEffect(() => {
    if (!session) return undefined;
    const ttl = SESSION_TTL_MS[session.role] || 0;
    const left = ttl - (Date.now() - session.loginAt);
    if (left <= 0) {
      expire();
      return undefined;
    }
    const timer = setTimeout(expire, left + 200);
    return () => clearTimeout(timer);
  }, [session, expire]);

  // A 401 from the API means the account/session no longer exists (deleted or
  // disabled account, revoked token). Drop the local session immediately.
  useEffect(() => {
    const onExpired = () => {
      clearSession();
      setSession(null);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  // Re-check the local account list while a session is open. `storage` fires
  // for other tabs, `focus` catches changes made while this tab was hidden,
  // and the interval covers a deletion made in another tab that never fires
  // focus (for example two side-by-side windows).
  useEffect(() => {
    if (!session) return undefined;
    const validate = () => {
      if (!sessionAccountActive(session)) {
        clearSession();
        clearToken();
        setSession(null);
        notify('This account was deleted or disabled. Please sign in again.', 'warning', 6000);
      }
    };
    const onStorage = (event) => {
      if (
        event.key &&
        ![STORAGE_KEYS.admins, STORAGE_KEYS.employees, STORAGE_KEYS.session].includes(event.key)
      ) {
        return;
      }
      validate();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', validate);
    const timer = setInterval(validate, 15000);
    validate();
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', validate);
      clearInterval(timer);
    };
  }, [session, notify]);

  const signIn = useCallback((role, id, extra = {}) => {
    const next = {
      role,
      id: normalizeId(id),
      loginAt: Date.now(),
      ...extra,
    };
    saveSession(next);
    setSession(next);
    return next;
  }, []);

  const remainingMs = session
    ? Math.max(0, (SESSION_TTL_MS[session.role] || 0) - (now.getTime() - session.loginAt))
    : 0;

  const value = useMemo(
    () => ({
      session,
      signIn,
      signOut,
      expire,
      remainingMs,
      isAuthenticated: Boolean(session),
    }),
    [session, signIn, signOut, expire, remainingMs],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
