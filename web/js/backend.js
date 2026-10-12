// Dónde viven los datos compartidos de la web (lista de espera y votos), por orden:
//   1. dentro de un Artifact de claude.ai, su base de datos (lo resuelven main.js y pasaporte.js);
//   2. una hoja de Google Sheets (SHEETS_URL en config.js, con tools/sheets/Codigo.gs);
//   3. el servidor propio (server/servidor.py), cuando la web se sirve desde él (window.P388).
// El pasaporte vive en el propio dispositivo (pasaporte.js).
import { SHEETS_URL } from './config.js';

export const SERVER = typeof window !== 'undefined' && window.P388 && window.P388.api ? window.P388.api : null;
export const SHEETS = SHEETS_URL || null;
export const SHARED = !!(SHEETS || SERVER);

export function deviceId() {
  let id = null;
  try { id = localStorage.getItem('388p:device'); } catch {}
  if (!id || !/^[A-Za-z0-9_-]{12,64}$/.test(id)) {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    id = [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem('388p:device', id); } catch {}
  }
  return id;
}

// (con tiempo límite: el servidor gratuito puede tardar en despertar y nadie debe quedarse esperando sin fin)
const limit = (ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };

export async function apiGet(path) {
  const r = await fetch(`${SERVER}${path}`, { cache: 'no-store', signal: limit(20000) });
  if (!r.ok) throw new Error(`api ${r.status}`);
  return r.json();
}

export async function apiPost(path, body) {
  const r = await fetch(`${SERVER}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: limit(20000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `api ${r.status}`), { status: r.status });
  return j;
}

// ---- Google Sheets (Apps Script): POST con text/plain, sin preflight; GET para los recuentos ----
async function sheets(body, timeout = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(SHEETS, { method: 'POST', body: JSON.stringify(body), signal: ctl.signal, redirect: 'follow' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw Object.assign(new Error(j.error || `hoja ${r.status}`), { status: j.status || r.status });
    return j;
  } finally { clearTimeout(t); }
}

// Recuento de votos por pueblo, {INE: n}
export async function loadVotes() {
  if (SHEETS) {
    const r = await fetch(`${SHEETS}?accion=votos`, { cache: 'no-store', redirect: 'follow', signal: limit(15000) });
    const j = await r.json();
    return j.votos || {};
  }
  if (SERVER) return apiGet('/votos');
  return null;
}

// Apuntados a la lista de espera por pueblo, {pueblos: {INE: n}, total} (solo números)
export async function loadSignupCounts() {
  if (SHEETS) {
    const r = await fetch(`${SHEETS}?accion=apuntados`, { cache: 'no-store', redirect: 'follow', signal: limit(15000) });
    const j = await r.json();
    return { pueblos: j.pueblos || {}, total: j.total || 0 };
  }
  if (SERVER) { const j = await apiGet('/lista/recuento'); return { pueblos: j.pueblos || {}, total: j.total || 0 }; }
  return null;
}

// Un voto por dispositivo (cambiarlo mueve el voto)
export async function sendVote(pueblo) {
  if (SHEETS) return sheets({ accion: 'voto', device: deviceId(), pueblo });
  if (SERVER) return apiPost('/votos', { device: deviceId(), pueblo });
  throw new Error('sin almacén compartido');
}

// Inscripción en la lista de espera (el email nunca se puede volver a leer desde la web)
export async function sendSignup(entry) {
  const e = { ...entry, device: deviceId(), web: entry.web || '' };
  if (SHEETS) return sheets({ accion: 'lista', ...e });
  if (SERVER) return apiPost('/lista', e);
  throw new Error('sin almacén compartido');
}

// Despierta el servidor propio si duerme (plan gratuito de Render): así, cuando alguien rellene el formulario,
// ya está en pie
export function wake() {
  if (!SHEETS && SERVER) fetch(`${SERVER}/online`, { cache: 'no-store' }).catch(() => {});
}
