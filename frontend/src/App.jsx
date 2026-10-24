import { Navigate, Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import OrganizerPage from './pages/OrganizerPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import EmployeePage from './pages/EmployeePage.jsx';

function NotFound() {
  return (
    <div className="not-found">
      <img src="/brand/logo.png" alt="" className="brand-logo" />
      <span className="eyebrow">404</span>
      <h1>Page not found</h1>
      <p>The page you were looking for does not exist.</p>
      <a className="btn btn-primary" href="/">Back to Get-Attended</a>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/organizer" element={<OrganizerPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/employee" element={<EmployeePage />} />

      <Route path="/index.html" element={<Navigate to="/" replace />} />
      <Route path="/organizer.html" element={<Navigate to="/organizer" replace />} />
      <Route path="/admin.html" element={<Navigate to="/admin" replace />} />
      <Route path="/employee.html" element={<Navigate to="/employee" replace />} />
      <Route path="/legacy-unified.html" element={<Navigate to="/" replace />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
