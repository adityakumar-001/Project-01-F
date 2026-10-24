import { useMemo, useState } from 'react';
import { errorMessage, forgot as cloudForgot } from '../lib/api.js';
import { DEFAULT_EMPLOYEE_PASSWORD } from '../lib/constants.js';
import { isCloudMode } from '../lib/storage.js';
import {
  getAdmin,
  getAdmins,
  getEmployees,
  getOrganizer,
  normalizeId,
  saveAdmin,
  saveAdmins,
  saveEmployees,
  saveOrganizer,
} from '../lib/storage.js';
import { useToast } from '../context/ToastContext.jsx';
import { Field, Modal, PasswordField, TextField } from './ui.jsx';

function makeCaptcha() {
  return {
    a: 2 + Math.floor(Math.random() * 8),
    b: 1 + Math.floor(Math.random() * 8),
  };
}

function resetLocalPassword(role, form) {
  if (role === 'emp') {
    const employees = getEmployees();
    const employee = employees.find((item) => item.id.toLowerCase() === normalizeId(form.id).toLowerCase());
    if (!employee || !employee.mob || String(form.mob).trim() !== String(employee.mob).trim()) {
      throw new Error('answers');
    }
    saveEmployees(
      employees.map((item) =>
        item.id === employee.id ? { ...item, pass: form.newPass, mustChangePass: false } : item,
      ),
    );
    return;
  }

  if (role === 'org') {
    const organizer = getOrganizer();
    if (
      organizer.id.toLowerCase() !== normalizeId(form.id).toLowerCase() ||
      !organizer.mob ||
      String(form.mob).trim() !== String(organizer.mob).trim() ||
      String(organizer.movie || '').trim().toLowerCase() !== String(form.movie).trim().toLowerCase() ||
      String(organizer.birth || '').trim().toLowerCase() !== String(form.birth).trim().toLowerCase() ||
      String(organizer.school || '').trim().toLowerCase() !== String(form.school).trim().toLowerCase()
    ) {
      throw new Error('answers');
    }
    saveOrganizer({ ...organizer, pass: form.newPass });
    return;
  }

  const admins = getAdmins();
  const admin = admins.find((item) => item.id.toLowerCase() === normalizeId(form.id).toLowerCase());
  if (
    !admin ||
    !admin.mob ||
    String(form.mob).trim() !== String(admin.mob).trim() ||
    String(admin.movie || '').trim().toLowerCase() !== String(form.movie).trim().toLowerCase() ||
    String(admin.birth || '').trim().toLowerCase() !== String(form.birth).trim().toLowerCase() ||
    String(admin.school || '').trim().toLowerCase() !== String(form.school).trim().toLowerCase()
  ) {
    throw new Error('answers');
  }
  saveAdmins(admins.map((item) => (item.id === admin.id ? { ...item, pass: form.newPass } : item)));
  const current = getAdmin();
  if (current.id.toLowerCase() === admin.id.toLowerCase()) saveAdmin({ ...current, pass: form.newPass });
}

