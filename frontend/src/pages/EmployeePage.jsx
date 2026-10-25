import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../lib/api.js';
import { ApiError, errorMessage } from '../lib/api.js';
import { GEO_MAX_METERS } from '../lib/constants.js';
import {
  downloadText,
  employeeCoords,
  fmtDate,
  fmtDuration,
  getStatus,
  isSunday,
  mapsLink,
  metersBetween,
  monthDates,
  monthKey,
  punchWindow,
  recordsToCsv,
  secsOfNow,
  timeStr,
  todayStr,
  validatePassword,
  workedSeconds,
} from '../lib/domain.js';
import {
  captureFrame,
  hasHumanFace,
  loadImage,
  startCamera,
  stopStream,
} from '../lib/face.js';
import {
  getAdmins,
  getEmployees,
  getRecords,
  getToken,
  isCloudMode,
  normalizeEmployee,
  normalizeId,
  normalizeRecord,
  saveAdmins,
  saveEmployees,
  saveRecords,
  scrubLocalSecrets,
} from '../lib/storage.js';
import { useDocumentTitle, useNow } from '../lib/hooks.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import AppShell from '../components/AppShell.jsx';
import CloudPanel from '../components/CloudPanel.jsx';
import LoginShell from '../components/LoginShell.jsx';
import PasswordCard from '../components/PasswordCard.jsx';
import PortalLogin from '../components/PortalLogin.jsx';
import {
  Avatar,
  Badge,
  EmptyState,
  Modal,
  PasswordField,
  PhotoPicker,
  Spinner,
  StatCard,
} from '../components/ui.jsx';

const sameId = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

function recordFor(records, date) {
  return records.find((record) => record.date === date);
}

