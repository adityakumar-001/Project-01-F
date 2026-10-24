import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { setApiConfig } from './lib/storage.js';
import { saveEmployees } from './lib/storage.js';

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

function answerHumanStep(container) {
  const captcha = container.querySelector('.captcha-box span').textContent;
  const [a, b] = captcha.match(/\d+/g).map(Number);
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: String(a + b) } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Verify/i }));
}

async function signInStepped(container, id, password, submitLabel) {
  fireEvent.change(container.querySelector('form.login-form input'), { target: { value: id } });
  fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
  answerHumanStep(container);
  fireEvent.change(container.querySelector('input[type="password"]'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: submitLabel }));
}

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('offline sign-in flows', () => {
  it('signs the default organizer in through the three-step form', async () => {
    const { container } = renderAt('/organizer');
    await signInStepped(container, 'organizer', 'Organizer@124', /Organizer login/i);
    expect(await screen.findByRole('heading', { name: 'Organizer dashboard' })).toBeInTheDocument();
  });

  it('signs the default admin in and shows the admin dashboard', async () => {
    const { container } = renderAt('/admin');
    await signInStepped(container, 'admin', 'Admin@124', /Admin login/i);
    expect(await screen.findByRole('heading', { name: 'Attendance dashboard' })).toBeInTheDocument();
  });

  it('signs an employee in with a locally saved profile', async () => {
    saveEmployees([{ id: 'EMP001', name: 'Asha', pass: 'Employee@1', adminId: 'admin', status: 'Enabled' }]);
    const { container } = renderAt('/employee');
    const inputs = container.querySelectorAll('form.login-form input');
    fireEvent.change(inputs[0], { target: { value: 'EMP001' } });
    fireEvent.change(inputs[1], { target: { value: 'Employee@1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Employee login' }));
    expect(await screen.findByRole('heading', { name: 'My dashboard' })).toBeInTheDocument();
  });
});

describe('cloud sign-in flow', () => {
  it('keeps a cloud admin signed in on a device with no local copy', async () => {
    setApiConfig('https://api.example.com', '');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (String(url).endsWith('/api/admin/login')) {
        return jsonResponse({ ok: true, admin: { id: 'ADMIN900', name: 'Cloud Admin' }, token: 'test-token' });
      }
      if (String(url).endsWith('/api/pull')) {
        expect(options.headers.Authorization).toBe('Bearer test-token');
        return jsonResponse({ ok: true, admin: { id: 'ADMIN900', name: 'Cloud Admin' }, emp: [], rec: [] });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const { container } = renderAt('/admin');
    await signInStepped(container, 'ADMIN900', 'Password@9', /Admin login/i);
    expect(await screen.findByRole('heading', { name: 'Attendance dashboard' })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('heading', { name: 'Admin sign in' })).not.toBeInTheDocument();
  });
});
