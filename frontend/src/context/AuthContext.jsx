import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { logout as apiLogout } from '../lib/api.js';
import { SESSION_TTL_MS } from '../lib/constants.js';
import { useNow } from '../lib/hooks.js';
import {
  clearSession,
  clearToken,
  getAdmin,
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
  return { ...raw, role, id, loginAt: Number(raw.loginAt) };
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
