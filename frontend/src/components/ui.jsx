import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { compressImage } from '../lib/face.js';
import { MAX_UPLOAD_BYTES } from '../lib/constants.js';
import { filesizeLabel } from '../lib/domain.js';
import { useToast } from '../context/ToastContext.jsx';

export function Field({ label, hint, error, required, children, className = '' }) {
  return (
    <div className={`field ${className}`.trim()}>
      {label ? (
        <label className="field-label">
          {label} {required ? <span className="req">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <div className="field-error">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

export function TextField({ label, hint, error, required, className, ...props }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      <input {...props} />
    </Field>
  );
}

export function PasswordField({ label, hint, error, required, value, onChange, placeholder, autoComplete = 'current-password', id }) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      <div className="pass-wrap">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="eye-btn"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          title={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? '🙈' : '👁️'}
        </button>
      </div>
    </Field>
  );
}

export function Badge({ tone = 'neutral', children, className = '' }) {
  return <span className={`badge badge-${tone} ${className}`.trim()}>{children}</span>;
}

export function StatCard({ label, value, sub, tone = 'indigo', icon, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`stat-card stat-${tone}`} onClick={onClick}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-body">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {sub ? <div className="stat-sub">{sub}</div> : null}
      </div>
    </Tag>
  );
}

export function Panel({ title, desc, actions, children, className = '', tone = '' }) {
  return (
    <section className={`card ${className}`.trim()}>
      {title || actions ? (
        <div className="card-head">
          <div>
            {title ? <h2>{title}</h2> : null}
            {desc ? <p className="card-desc">{desc}</p> : null}
          </div>
          {actions ? <div className="card-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={tone ? `card-body tone-${tone}` : 'card-body'}>{children}</div>
    </section>
  );
}

export function EmptyState({ icon = '📭', title, message, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {message ? <p>{message}</p> : null}
      {action || null}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="loading-row" role="status">
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function Avatar({ photo, name, size = 42, className = '' }) {
  const initial = String(name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <span className={`avatar ${className}`.trim()} style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>
      {photo ? <img src={photo} alt={name || 'Avatar'} /> : <span>{initial}</span>}
    </span>
  );
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      className={`switch ${checked ? 'on' : ''}`.trim()}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className="switch-thumb" />
    </button>
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  const panelRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <div ref={panelRef} className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-actions">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function PhotoPicker({ value, onChange, name, label = 'Photo', hint = 'JPG or PNG up to 10 MB. Stored compressed at 512px.' }) {
  const inputRef = useRef(null);
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return notify('Please choose an image file.', 'error');
    if (file.size > MAX_UPLOAD_BYTES) return notify(`Image is too large (${filesizeLabel(file.size)}). Max 10 MB.`, 'error');
    setBusy(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read that file.'));
        reader.readAsDataURL(file);
      });
      const compressed = await compressImage(dataUrl);
      onChange(compressed);
      notify('Photo updated.', 'success');
    } catch (error) {
      notify(error.message || 'Could not process that image.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="photo-picker">
      <Avatar photo={value} name={name} size={76} />
      <div className="photo-picker-body">
        <div className="photo-picker-label">{label}</div>
        <div className="photo-picker-actions">
          <button type="button" className="btn btn-small btn-ghost" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? 'Processing…' : value ? 'Change photo' : 'Upload photo'}
          </button>
          {value ? (
            <button type="button" className="btn btn-small btn-ghost danger-text" onClick={() => onChange('')} disabled={busy}>
              Remove
            </button>
          ) : null}
        </div>
        <div className="field-hint">{hint}</div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} hidden />
    </div>
  );
}
