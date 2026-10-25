import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ADMIN, DEFAULT_ORGANIZER, STORAGE_KEYS } from './constants.js';
import {
  clearApiConfig,
  getAdmin,
  getAdmins,
  getEmployees,
  getOrganizer,
  getSession,
  isCloudMode,
  normalizeId,
  readRaw,
  saveAdmin,
  saveAdminEmail,
  saveAdmins,
  saveEmployees,
  saveOrganizer,
  saveSession,
  scrubLocalSecrets,
  setApiConfig,
} from './storage.js';

beforeEach(() => {
  localStorage.clear();
});

describe('identity storage', () => {
  it('seeds defaults and normalizes IDs', () => {
    expect(getOrganizer()).toMatchObject({ id: DEFAULT_ORGANIZER.id, pass: DEFAULT_ORGANIZER.pass });
    expect(getAdmins()).toHaveLength(1);
    expect(getAdmins()[0]).toMatchObject({ id: DEFAULT_ADMIN.id, status: 'Enabled' });
    expect(normalizeId('  ab\u200Bc  ')).toBe('abc');
  });

  it('migrates the legacy single-admin key into the admin list', () => {
    localStorage.setItem(STORAGE_KEYS.admin, JSON.stringify({ id: 'oldadmin', pass: 'Password@1', name: 'Old' }));
    const admins = getAdmins();
    expect(admins).toHaveLength(1);
    expect(admins[0]).toMatchObject({ id: 'oldadmin', name: 'Old', status: 'Enabled' });
    expect(localStorage.getItem(STORAGE_KEYS.admins)).toContain('oldadmin');
  });

  it('keeps a deleted last admin deleted instead of re-seeding the default', () => {
    saveAdmins([]);
    expect(getAdmins()).toEqual([]);
    expect(getAdmin()).toMatchObject({ id: '', pass: '' });
  });

  it('does not seed the default admin in cloud mode', () => {
    setApiConfig('https://api.example.com', '');
    expect(getAdmins()).toEqual([]);
    expect(getAdmin().id).toBe('');
    clearApiConfig();
  });

  it('keeps the current admin and admin list in sync', () => {
    saveAdmin({ id: 'admin', pass: 'Password@1', name: 'Primary' });
    expect(getAdmin()).toMatchObject({ id: 'admin', name: 'Primary' });
    expect(getAdmins().find((item) => item.id === 'admin').name).toBe('Primary');
    saveAdmins([{ id: 'ADMIN002', pass: 'Password@2', status: 'Disabled' }]);
    expect(getAdmins()[0]).toMatchObject({ id: 'ADMIN002', status: 'Disabled' });
    saveAdmin({ id: 'ADMIN002', name: 'Renamed' });
    expect(getAdmin()).toMatchObject({ id: 'ADMIN002', name: 'Renamed' });
    saveOrganizer({ id: 'owner', pass: 'Password@3', mob: '9999999999' });
    expect(getOrganizer()).toMatchObject({ id: 'owner', mob: '9999999999' });
    expect(readRaw(STORAGE_KEYS.adminEmail)).toBe('');
    saveAdminEmail('owner@example.com');
    expect(readRaw(STORAGE_KEYS.adminEmail)).toBe('owner@example.com');
  });

  it('accepts only timed sessions', () => {
    expect(getSession()).toBeNull();
    saveSession({ role: 'adm', loginAt: Date.now() });
    expect(getSession()).toMatchObject({ role: 'adm' });
    saveSession({ role: 'adm' });
    expect(getSession()).toBeNull();
  });
});

describe('cloud mode', () => {
  it('requires a usable API URL and trims secrets', () => {
    expect(isCloudMode()).toBe(false);
    setApiConfig('https://api.example.com///', '  secret  ');
    expect(readRaw(STORAGE_KEYS.apiUrl)).toBe('https://api.example.com');
    expect(readRaw(STORAGE_KEYS.apiSecret)).toBe('secret');
    expect(isCloudMode()).toBe(true);
    clearApiConfig();
    expect(isCloudMode()).toBe(false);
  });

  it('scrubs local passwords only while cloud mode is active', () => {
    saveEmployees([{ id: 'EMP001', pass: 'Password@1', adminId: 'admin' }]);
    saveOrganizer({ id: 'owner', pass: 'Password@2' });
    scrubLocalSecrets();
    expect(getEmployees()[0].pass).toBe('Password@1');

    setApiConfig('https://api.example.com', '');
    scrubLocalSecrets();
    expect(getEmployees()[0].pass).toBe('');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.organizer)).pass).toBe('');
  });
});
