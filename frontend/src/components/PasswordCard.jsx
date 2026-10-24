import { useState } from 'react';
import { PasswordField } from './ui.jsx';

export default function PasswordCard({ onSubmit, title = 'Change password', description, requireCurrent = true }) {
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (requireCurrent && !currentPass) return setError('Enter your current password.');
    if (newPass.length < 8) return setError('New password must be at least 8 characters.');
    if (newPass !== confirm) return setError('New password and confirmation do not match.');
    setBusy(true);
    try {
      await onSubmit(currentPass, newPass);
      setCurrentPass('');
      setNewPass('');
      setConfirm('');
    } catch (err) {
      setError(err.message || 'Could not change the password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="stack">
      <div>
        <h3 className="subhead">{title}</h3>
        {description ? <p className="card-desc">{description}</p> : null}
      </div>
      {requireCurrent ? (
        <PasswordField
          label="Current password"
          value={currentPass}
          onChange={(event) => setCurrentPass(event.target.value)}
          autoComplete="current-password"
        />
      ) : null}
      <PasswordField
        label="New password"
        value={newPass}
        onChange={(event) => setNewPass(event.target.value)}
        autoComplete="new-password"
        hint="At least 8 characters."
      />
      <PasswordField
        label="Confirm new password"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        autoComplete="new-password"
      />
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </form>
  );
}
