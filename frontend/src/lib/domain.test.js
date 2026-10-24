import { describe, expect, it } from 'vitest';
import {
  getStatus,
  mergeRecords,
  metersBetween,
  nextAdminId,
  nextEmployeeId,
  parseBackup,
  parseLatLon,
  recordsToCsv,
  withinGeofence,
} from './domain.js';

describe('attendance status', () => {
  it('classifies types and in/out times', () => {
    expect(getStatus(null).label).toBe('Absent');
    expect(getStatus({ type: 'WeekOff' }).label).toBe('Week Off');
    expect(getStatus({ type: 'StoreClose' }).label).toBe('Store Close');
    expect(getStatus({ type: 'Duty' }).label).toBe('Absent');
    expect(getStatus({ type: 'Duty', inTime: '09:00:00' }).label).toBe('IN Only');
    expect(getStatus({ type: 'Duty', inTime: '09:00:00', outTime: '17:59:59' }).label).toBe('Half Day');
    expect(getStatus({ type: 'Duty', inTime: '09:00:00', outTime: '18:00:00' }).label).toBe('Present');
  });
});

describe('geofence', () => {
  it('measures distance and validates coordinates', () => {
    expect(Math.round(metersBetween(19.076, 72.8777, 19.076, 72.8777))).toBe(0);
    const near = withinGeofence({ storeLat: '19.076', storeLon: '72.8777' }, { lat: 19.0761, lon: 72.8777 });
    expect(near.needed).toBe(true);
    expect(near.ok).toBe(true);
    const far = withinGeofence({ storeLat: '19.076', storeLon: '72.8777' }, { lat: 19.08, lon: 72.8777 });
    expect(far.ok).toBe(false);
    expect(far.distance).toBeGreaterThan(125);
    expect(withinGeofence({}, { lat: 19, lon: 72 })).toEqual({ needed: false, ok: true, distance: null });
  });

  it('parses raw pairs, maps links and rejects invalid coordinates', () => {
    expect(parseLatLon('19.076,72.8777')).toEqual({ lat: 19.076, lon: 72.8777 });
    expect(parseLatLon('https://maps.google.com/?q=19.076,72.8777')).toEqual({ lat: 19.076, lon: 72.8777 });
    expect(parseLatLon('https://www.google.com/maps/@19.076,72.8777,15z')).toEqual({ lat: 19.076, lon: 72.8777 });
    expect(parseLatLon('not a place')).toBeNull();
    expect(parseLatLon('999,999')).toBeNull();
  });
});

describe('merge and backup helpers', () => {
  it('merges records by employee and date while keeping photos', () => {
    const merged = mergeRecords(
      [{ empId: 'EMP001', date: '2026-10-01', inTime: '09:00:00', inPhoto: 'local' }],
      [{ empId: 'emp001', date: '2026-10-01', outTime: '19:00:00', outPhoto: 'remote' }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ outTime: '19:00:00', inPhoto: 'local', outPhoto: 'remote' });
  });

  it('parses a valid backup and rejects unknown payloads', () => {
    const backup = parseBackup(JSON.stringify({ emp: [{ id: 'EMP001' }], rec: [{ empId: 'EMP001', date: '2026-10-01' }] }));
    expect(backup.employees).toHaveLength(1);
    expect(backup.records).toHaveLength(1);
    expect(() => parseBackup('not json')).toThrow(/valid JSON/i);
    expect(() => parseBackup('{"foo":1}')).toThrow(/No employee/i);
  });

  it('exports escaped CSV and generates sequential IDs', () => {
    const csv = recordsToCsv([
      { empId: 'EMP001', name: 'A, B', date: '2026-10-01', type: 'Duty', inTime: '09:00:00', outTime: '19:00:00' },
    ]);
    expect(csv).toContain('"A, B"');
    expect(csv).toContain('Present');
    expect(nextEmployeeId([{ id: 'EMP004' }])).toBe('EMP005');
    expect(nextAdminId([{ id: 'ADMIN009' }])).toBe('ADMIN010');
  });
});
