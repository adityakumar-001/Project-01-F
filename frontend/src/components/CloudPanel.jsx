import { useEffect, useState } from 'react';
import { errorMessage } from '../lib/api.js';
import { useApiConfig } from '../lib/hooks.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  clearApiConfig,
  clearToken,
  getToken,
  setApiConfig,
} from '../lib/storage.js';
import { Badge, Field, PasswordField, TextField } from './ui.jsx';

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    throw new Error('Enter a valid http:// or https:// server URL.');
  }
}

export default function CloudPanel({
  onPull,
  onPush,
  onReLogin,
  pullLabel = 'Pull from cloud',
  pushLabel = 'Push to cloud',
  note,
}) {
  const config = useApiConfig();
  const [url, setUrl] = useState(config.url);
  const [secret, setSecret] = useState(config.secret);
  const [busy, setBusy] = useState('');
  const { notify } = useToast();

  useEffect(() => {
    setUrl(config.url);
    setSecret(config.secret);
  }, [config.url, config.secret]);

  const save = (event) => {
    event.preventDefault();
    let next;
    try {
      next = normalizeUrl(url);
    } catch (error) {
      return notify(error.message, 'error');
    }
    const changed = next !== config.url || secret !== config.secret;
    setApiConfig(next, secret);
    window.dispatchEvent(new Event('get-attended:config'));
    if (changed) {
      clearToken();
      if (!next) {
        notify('Cloud sync disabled. Continuing with the data on this device.', 'info');
        return;
      }
      notify('Cloud settings saved. Sign in again to use this server.', 'warning');
      onReLogin?.();
      return;
    }
    notify(next ? 'Cloud connection saved.' : 'Cloud sync disabled.', 'success');
  };

  const run = async (kind) => {
    if (!config.url) return notify('Save a cloud server URL first.', 'warning');
    if (!getToken()) return notify('Sign in again before syncing with the cloud.', 'warning');
    setBusy(kind);
    try {
      const message = kind === 'pull' ? await onPull?.() : await onPush?.();
      if (message) notify(message, 'success');
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setBusy('');
    }
  };

  const disconnect = () => {
    clearApiConfig();
    clearToken();
    window.dispatchEvent(new Event('get-attended:config'));
    setUrl('');
    setSecret('');
    notify('Cloud sync disconnected. Continuing with the data on this device.', 'info');
  };

  return (
    <div className="cloud-panel">
      <div className="cloud-status">
        <span className={`sync-dot ${config.url ? 'online' : ''}`} />
        <div>
          <strong>{config.url ? 'Cloud sync enabled' : 'Offline mode'}</strong>
          <p>{config.url || 'Data is stored only in this browser until you connect a server.'}</p>
        </div>
        <Badge tone={config.url ? 'present' : 'neutral'}>{config.url ? 'Linked' : 'Local'}</Badge>
      </div>

      <form onSubmit={save} className="cloud-form">
        <TextField
          label="API server URL"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://your-app.onrender.com"
          hint="The same Express server that hosts this app and /api."
          autoComplete="url"
        />
        <PasswordField
          label="API secret (optional)"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          placeholder="x-api-secret value, if configured"
          autoComplete="off"
          hint="Only required when the server sets API_SECRET."
        />
        <div className="btn-row">
          <button type="submit" className="btn btn-primary">Save connection</button>
          {config.url ? <button type="button" className="btn btn-ghost" onClick={disconnect}>Disconnect</button> : null}
        </div>
      </form>

      <div className="cloud-actions">
        <button type="button" className="btn btn-ghost" onClick={() => run('pull')} disabled={Boolean(busy)}>
          {busy === 'pull' ? 'Pulling…' : pullLabel}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => run('push')} disabled={Boolean(busy)}>
          {busy === 'push' ? 'Pushing…' : pushLabel}
        </button>
      </div>
      <p className="field-hint">{note || 'Cloud sync is optional. Every portal keeps working from local storage when offline.'}</p>
    </div>
  );
}
