// Pasaporte de los 388: un sello por cada pueblo visitado, guardado en la base de datos del Artifact.
// Ruta pasaporte/<id de la persona>; todos pueden leer los recuentos, cada cual escribe solo el suyo.
import { SERVER, deviceId, apiGet, apiPost } from './backend.js';

let ready = null;
function init() {
  if (ready) return ready;
  ready = (async () => {
    const c = window.claude;
    if (!c?.use) return null;
    try {
      const [db, user] = await Promise.all([c.use('db'), c.use('user')]);
      if (!db || !user) return null;
      const uid = await user.id();
      return uid ? { db, uid } : null;
    } catch { return null; }
  })();
  return ready;
}
export async function readPassport() {
  if (!window.claude?.use && SERVER) {
    try {
      const r = await apiGet(`/pasaporte?device=${deviceId()}`);
      return { sellos: r.sellos || {}, count: Object.keys(r.sellos || {}).length };
    } catch { return null; }
  }
  const s = await init();
  if (!s) return null;
  try {
    const snap = await s.db.doc(`pasaporte/${s.uid}`).get();
    const d = snap.exists ? snap.data() : {};
    const sellos = d && typeof d.sellos === 'object' && d.sellos ? d.sellos : {};
    return { sellos, count: Object.keys(sellos).length };
  } catch { return null; }
}
export async function stamp(ine) {
  if (!window.claude?.use && SERVER) {
    try {
      const before = await readPassport();
      const r = await apiPost('/pasaporte', { device: deviceId(), pueblo: ine });
      return { sellos: { ...(before?.sellos || {}), [ine]: Date.now() }, count: r.count, isNew: !before?.sellos?.[ine] };
    } catch { return null; }
  }
  const s = await init();
  if (!s || !/^\d{5}$/.test(ine)) return null;
  const cur = await readPassport();
  if (!cur) return null;
  if (cur.sellos[ine]) return { ...cur, isNew: false };
  const sellos = { ...cur.sellos, [ine]: Date.now() };
  try {
    await s.db.doc(`pasaporte/${s.uid}`).set({ sellos, n: Object.keys(sellos).length, t: Date.now() });
    return { sellos, count: Object.keys(sellos).length, isNew: true };
  } catch { return null; }
}