function ForgotModal({ role, open, onClose }) {
  const empty = { id: '', mob: '', movie: '', birth: '', school: '', newPass: '', confirm: '' };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const { notify } = useToast();
  const security = role !== 'emp';

  const update = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const close = () => {
    setForm(empty);
    onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.id || !form.mob || !form.newPass || !form.confirm || (security && (!form.movie || !form.birth || !form.school))) {
      return notify('Please answer every security question.', 'error');
    }
    if (form.newPass.length < 8) return notify('Password must be at least 8 characters.', 'error');
    if (form.newPass !== form.confirm) return notify('New password and confirmation do not match.', 'error');
    setBusy(true);
    try {
      if (isCloudMode()) {
        await cloudForgot(role, {
          id: normalizeId(form.id),
          mob: form.mob.trim(),
          movie: form.movie.trim(),
          birth: form.birth.trim(),
          school: form.school.trim(),
          newPass: form.newPass,
        });
      } else {
        resetLocalPassword(role, form);
      }
      notify('Password reset. You can sign in with your new password.', 'success');
      close();
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Reset ${role === 'emp' ? 'employee' : role === 'adm' ? 'admin' : 'organizer'} password`}
      subtitle="Every security answer must match the saved profile."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
          <button type="submit" form="forgot-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Resetting…' : 'Reset password'}
          </button>
        </>
      }
    >
      <form id="forgot-form" onSubmit={submit} className="stack">
        <TextField label="ID" required value={form.id} onChange={update('id')} autoComplete="username" />
        <TextField label="Registered mobile" required value={form.mob} onChange={update('mob')} inputMode="numeric" />
        {security ? (
          <>
            <TextField label="Favourite movie" required value={form.movie} onChange={update('movie')} />
            <TextField label="Birth place" required value={form.birth} onChange={update('birth')} />
            <TextField label="Class 10 school" required value={form.school} onChange={update('school')} />
          </>
        ) : null}
        <PasswordField label="New password" required value={form.newPass} onChange={update('newPass')} autoComplete="new-password" hint="At least 8 characters." />
        <PasswordField label="Confirm new password" required value={form.confirm} onChange={update('confirm')} autoComplete="new-password" />
      </form>
    </Modal>
  );
}

export default function PortalLogin({ role, idLabel = 'ID', idPlaceholder = 'Enter your ID', onLogin }) {
  const [step, setStep] = useState(1);
  const [id, setId] = useState('');
  const [answer, setAnswer] = useState('');
  const [human, setHuman] = useState(false);
  const [captcha, setCaptcha] = useState(makeCaptcha);
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const { notify } = useToast();
  const simple = role === 'emp';

  const steps = useMemo(
    () => [
      { n: 1, label: 'ID' },
      { n: 2, label: 'Human' },
      { n: 3, label: 'Password' },
    ],
    [],
  );

  const continueId = (event) => {
    event.preventDefault();
    if (!normalizeId(id)) return setError(`Enter your ${idLabel.toLowerCase()}.`);
    setError('');
    setStep(simple ? 3 : 2);
    setCaptcha(makeCaptcha());
    setAnswer('');
    setHuman(false);
  };

  const verifyHuman = (event) => {
    event.preventDefault();
    if (!human) return setError('Tick the “I am human” box to continue.');
    if (Number(answer) !== captcha.a + captcha.b) return setError('Captcha answer is incorrect.');
    setError('');
    setStep(3);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!pass) return setError('Enter your password.');
    setError('');
    setBusy(true);
    try {
      await onLogin(normalizeId(id), pass);
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      notify(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setError('');
    setStep(Math.max(1, step - 1));
  };

  if (simple) {
    return (
      <>
        <form onSubmit={submit} className="login-form stack">
          <TextField
            label={idLabel}
            required
            value={id}
            onChange={(event) => setId(event.target.value)}
            placeholder={idPlaceholder}
            autoComplete="username"
            autoFocus
          />
          <PasswordField
            label="Password"
            required
            value={pass}
            onChange={(event) => setPass(event.target.value)}
            placeholder="Enter your password"
          />
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Employee login'}
          </button>
          <div className="login-links">
            <button type="button" className="link-btn" onClick={() => setForgotOpen(true)}>Forgot password?</button>
            <span className="muted-tiny">Default new-employee password: {DEFAULT_EMPLOYEE_PASSWORD}</span>
          </div>
        </form>
        <ForgotModal role={role} open={forgotOpen} onClose={() => setForgotOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div className="stepper" aria-label="Login progress">
        {steps.map((item) => (
          <div key={item.n} className={`stepper-item ${step === item.n ? 'active' : ''} ${step > item.n ? 'done' : ''}`.trim()}>
            <span className="stepper-dot">{step > item.n ? '✓' : item.n}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {step === 1 ? (
        <form onSubmit={continueId} className="login-form stack">
          <Field label={`Step 1 · ${idLabel}`} required>
            <input
              value={id}
              onChange={(event) => setId(event.target.value)}
              placeholder={idPlaceholder}
              autoComplete="username"
              autoFocus
            />
          </Field>
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <button type="submit" className="btn btn-primary btn-block">Continue →</button>
          <p className="login-note">The ID is checked when you enter your password.</p>
        </form>
      ) : null}

      {step === 2 ? (
        <form onSubmit={verifyHuman} className="login-form stack">
          <div className="verified-id">
            <span>ID verified for this step</span>
            <strong>{normalizeId(id)}</strong>
          </div>
          <div className="captcha-box" aria-label="Captcha question">
            <span>{captcha.a} + {captcha.b} = ?</span>
            <button type="button" className="link-btn" onClick={() => { setCaptcha(makeCaptcha()); setAnswer(''); }}>New captcha</button>
          </div>
          <TextField
            label="Captcha answer"
            type="number"
            required
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Enter the sum"
            inputMode="numeric"
            autoFocus
          />
          <label className="human-check">
            <input type="checkbox" checked={human} onChange={(event) => setHuman(event.target.checked)} />
            <span>I am human (not a robot)</span>
          </label>
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <div className="btn-row">
            <button type="button" className="btn btn-ghost" onClick={back}>← Back</button>
            <button type="submit" className="btn btn-primary grow">Verify &amp; continue →</button>
          </div>
        </form>
      ) : null}

      {step === 3 ? (
        <form onSubmit={submit} className="login-form stack">
          <div className="verified-id">
            <span>Signing in as</span>
            <strong>{normalizeId(id)}</strong>
          </div>
          <PasswordField
            label="Password"
            required
            value={pass}
            onChange={(event) => setPass(event.target.value)}
            placeholder={role === 'org' ? 'Organizer password' : 'Admin password'}
            autoFocus
          />
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : `${role === 'org' ? 'Organizer' : 'Admin'} login`}
          </button>
          <div className="login-links column">
            <button type="button" className="link-btn" onClick={() => setForgotOpen(true)}>Forgot password? Reset via security questions</button>
            <button type="button" className="link-btn muted" onClick={back}>← Back</button>
          </div>
        </form>
      ) : null}

      <ForgotModal role={role} open={forgotOpen} onClose={() => setForgotOpen(false)} />
    </>
  );
}
