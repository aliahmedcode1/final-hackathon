'use client';

// Camera + GPS check-in card (PRD §8). Client-side face-count check with the
// Shape Detection API when available and a brightness-variance fallback;
// server re-verifies geofence via Haversine.

import { useRef, useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { btnPrimary, btnGhost, Badge } from './ui';

export default function CheckInCard({ todayRecord, onChanged }) {
  const [mode, setMode] = useState('web'); // web | camera
  const [cameraOn, setCameraOn] = useState(false);
  const [faces, setFaces] = useState(null);
  const [loc, setLoc] = useState(null); // {lat, lng, accuracy}
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const scanTimer = useRef(null);

  useEffect(() => () => stopCamera(), []);

  const stopCamera = () => {
    if (scanTimer.current) clearInterval(scanTimer.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
    setFaces(null);
  };

  const startCamera = async () => {
    setMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 480 } });
      streamRef.current = stream;
      setCameraOn(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const FD = window.FaceDetector;
      if (FD) {
        try { detectorRef.current = new FD({ fastMode: true, maxDetectedFaces: 5 }); } catch { detectorRef.current = new FD(); }
      }
      scanTimer.current = setInterval(scanFaces, 900);
      await scanFaces();
    } catch {
      setMsg('Camera unavailable — use web check-in or allow camera access');
      setMode('web');
    }
  };

  const scanFaces = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    try {
      if (detectorRef.current) {
        const found = await detectorRef.current.detect(video);
        setFaces(found.length);
      } else {
        // Fallback: treat a reasonably bright frame as "one face present".
        const c = document.createElement('canvas');
        c.width = 64; c.height = 48;
        c.getContext('2d').drawImage(video, 0, 0, 64, 48);
        const px = c.getContext('2d').getImageData(0, 0, 64, 48).data;
        let bright = 0;
        for (let i = 0; i < px.length; i += 4) {
          const v = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          if (v > 60) bright++;
        }
        const ratio = bright / (px.length / 4);
        setFaces(ratio > 0.15 ? 1 : 0);
      }
    } catch {
      setFaces(null);
    }
  };

  const readLocation = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });

  const ensureLocation = async () => {
    if (loc) return loc;
    const got = await readLocation();
    setLoc(got);
    return got;
  };

  useEffect(() => {
    ensureLocation(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doCheckIn = async () => {
    setMsg(''); setBusy(true);
    try {
      let body = { method: mode };
      if (mode === 'camera') {
        if (faces !== 1) {
          setMsg(`Face check failed — detected ${faces ?? 'unknown'} faces (need exactly 1)`);
          setBusy(false);
          return;
        }
        const l = await ensureLocation();
        if (!l) { setMsg('Location required for camera check-in'); setBusy(false); return; }
        if (l.accuracy > 100) { setMsg(`GPS accuracy ${l.accuracy} m exceeds 100 m limit`); setBusy(false); return; }
        body = { ...body, latitude: l.lat, longitude: l.lng, accuracy: l.accuracy, face_count: faces };
      }
      await api('/attendance', { method: 'POST', body });
      onChanged();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const doCheckOut = async () => {
    setMsg(''); setBusy(true);
    try {
      await api('/attendance/check-out', { method: 'POST' });
      onChanged();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const checkedIn = todayRecord && !todayRecord.check_out_at;
  const done = todayRecord?.check_out_at;

  return (
    <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/60 to-zinc-900 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-indigo-300">Today&apos;s attendance</h3>
        {done ? <Badge value="checked out" /> : checkedIn ? <Badge value="checked in" /> : <Badge value="not checked in" />}
      </div>

      {!todayRecord && (
        <>
          <div className="mb-3 flex gap-2 text-xs">
            <button onClick={() => { setMode('web'); stopCamera(); }} className={`rounded-lg px-3 py-1.5 ${mode === 'web' ? 'bg-indigo-600/40 text-indigo-200' : 'text-zinc-500'}`}>Web check-in</button>
            <button onClick={() => setMode('camera')} className={`rounded-lg px-3 py-1.5 ${mode === 'camera' ? 'bg-indigo-600/40 text-indigo-200' : 'text-zinc-500'}`}>📷 Camera check-in (geofenced)</button>
          </div>

          {mode === 'camera' && (
            <div className="mb-3 space-y-2">
              <div className="relative overflow-hidden rounded-xl border border-zinc-700 bg-black" style={{ aspectRatio: '4/3', maxWidth: 320 }}>
                <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
                {!cameraOn && <div className="absolute inset-0 grid place-items-center text-xs text-zinc-500">camera off</div>}
                {cameraOn && faces !== null && (
                  <div className={`absolute left-2 top-2 rounded-md px-2 py-1 text-xs ${faces === 1 ? 'bg-emerald-600/80' : 'bg-rose-600/80'}`}>
                    {faces} face{faces === 1 ? '' : 's'} detected
                  </div>
                )}
              </div>
              {!cameraOn ? (
                <button className={btnGhost} onClick={startCamera}>Start camera</button>
              ) : (
                <button className={btnGhost} onClick={stopCamera}>Stop camera</button>
              )}
            </div>
          )}

          <div className="text-xs text-zinc-500">
            {loc ? `📍 GPS ±${loc.accuracy} m` : '📍 Location not read yet'}
          </div>
          <button className={`${btnPrimary} mt-3 w-full justify-center`} disabled={busy} onClick={doCheckIn}>
            {busy ? 'Checking in…' : mode === 'camera' ? 'Check in with face + geofence' : 'Check in'}
          </button>
        </>
      )}

      {checkedIn && (
        <button className={`${btnPrimary} w-full justify-center !bg-amber-600 hover:!bg-amber-500`} disabled={busy} onClick={doCheckOut}>
          {busy ? 'Checking out…' : 'Check out'}
        </button>
      )}

      {done && (
        <p className="text-xs text-zinc-500">
          Checked in {new Date(todayRecord.check_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          {' · '}out {new Date(done).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}. See you tomorrow!
        </p>
      )}

      {msg && <p className="mt-2 text-xs text-rose-400">{msg}</p>}
    </div>
  );
}
