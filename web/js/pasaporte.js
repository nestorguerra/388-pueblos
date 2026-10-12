// Pasaporte de los 388: un sello por cada pueblo visitado.
// En la web pública se guarda en el propio dispositivo (nada viaja a ningún servidor). Dentro de un Artifact de
// claude.ai, en su base de datos: ruta pasaporte/<id de la persona>, cada cual escribe solo el suyo.
const LS = '388p:pasaporte';

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

function readLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(LS) || '{}');
    const sellos = d && typeof d.sellos === 'object' && d.sellos ? d.sellos : {};
    return { sellos, count: Object.keys(sellos).length };
  } catch { return { sellos: {}, count: 0 }; }
}

export async function readPassport() {
  if (!window.claude?.use) return readLocal();
  const s = await init();
  if (!s) return readLocal();
  try {
    const snap = await s.db.doc(`pasaporte/${s.uid}`).get();
    const d = snap.exists ? snap.data() : {};
    const sellos = d && typeof d.sellos === 'object' && d.sellos ? d.sellos : {};
    return { sellos, count: Object.keys(sellos).length };
  } catch { return readLocal(); }
}

export async function stamp(ine) {
  if (!/^\d{5}$/.test(ine)) return null;
  const s = window.claude?.use ? await init() : null;
  if (!s) {
    const cur = readLocal();
    if (cur.sellos[ine]) return { ...cur, isNew: false };
    const sellos = { ...cur.sellos, [ine]: Date.now() };
    try { localStorage.setItem(LS, JSON.stringify({ sellos })); } catch { return null; }
    return { sellos, count: Object.keys(sellos).length, isNew: true };
  }
  const cur = await readPassport();
  if (cur.sellos[ine]) return { ...cur, isNew: false };
  const sellos = { ...cur.sellos, [ine]: Date.now() };
  try {
    await s.db.doc(`pasaporte/${s.uid}`).set({ sellos, n: Object.keys(sellos).length, t: Date.now() });
    return { sellos, count: Object.keys(sellos).length, isNew: true };
  } catch { return null; }
}
