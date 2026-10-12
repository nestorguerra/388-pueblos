import { getJSON } from './red.js';

// Contenido escrito por la comunidad para cada pueblo: data/contenido/<INE>.json (formato en CONTRIBUTING.md).
// data/contenido/index.json lista los pueblos que tienen contenido, para no pedir archivos que no existen.

// latitud y longitud (WGS84) → UTM, en la zona del modelo del pueblo (29 o 30 en Extremadura)
export function utm(lat, lon, zone) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const p = (lat * Math.PI) / 180, l = (lon * Math.PI) / 180, l0 = (((zone - 1) * 6 - 180 + 3) * Math.PI) / 180;
  const s = Math.sin(p), c = Math.cos(p), t = Math.tan(p);
  const N = a / Math.sqrt(1 - e2 * s * s), T = t * t, C = ep2 * c * c, A = c * (l - l0);
  const M = a * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * p
    - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * p)
    + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * p)
    - ((35 * e2 ** 3) / 3072) * Math.sin(6 * p));
  const E = k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000;
  const Y = k0 * (M + N * t * ((A * A) / 2 + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720));
  return [E, Y];
}

const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
let index = null;

export async function loadContenido(ine, model) {
  try {
    index = index || (await getJSON('data/contenido/index.json', { retries: 1 }));
    if (!Array.isArray(index) || !index.includes(ine)) return null;
    const c = await getJSON(`data/contenido/${ine}.json`, { retries: 1 });
    const zone = model.zone || 29, [cx, cy] = model.center || [0, 0];
    const lugares = (Array.isArray(c.lugares) ? c.lugares : [])
      .filter((l) => str(l.nombre, 80) && Number.isFinite(l.lat) && Number.isFinite(l.lon))
      .map((l) => {
        const [e, n] = utm(l.lat, l.lon, zone);
        return { name: str(l.nombre, 80), tag: str(l.etiqueta, 40), p: str(l.texto, 600), s: str(l.fuente, 120), x: e - cx, y: n - cy, h: Number.isFinite(l.altura) ? l.altura : 10, d: 170 };
      })
      .filter((l) => Math.hypot(l.x, l.y) < (model.radius || 1500));
    const datos = (Array.isArray(c.datos) ? c.datos : [])
      .filter((d) => str(d.titulo, 80) && str(d.texto, 600))
      .map((d) => ({ t: str(d.titulo, 80), p: str(d.texto, 600), s: str(d.fuente, 120) }));
    return { lugares, datos, descripcion: str(c.descripcion, 600), autoria: Array.isArray(c.autoria) ? c.autoria.map((a) => str(a, 60)).filter(Boolean) : [] };
  } catch {
    return null;
  }
}
