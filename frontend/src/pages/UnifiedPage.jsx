import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import * as api from '../lib/api.js';
import { ApiError } from '../lib/api.js';
import {
  getAdmins,
  getEmployees,
  isCloudMode,
  normalizeAdmin,
  normalizeEmployee,
  normalizeId,
  saveAdmin,
  saveEmployees,
  scrubLocalSecrets,
} from '../lib/storage.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { useAuth } from '../context/AuthContext.jsx';
import LoginShell from '../components/LoginShell.jsx';
import PortalLogin from '../components/PortalLogin.jsx';
import AdminPage from './AdminPage.jsx';
import EmployeePage from './EmployeePage.jsx';

const sameId = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

function ownerAdmin(adminId, admins) {
  if (adminId) return admins.find((item) => sameId(item.id, adminId)) || null;
  return admins[0] || null;
}

const PORTAL_TABS = [
  { key: 'emp', label: 'Employee', icon: '👤' },
  { key: 'adm', label: 'Admin', icon: '🛡️' },
];

const PORTAL_COPY = {
  emp: {
    title: 'Employee sign in',
    subtitle: 'Capture attendance with photo, face and store location proof.',
    idLabel: 'Employee ID',
    idPlaceholder: 'e.g. EMP001',
  },
  adm: {
    title: 'Admin sign in',
    subtitle: 'Employees, stores, attendance and backups in one place.',
    idLabel: 'Admin ID',
    idPlaceholder: 'e.g. admin',
  },
};

export default function UnifiedPage() {
  useDocumentTitle('Employee & admin portal');
  const { session, signIn } = useAuth();
  const [role, setRole] = useState('emp');

  if (session?.role === 'emp') return <EmployeePage />;
  if (session?.role === 'adm') return <AdminPage />;
  if (session?.role === 'org') return <Navigate to="/organizer" replace />;

  const loginEmployee = async (id, pass) => {
    if (isCloudMode()) {
      const data = await api.login('emp', normalizeId(id), pass);
      const existing = getEmployees().find((item) => sameId(item.id, data.emp?.id || id));
      const cloudEmployee = normalizeEmployee({ ...(existing || {}), ...(data.emp || {}) });
      saveEmployees([...getEmployees().filter((item) => !sameId(item.id, cloudEmployee.id)), cloudEmployee]);
      scrubLocalSecrets();
      signIn('emp', cloudEmployee.id || normalizeId(id));
      return;
    }
    const found = getEmployees().find((item) => sameId(item.id, id));
    if (!found || found.pass !== pass) throw new ApiError('wrong');
    if (found.status === 'Disabled') throw new ApiError('disabled');
    const admin = ownerAdmin(found.adminId, getAdmins());
    if (found.adminId && !admin) throw new ApiError('admin-disabled');
    if (admin?.status === 'Disabled') throw new ApiError('admin-disabled');
    signIn('emp', found.id);
  };

  const loginAdmin = async (id, pass) => {
    if (isCloudMode()) {
      const data = await api.login('adm', normalizeId(id), pass);
      const cloudAdmin = normalizeAdmin({ ...(data.admin || {}), pass: '' });
      saveAdmin(cloudAdmin);
      scrubLocalSecrets();
      signIn('adm', cloudAdmin.id || normalizeId(id));
      return;
    }
    const candidate = getAdmins().find((item) => sameId(item.id, id));
    if (!candidate || candidate.pass !== pass) throw new ApiError('wrong');
    if (candidate.status === 'Disabled') throw new ApiError('disabled');
    saveAdmin(candidate);
    signIn('adm', candidate.id);
  };

  const copy = PORTAL_COPY[role];

  return (
    <LoginShell role={role} title={copy.title} subtitle={copy.subtitle}>
      <div className="portal-tabs" role="tablist" aria-label="Choose a portal">
        {PORTAL_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={role === tab.key}
            className={`portal-tab ${role === tab.key ? 'active' : ''}`.trim()}
            onClick={() => setRole(tab.key)}
          >
            <span aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>
      <PortalLogin
        key={role}
        role={role}
        idLabel={copy.idLabel}
        idPlaceholder={copy.idPlaceholder}
        onLogin={role === 'emp' ? loginEmployee : loginAdmin}
      />
    </LoginShell>
  );
}
