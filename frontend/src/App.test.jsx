import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';

function renderAt(path) {
  return render(
    <ToastProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </AuthProvider>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('app routes', () => {
  it('renders the landing page', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: /Every shift/i })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Admin/i }).length).toBeGreaterThan(0);
  });

  it('redirects legacy routes to the React portals', () => {
    renderAt('/organizer.html');
    expect(screen.getByRole('heading', { name: 'Organizer sign in' })).toBeInTheDocument();
  });

  it('shows each portal login when signed out', () => {
    const { unmount } = renderAt('/admin');
    expect(screen.getByRole('heading', { name: 'Admin sign in' })).toBeInTheDocument();
    unmount();

    renderAt('/employee');
    expect(screen.getByRole('button', { name: 'Employee login' })).toBeInTheDocument();
  });
});