export default function EmployeePage() {
  useDocumentTitle('Employee');
  const { session, signIn, signOut, remainingMs } = useAuth();
  const { notify, confirm } = useToast();
  const now = useNow(1000);
  const authed = session?.role === 'emp';

  const [employee, setEmployee] = useState(null);
  const [records, setRecords] = useState([]);
  const [owner, setOwner] = useState(null);
  const [blocked, setBlocked] = useState('');
  const [active, setActive] = useState('dashboard');
  const [photo, setPhoto] = useState('');
  const [faceOk, setFaceOk] = useState(false);
  const [loc, setLoc] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [locError, setLocError] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [punchBusy, setPunchBusy] = useState('');
  const [month, setMonth] = useState(monthKey());
  const [image, setImage] = useState(null);
  const [firstPass, setFirstPass] = useState('');
  const [firstConfirm, setFirstConfirm] = useState('');
  const [firstError, setFirstError] = useState('');
  const [firstBusy, setFirstBusy] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const stopCamera = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    setStreaming(false);
  }, []);

  useEffect(() => () => {
    stopStream(streamRef.current);
    streamRef.current = null;
  }, []);

  useEffect(() => {
    setActive('dashboard');
    setPhoto('');
    setFaceOk(false);
    setLoc(null);
    setImage(null);
    setMonth(monthKey());
    setCameraError('');
    setLocError('');
    setFirstPass('');
    setFirstConfirm('');
    setFirstError('');
  }, [session?.id]);

  useEffect(() => {
    if (active !== 'punch') {
      stopCamera();
      setPhoto('');
      setFaceOk(false);
    }
  }, [active, stopCamera]);

  const persistEmployee = useCallback((updated) => {
    const all = getEmployees();
    saveEmployees([...all.filter((item) => !sameId(item.id, updated.id)), normalizeEmployee(updated)]);
    setEmployee(updated);
  }, []);

  const persistRecords = useCallback((next, employeeId) => {
    const all = getRecords();
    const keep = all.filter((record) => !sameId(record.empId, employeeId));
    const normalized = next.map(normalizeRecord);
    saveRecords([...keep, ...normalized]);
    setRecords(normalized);
  }, []);

  const applyPull = useCallback((data) => {
    const id = session?.id;
    if (!id) return;
    const local = getEmployees().find((item) => sameId(item.id, id));
    const incoming = (data.emp || []).find((item) => sameId(item.id, id)) || (data.emp || [])[0];
    if (incoming) {
      const merged = normalizeEmployee({ ...(local || {}), ...incoming, pass: local?.pass || '' });
      const all = getEmployees();
      saveEmployees([...all.filter((item) => !sameId(item.id, merged.id)), merged]);
      setEmployee(merged);
      if (merged.status === 'Disabled') setBlocked('Your employee account has been disabled by the admin.');
    }
    if (data.admin) {
      const admins = getAdmins();
      const mergedAdmin = { ...(admins.find((item) => sameId(item.id, data.admin.id)) || {}), ...data.admin };
      saveAdmins([...admins.filter((item) => !sameId(item.id, mergedAdmin.id)), mergedAdmin]);
      setOwner(mergedAdmin);
      if (mergedAdmin.status === 'Disabled') setBlocked('Your admin has been disabled. Every employee under this admin is blocked.');
    }
    if (Array.isArray(data.rec)) {
      const incomingRecords = data.rec.map(normalizeRecord);
      persistRecords(incomingRecords, id);
    }
    scrubLocalSecrets();
  }, [persistRecords, session?.id]);

  const pullCloud = useCallback(async (silent = false) => {
    if (!isCloudMode() || !getToken()) return false;
    try {
      const data = await api.pull();
      applyPull(data);
      if (!silent) notify('Your attendance was refreshed from the cloud.', 'success');
      return true;
    } catch (error) {
      notify(errorMessage(error), silent ? 'warning' : 'error');
      return false;
    }
  }, [applyPull, notify]);

  useEffect(() => {
    if (!authed) return;
    const all = getEmployees();
    const local = all.find((item) => sameId(item.id, session.id));
    if (!local) {
      if (isCloudMode()) {
        pullCloud(true).then((ok) => {
          if (!ok) {
            notify('Employee profile is unavailable. Please sign in again.', 'error');
            signOut({ remote: false });
          }
        });
      } else {
        notify('Employee profile not found. Please sign in again.', 'error');
        signOut({ remote: false });
      }
      return;
    }
    setEmployee(local);
    setBlocked(local.status === 'Disabled' ? 'Your employee account has been disabled by the admin.' : '');
    const admins = getAdmins();
    const admin = admins.find((item) => sameId(item.id, local.adminId)) || admins[0] || null;
    setOwner(admin);
    if (admin?.status === 'Disabled') setBlocked('Your admin has been disabled. Every employee under this admin is blocked.');
    setRecords(getRecords().filter((record) => sameId(record.empId, local.id)));
    if (isCloudMode()) pullCloud(true);
  }, [authed, session?.id, notify, pullCloud, signOut]);

  const handleLogin = async (id, pass) => {
    setBlocked('');
    if (isCloudMode()) {
      const data = await api.login('emp', normalizeId(id), pass);
      const existing = getEmployees().find((item) => sameId(item.id, data.emp?.id || id));
      const cloudEmployee = normalizeEmployee({ ...(existing || {}), ...(data.emp || {}) });
      saveEmployees([...getEmployees().filter((item) => !sameId(item.id, cloudEmployee.id)), cloudEmployee]);
      scrubLocalSecrets();
      signIn('emp', cloudEmployee.id || normalizeId(id));
      return;
    }
    const found = getEmployees().find((item) => sameId(item.id, id));
    if (!found || found.pass !== pass) throw new ApiError('wrong');
    if (found.status === 'Disabled') throw new ApiError('disabled');
    const admins = getAdmins();
    const admin = admins.find((item) => sameId(item.id, found.adminId)) || admins[0] || null;
    if (admin?.status === 'Disabled') throw new ApiError('admin-disabled');
    signIn('emp', found.id);
  };

  const handleLogout = async () => {
    await signOut();
    setEmployee(null);
    setRecords([]);
    setPhoto('');
    setLoc(null);
    setBlocked('');
    setActive('dashboard');
  };

  const pushCloud = async () => {
    if (!getToken()) throw new ApiError('login-required');
    await api.push({ rec: records });
    return 'Your attendance was saved to the cloud.';
  };

  const startLocation = () => {
    setLocError('');
    if (!navigator.geolocation) {
      setLocError('Location is not supported in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLoc({
          lat: Number(position.coords.latitude.toFixed(6)),
          lon: Number(position.coords.longitude.toFixed(6)),
          accuracy: Math.round(position.coords.accuracy),
          at: new Date(),
        });
        setLocError('');
      },
      (error) => setLocError(error.message || 'Could not get your location. Turn on GPS and allow access.'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const beginCamera = async () => {
    setCameraError('');
    setPhoto('');
    setFaceOk(false);
    try {
      const stream = await startCamera(videoRef.current);
      streamRef.current = stream;
      setStreaming(true);
    } catch (error) {
      setCameraError(error.message || 'Could not start the front camera.');
      setStreaming(false);
    }
  };

  const takePhoto = async () => {
    setCameraError('');
    setCapturing(true);
    try {
      const data = captureFrame(videoRef.current);
      if (!data) throw new Error('Camera is not ready yet. Wait a moment and try again.');
      const img = await loadImage(data);
      const detected = await hasHumanFace(img);
      if (!detected) {
        setPhoto('');
        setFaceOk(false);
        throw new Error('No face detected. Please look directly at the camera with good lighting and retry.');
      }
      setPhoto(data);
      setFaceOk(true);
      stopCamera();
    } catch (error) {
      notify(error.message || 'Could not capture a photo.', 'error');
    } finally {
      setCapturing(false);
    }
  };

  const resetCapture = () => {
    setPhoto('');
    setFaceOk(false);
    beginCamera();
  };

  const storePoint = employee ? employeeCoords(employee) : null;
  const distance = storePoint && loc
    ? Math.round(metersBetween(loc.lat, loc.lon, storePoint.lat, storePoint.lon))
    : null;
  const inRange = distance != null && distance <= GEO_MAX_METERS;

  const today = todayStr(now);
  const currentTime = timeStr(now);
  const seconds = secsOfNow(now);
  const windowState = punchWindow(seconds);
  const todayRecord = employee ? recordFor(records, today) : null;
  const todayStatus = todayRecord ? getStatus(todayRecord) : { label: 'Not marked', tone: 'absent' };

  const proof = () => {
    if (!photo || !faceOk) throw new Error('Capture a live photo with your face before punching.');
    if (!loc) throw new Error('Capture your GPS location before punching.');
    if (!storePoint) throw new Error('Store location is not set by the admin. Please contact your admin.');
    if (distance == null || distance > GEO_MAX_METERS) {
      throw new Error(`You are ${distance ?? 'outside'} m from the store. Punch is allowed only within ${GEO_MAX_METERS} m.`);
    }
    return {
      lat: String(loc.lat),
      lon: String(loc.lon),
      link: mapsLink(loc.lat, loc.lon),
      distance,
    };
  };

  const commitRecord = async (record, message) => {
    const exists = records.some((item) => item.date === record.date);
    const next = exists
      ? records.map((item) => (item.date === record.date ? record : item))
      : [...records, record];
    persistRecords(next, employee.id);
    if (isCloudMode() && getToken()) {
      try {
        await api.push({ rec: next });
      } catch (error) {
        notify(`Saved on this device, but cloud sync failed: ${errorMessage(error)}`, 'warning', 6000);
      }
    }
    notify(message, 'success', 5000);
    setPhoto('');
    setFaceOk(false);
    stopCamera();
  };

  const baseRecord = () => ({
    empId: employee.id,
    name: employee.name,
    store: employee.store || '',
    storeArea: employee.storeArea || '',
    storeLink: employee.storeLink || '',
    date: today,
    adminId: employee.adminId || owner?.id || '',
  });

  const markIn = async () => {
    setPunchBusy('in');
    try {
      if (todayRecord) throw new Error(todayRecord.type !== 'Duty' ? `Today is already marked as ${getStatus(todayRecord).label}.` : `Today's IN is already marked at ${todayRecord.inTime}.`);
      if (seconds < 8 * 3600 || seconds > 12 * 3600) {
        throw new Error('Check-IN is allowed only between 8:00 AM and 12:00 PM.');
      }
      const evidence = proof();
      const record = {
        ...baseRecord(),
        type: 'Duty',
        inTime: currentTime,
        inPhoto: photo,
        inLat: evidence.lat,
        inLon: evidence.lon,
        inLocLink: evidence.link,
        inDistM: evidence.distance,
        outTime: '',
        outPhoto: '',
        outLat: '',
        outLon: '',
        outLocLink: '',
        outDistM: null,
      };
      await commitRecord(record, `IN marked at ${currentTime} · ${evidence.distance} m from store.`);
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setPunchBusy('');
    }
  };

  const markOut = async () => {
    setPunchBusy('out');
    try {
      if (!todayRecord) throw new Error('Mark IN first. Back-dated OUT is not allowed.');
      if (todayRecord.type !== 'Duty') throw new Error(`Today has no duty record (${getStatus(todayRecord).label}). OUT is not allowed.`);
      if (todayRecord.outTime) throw new Error(`Today's OUT is already marked at ${todayRecord.outTime}.`);
      if (seconds > 23 * 3600 + 59 * 60 + 50) throw new Error('Check-OUT is closed for today (deadline 11:59:50 PM).');
      const evidence = proof();
      const record = {
        ...todayRecord,
        outTime: currentTime,
        outPhoto: photo,
        outLat: evidence.lat,
        outLon: evidence.lon,
        outLocLink: evidence.link,
        outDistM: evidence.distance,
      };
      await commitRecord(record, `OUT marked at ${currentTime}. Status: ${getStatus(record).label}.`);
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setPunchBusy('');
    }
  };

  const markWeekOff = async () => {
    if (todayRecord) return notify('Today is already marked.', 'warning');
    const ok = await confirm({
      title: 'Mark week off?',
      message: `Mark today (${fmtDate(today)}) as Week Off? IN, OUT and Store Close will be disabled for today.`,
      confirmLabel: 'Mark week off',
    });
    if (!ok) return;
    setPunchBusy('weekoff');
    try {
      const record = { ...baseRecord(), type: 'WeekOff', inTime: '', inPhoto: '', outTime: '', outPhoto: '' };
      await commitRecord(record, 'Week Off marked for today.');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setPunchBusy('');
    }
  };

  const markStoreClose = async () => {
    setPunchBusy('close');
    try {
      if (todayRecord) throw new Error(`Today's record already exists (${getStatus(todayRecord).label}). Store Close cannot be marked again.`);
      const evidence = proof();
      const record = {
        ...baseRecord(),
        type: 'StoreClose',
        inTime: currentTime,
        inPhoto: photo,
        inLat: evidence.lat,
        inLon: evidence.lon,
        inLocLink: evidence.link,
        inDistM: evidence.distance,
        outTime: '',
        outPhoto: '',
        outLat: '',
        outLon: '',
        outLocLink: '',
        outDistM: null,
      };
      await commitRecord(record, `Store Close marked at ${currentTime} · ${evidence.distance} m from store.`);
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setPunchBusy('');
    }
  };

  const submitFirstPassword = async (event) => {
    event.preventDefault();
    setFirstError('');
    const pe = validatePassword(firstPass);
    if (pe) return setFirstError(pe);
    if (firstPass !== firstConfirm) return setFirstError('Passwords do not match.');
    setFirstBusy(true);
    try {
      if (isCloudMode()) {
        await api.changePassword('', firstPass);
      }
      persistEmployee({ ...employee, pass: firstPass, mustChangePass: false });
      setFirstPass('');
      setFirstConfirm('');
      notify('Password updated. Welcome to Get-Attended.', 'success');
    } catch (error) {
      setFirstError(errorMessage(error));
    } finally {
      setFirstBusy(false);
    }
  };

  const updatePhoto = async (dataUrl) => {
    const previous = employee;
    const updated = { ...employee, photo: dataUrl };
    persistEmployee(updated);
    if (isCloudMode()) {
      try {
        await api.updateMe({ photo: dataUrl });
        notify('Profile photo updated in the cloud.', 'success');
      } catch (error) {
        persistEmployee(previous);
        notify(errorMessage(error), 'error');
      }
    } else {
      notify('Profile photo updated.', 'success');
    }
  };

  const submitPassword = async (currentPass, newPass) => {
    if (isCloudMode()) {
      await api.changePassword(currentPass, newPass);
    } else {
      if (currentPass !== employee.pass) throw new Error('Current password is incorrect.');
      persistEmployee({ ...employee, pass: newPass, mustChangePass: false });
    }
    notify('Password changed.', 'success');
  };

  const monthRecords = useMemo(
    () => records.filter((record) => record.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date)),
    [records, month],
  );

  const summary = useMemo(() => {
    const counts = { Present: 0, 'Half Day': 0, 'Week Off': 0, 'Store Close': 0, 'IN Only': 0 };
    monthRecords.forEach((record) => {
      const label = getStatus(record).label;
      if (label in counts) counts[label] += 1;
    });
    return counts;
  }, [monthRecords]);

  const monthWorkingDays = useMemo(
    () => monthDates(month).filter((day) => day <= today && !isSunday(day)).length,
    [month, today],
  );
  const absentDays = Math.max(0, monthWorkingDays - monthRecords.filter((record) => getStatus(record).label !== 'Absent').length);

  if (!authed) {
    return (
      <LoginShell role="emp" title="Employee sign in" subtitle="Capture attendance with photo, face and store location proof.">
        <PortalLogin role="emp" idLabel="Employee ID" idPlaceholder="e.g. EMP001" onLogin={handleLogin} />
      </LoginShell>
    );
  }

  if (blocked) {
    return (
      <LoginShell role="emp" title="Access blocked" subtitle="This account cannot mark attendance right now.">
        <div className="stack">
          <div className="form-error" role="alert">{blocked}</div>
          <p className="muted">Contact your store admin or the organizer to restore access.</p>
          <button type="button" className="btn btn-primary btn-block" onClick={handleLogout}>Back to employee login</button>
        </div>
      </LoginShell>
    );
  }

  if (!employee) {
    return (
      <div className="boot-screen">
        <img src="/brand/logo.png" alt="" className="brand-logo" />
        <Spinner label="Loading your profile…" />
      </div>
    );
  }

  const profile = employee;
  const todayImages = todayRecord ? [todayRecord.inPhoto, todayRecord.outPhoto].filter(Boolean) : [];

  return (
    <AppShell
      role="emp"
      active={active}
      onNavigate={setActive}
      title={active === 'dashboard' ? 'My dashboard' : active === 'punch' ? 'Mark attendance' : active === 'attendance' ? 'My attendance' : 'Settings'}
      subtitle={`${profile.name || profile.id} · ${profile.store || 'No store'}${profile.storeArea ? ` · ${profile.storeArea}` : ''}`}
      user={profile.name || profile.id}
      company={owner?.company || ''}
      photo={profile.photo}
      onLogout={handleLogout}
      remainingMs={remainingMs}
      actions={<Badge tone={todayStatus.tone}>{todayStatus.label}</Badge>}
    >
      {active === 'dashboard' ? (
        <>
          <div className="hero-strip employee-hero">
            <div>
              <span className="eyebrow">Live time · {currentTime}</span>
              <h2>Hi, {profile.name || profile.id}</h2>
              <p>{todayRecord ? `Today: ${todayStatus.label}${todayRecord.inTime ? ` · IN ${todayRecord.inTime}` : ''}${todayRecord.outTime ? ` · OUT ${todayRecord.outTime}` : ''}` : 'You have not marked attendance today.'}</p>
            </div>
            <div className="hero-strip-actions">
              {(!todayRecord || (todayRecord.type === 'Duty' && !todayRecord.outTime)) ? (
                <button type="button" className="btn btn-primary" onClick={() => setActive('punch')}>Punch now →</button>
              ) : null}
              <button type="button" className="btn btn-ghost" onClick={() => setActive('attendance')}>My records</button>
            </div>
          </div>

          <div className="stat-grid">
            <StatCard label="Today" value={todayStatus.label} sub={todayRecord ? fmtDate(today, 'short') : 'Not marked yet'} icon="📅" tone={todayStatus.tone === 'present' ? 'emerald' : todayStatus.tone === 'half' ? 'amber' : 'indigo'} />
            <StatCard label="Present this month" value={summary.Present} icon="✓" tone="emerald" />
            <StatCard label="Half days" value={summary['Half Day']} icon="◐" tone="amber" />
            <StatCard label="Absent this month" value={absentDays} icon="—" tone="rose" />
          </div>

          <div className="two-col">
            <div className="card">
              <div className="card-head">
                <div><h2>Today’s proof</h2><p className="card-desc">Photo and location captured with each punch.</p></div>
              </div>
              {todayImages.length ? (
                <div className="evidence-grid two">
                  {todayImages.map((src, index) => (
                    <button type="button" className="evidence-card evidence-button" key={`${src.slice(0, 12)}-${index}`} onClick={() => setImage({ src, title: `${profile.name} · ${today} · ${index === 0 ? 'IN' : 'OUT'}` })}>
                      <img src={src} alt="Attendance evidence" />
                      <span>{index === 0 ? 'IN' : 'OUT'} · {index === 0 ? todayRecord.inTime : todayRecord.outTime}</span>
                    </button>
                  ))}
                </div>
              ) : <EmptyState icon="📷" title="No photo proof today" message="Mark attendance to capture a live photo." />}
              <div className="detail-list compact">
                <div><span>Assigned store</span><strong>{profile.store || '—'}{profile.storeArea ? ` · ${profile.storeArea}` : ''}</strong></div>
                <div><span>Store map</span>{profile.storeLink ? <a href={profile.storeLink} target="_blank" rel="noreferrer">Open location ↗</a> : <strong>Not set</strong>}</div>
                <div><span>Owner admin</span><strong>{owner?.name || owner?.id || '—'}</strong></div>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <div><h2>Recent attendance</h2><p className="card-desc">Your latest punches.</p></div>
                <button type="button" className="link-btn" onClick={() => setActive('attendance')}>View all →</button>
              </div>
              {records.length ? (
                <div className="timeline">
                  {records.slice(0, 6).map((record) => {
                    const status = getStatus(record);
                    return (
                      <div className="timeline-item" key={record.date}>
                        <span className={`timeline-dot dot-${status.tone}`} />
                        <div><strong>{fmtDate(record.date, 'short')}</strong><small>IN {record.inTime || '—'} · OUT {record.outTime || '—'}</small></div>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyState icon="⏳" title="No attendance yet" message="Your punches will appear here." />}
            </div>
          </div>

          <div className="card rule-card">
            <h2>Today’s punch rules</h2>
            <div className="rule-grid">
              <div><strong>IN window</strong><span>8:00 AM – 12:00 PM</span></div>
              <div><strong>OUT deadline</strong><span>Until 11:59:50 PM</span></div>
              <div><strong>Half day</strong><span>OUT before 6:00 PM</span></div>
              <div><strong>Geofence</strong><span>Within {GEO_MAX_METERS} m of store</span></div>
            </div>
            <p className="field-hint">A live front-camera photo with a visible face and your GPS location are mandatory for IN, OUT and Store Close.</p>
          </div>
        </>
      ) : null}

      {active === 'punch' ? (
        <>
          <div className="punch-hero">
            <div>
              <span className="eyebrow">Live punch clock</span>
              <div className="punch-clock">{currentTime}</div>
              <p>{fmtDate(today)} · {todayStatus.label} {todayRecord?.inTime ? `· IN ${todayRecord.inTime}` : ''} {todayRecord?.outTime ? `· OUT ${todayRecord.outTime}` : ''}</p>
            </div>
            <div className="punch-windows">
              <span className={windowState.canIn ? 'window ok' : 'window'}>IN 8:00–12:00</span>
              <span className={windowState.canOut ? 'window ok' : 'window'}>OUT until 23:59</span>
              <Badge tone={todayStatus.tone}>{todayStatus.label}</Badge>
            </div>
          </div>

          <div className="punch-grid">
            <div className="card">
              <div className="card-head">
                <div><h2>1 · Live face photo</h2><p className="card-desc">Front camera only. Gallery uploads are not allowed.</p></div>
              </div>
              <div className="camera-stage">
                <video
                  ref={videoRef}
                  className="camera-video"
                  muted
                  playsInline
                  style={photo ? { display: 'none' } : undefined}
                />
                {photo ? <img className="camera-preview" src={photo} alt="Captured punch" /> : null}
                {!photo && !streaming ? (
                  <div className="camera-placeholder">
                    <span>📸</span>
                    <p>Camera is off</p>
                  </div>
                ) : null}
                {faceOk ? <Badge tone="present" className="camera-badge">Face verified</Badge> : null}
              </div>
              {cameraError ? <div className="form-error">{cameraError}</div> : null}
              <div className="btn-row wrap">
                {!photo && !streaming ? <button type="button" className="btn btn-primary" onClick={beginCamera}>Start camera</button> : null}
                {!photo && streaming ? <button type="button" className="btn btn-primary" onClick={takePhoto} disabled={capturing}>{capturing ? 'Checking face…' : 'Capture & verify face'}</button> : null}
                {photo ? <button type="button" className="btn btn-ghost" onClick={resetCapture}>Retake photo</button> : null}
                {streaming ? <button type="button" className="btn btn-ghost" onClick={stopCamera}>Stop camera</button> : null}
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <div><h2>2 · Store location</h2><p className="card-desc">Punch is accepted only inside the {GEO_MAX_METERS} m geofence.</p></div>
              </div>
              <div className="location-box">
                {loc ? (
                  <>
                    <div className="location-head"><span className="sync-dot online" /><strong>Location captured</strong><Badge tone={inRange ? 'present' : 'absent'}>{inRange ? 'In range' : 'Out of range'}</Badge></div>
                    <div className="detail-list compact">
                      <div><span>Coordinates</span><strong>{loc.lat}, {loc.lon}</strong></div>
                      <div><span>Accuracy</span><strong>±{loc.accuracy} m</strong></div>
                      <div><span>Distance to store</span><strong>{distance != null ? `${distance} m` : '—'}</strong></div>
                    </div>
                    <a className="btn btn-small btn-ghost" href={mapsLink(loc.lat, loc.lon)} target="_blank" rel="noreferrer">Open my map ↗</a>
                  </>
                ) : <p className="muted">Capture your GPS position before punching.</p>}
                {locError ? <div className="form-error">{locError}</div> : null}
                <button type="button" className="btn btn-ghost" onClick={startLocation}>{loc ? 'Refresh location' : 'Get my location'}</button>
                {storePoint ? <p className="field-hint">Store: {storePoint.lat}, {storePoint.lon}</p> : <p className="form-error">Store location is not set by the admin.</p>}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div><h2>3 · Punch</h2><p className="card-desc">Face photo and location are checked before every action.</p></div>
            </div>
            <div className="punch-actions">
              <button type="button" className="punch-button punch-in" onClick={markIn} disabled={Boolean(punchBusy)}>
                <span className="punch-button-icon">IN</span>
                <strong>{punchBusy === 'in' ? 'Marking…' : 'Mark IN'}</strong>
                <small>8:00 AM – 12:00 PM</small>
              </button>
              <button type="button" className="punch-button punch-out" onClick={markOut} disabled={Boolean(punchBusy)}>
                <span className="punch-button-icon">OUT</span>
                <strong>{punchBusy === 'out' ? 'Marking…' : 'Mark OUT'}</strong>
                <small>Until 11:59:50 PM</small>
              </button>
              <button type="button" className="punch-button punch-week" onClick={markWeekOff} disabled={Boolean(punchBusy)}>
                <span className="punch-button-icon">WO</span>
                <strong>{punchBusy === 'weekoff' ? 'Marking…' : 'Week Off'}</strong>
                <small>Manual week-off</small>
              </button>
              <button type="button" className="punch-button punch-close" onClick={markStoreClose} disabled={Boolean(punchBusy)}>
                <span className="punch-button-icon">SC</span>
                <strong>{punchBusy === 'close' ? 'Marking…' : 'Store Close'}</strong>
                <small>Photo + location proof</small>
              </button>
            </div>
            {todayRecord ? (
              <div className="today-record">
                <div><span>Today’s record</span><strong>{getStatus(todayRecord).label}</strong></div>
                <div><span>IN</span><strong>{todayRecord.inTime || '—'}</strong></div>
                <div><span>OUT</span><strong>{todayRecord.outTime || '—'}</strong></div>
                <div><span>Hours</span><strong>{fmtDuration(workedSeconds(todayRecord))}</strong></div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {active === 'attendance' ? (
        <>
          <div className="stat-grid">
            <StatCard label="Present" value={summary.Present} icon="✓" tone="emerald" />
            <StatCard label="Half day" value={summary['Half Day']} icon="◐" tone="amber" />
            <StatCard label="Week off" value={summary['Week Off']} icon="🌿" tone="teal" />
            <StatCard label="Store close" value={summary['Store Close']} icon="🏬" tone="blue" />
          </div>
          <div className="card">
            <div className="card-head">
              <div><h2>My attendance</h2><p className="card-desc">{monthRecords.length} records in {month}.</p></div>
              <div className="toolbar">
                <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
                <button type="button" className="btn btn-small btn-ghost" onClick={() => downloadText(`my-attendance-${month}.csv`, recordsToCsv(monthRecords, [profile]), 'text/csv')}>Export CSV</button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>IN</th><th>OUT</th><th>Hours</th><th>Status</th><th>Evidence</th><th>Location</th></tr></thead>
                <tbody>
                  {monthRecords.map((record) => {
                    const status = getStatus(record);
                    return (
                      <tr key={record.date}>
                        <td>{fmtDate(record.date, 'short')}</td>
                        <td>{record.inTime || '—'}</td>
                        <td>{record.outTime || '—'}</td>
                        <td>{fmtDuration(workedSeconds(record))}</td>
                        <td><Badge tone={status.tone}>{status.label}</Badge></td>
                        <td>
                          <div className="thumb-row">
                            {record.inPhoto ? <button type="button" className="thumb" onClick={() => setImage({ src: record.inPhoto, title: `${record.date} · IN` })}><img src={record.inPhoto} alt="IN" /></button> : null}
                            {record.outPhoto ? <button type="button" className="thumb" onClick={() => setImage({ src: record.outPhoto, title: `${record.date} · OUT` })}><img src={record.outPhoto} alt="OUT" /></button> : null}
                            {!record.inPhoto && !record.outPhoto ? <span className="muted">—</span> : null}
                          </div>
                        </td>
                        <td>
                          <div className="link-stack">
                            {record.inLocLink ? <a href={record.inLocLink} target="_blank" rel="noreferrer">IN map</a> : null}
                            {record.outLocLink ? <a href={record.outLocLink} target="_blank" rel="noreferrer">OUT map</a> : null}
                            {!record.inLocLink && !record.outLocLink ? <span className="muted">—</span> : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!monthRecords.length ? <tr><td colSpan={7} className="table-empty">No attendance records for this month.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {active === 'settings' ? (
        <div className="settings-grid">
          <div className="card">
            <div className="card-head">
              <div><h2>My profile</h2><p className="card-desc">Name, ID and store are managed by your admin.</p></div>
            </div>
            <PhotoPicker value={profile.photo} onChange={updatePhoto} name={profile.name || profile.id} label="My photo" />
            <div className="detail-list">
              <div><span>Employee ID</span><strong>{profile.id}</strong></div>
              <div><span>Name</span><strong>{profile.name || '—'}</strong></div>
              <div><span>Designation</span><strong>{profile.desg || '—'}</strong></div>
              <div><span>Mobile</span><strong>{profile.mob || '—'}</strong></div>
              <div><span>Store</span><strong>{profile.store || '—'}{profile.storeArea ? ` · ${profile.storeArea}` : ''}</strong></div>
              <div><span>Store map</span>{profile.storeLink ? <a href={profile.storeLink} target="_blank" rel="noreferrer">Open location ↗</a> : <strong>Not set</strong>}</div>
              <div><span>Company</span><strong>{owner?.company || '—'}</strong></div>
              <div><span>Status</span><Badge tone={profile.status === 'Enabled' ? 'present' : 'disabled'}>{profile.status}</Badge></div>
              <div><span>Admin</span><strong>{owner?.name || owner?.id || '—'}</strong></div>
            </div>
            <p className="field-hint">Need a name, ID or store correction? Contact your admin. Employees can update only their photo and password. Company name is managed by the admin.</p>
          </div>

          <div className="stack">
            <div className="card">
              <PasswordCard
                onSubmit={submitPassword}
                title="Change my password"
                description="Your session stays active after a password change."
              />
            </div>
            <div className="card">
              <div className="card-head">
                <div><h2>Cloud sync</h2><p className="card-desc">Keep your attendance available across devices.</p></div>
              </div>
              <CloudPanel
                onPull={async () => {
                  const ok = await pullCloud(false);
                  if (!ok) throw new Error('Cloud pull failed.');
                  return '';
                }}
                onPush={pushCloud}
                onReLogin={() => signOut({ remote: false })}
                pullLabel="Refresh my data"
                pushLabel="Save my attendance"
                note="Employees can sync their own attendance records only. Profile changes stay admin-controlled."
              />
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        open={Boolean(image)}
        onClose={() => setImage(null)}
        title={image?.title || 'Attendance evidence'}
        size="lg"
        footer={<button type="button" className="btn btn-ghost" onClick={() => setImage(null)}>Close</button>}
      >
        {image ? <img className="evidence-img" src={image.src} alt="Attendance evidence" /> : null}
      </Modal>

      <Modal
        open={Boolean(profile.mustChangePass)}
        onClose={() => {}}
        title="Set your new password"
        subtitle="The starting password is temporary. Choose a private password to continue."
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={handleLogout}>Sign out</button>
            <button type="submit" form="first-pass-form" className="btn btn-primary" disabled={firstBusy}>
              {firstBusy ? 'Saving…' : 'Set password & continue'}
            </button>
          </>
        }
      >
        <form id="first-pass-form" onSubmit={submitFirstPassword} className="stack">
          <PasswordField label="New password" required value={firstPass} onChange={(event) => setFirstPass(event.target.value)} autoComplete="new-password" hint="At least 8 characters." />
          <PasswordField label="Confirm new password" required value={firstConfirm} onChange={(event) => setFirstConfirm(event.target.value)} autoComplete="new-password" />
          {firstError ? <div className="form-error" role="alert">{firstError}</div> : null}
        </form>
      </Modal>
    </AppShell>
  );
}
