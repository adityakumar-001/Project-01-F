import { useEffect, useState } from 'react';
import { getApiSecret, getApiUrl } from './storage.js';

export function useNow(interval = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}

export function useApiConfig() {
  const read = () => ({ url: getApiUrl(), secret: getApiSecret() });
  const [config, setConfig] = useState(read);
  useEffect(() => {
    const refresh = () => setConfig(read());
    window.addEventListener('get-attended:config', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('get-attended:config', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return config;
}

export function useDocumentTitle(title) {
  useEffect(() => {
    if (title) document.title = `${title} • Get-Attended Pro`;
  }, [title]);
}
