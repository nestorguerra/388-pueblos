// «Guareña, ahora» en la web (el multijugador del juego, fase 2; docs/multijugador.md en «388 Foto»): mientras la cámara da
// vueltas a la torre esperando al juego, un recuadro con cuántas personas están jugando, dónde está cada una y qué hace, y
// cuántos vecinos hay por la calle. Lo pide al servidor (/api/juego) en cuanto se pulsa «Jugar» —y así, si está dormido,
// se despierta mientras se vuela— y cada 5 s después.
// - Dónde está cada uno, en palabras: lo manda su juego («w»: la calle y el sitio, src/donde.js del juego).
// - Los vecinos: los que cuenta el juego de quien está jugando (con la hora de su sala); si no hay nadie, con la hora de
//   España de ahora, que es con la que empezará la sala (la misma curva que src/gente.js del juego).
import { SERVER } from './backend.js';
import { t, addTexts, lang, locale } from './i18n.js';

addTexts({
  es: {
    'ah.tit': 'Guareña, ahora', 'ah.uno': 'persona jugando', 'ah.varias': 'personas jugando', 'ah.vecinos': 'vecinos por la calle',
    'ah.nadie': 'Ahora no hay nadie más jugando. Quien entre después te verá en el pueblo, con tu nombre encima.',
    'ah.mas': 'y {n} más', 'ah.buscando': 'Mirando quién hay en el pueblo…', 'ah.lejos': 'por el pueblo',
  },
  en: {
    'ah.tit': 'Guareña, now', 'ah.uno': 'person playing', 'ah.varias': 'people playing', 'ah.vecinos': 'neighbours out in the streets',
    'ah.nadie': 'Nobody else is playing right now. Whoever comes in next will see you in the village, with your name above you.',
    'ah.mas': 'and {n} more', 'ah.buscando': 'Checking who is in the village…', 'ah.lejos': 'around the village',
  },
});

const HACE = {
  es: ['quieta', 'paseando', 'corriendo', 'sentada', 'bailando', 'rezando', 'hablando', 'conduciendo', 'encendiendo una vela', 'saltando', 'de copiloto'],
  en: ['standing', 'strolling', 'running', 'sitting', 'dancing', 'praying', 'talking', 'driving', 'lighting a candle', 'jumping', 'in a passenger seat'],
};
// (la parte de los vecinos que está en la calle a cada hora: la de src/gente.js del juego)
const VECINOS = 6665;
const CURVA = [[0, 0.004], [2, 0.0015], [5, 0.001], [6.5, 0.004], [7.5, 0.014], [8.5, 0.024], [9.5, 0.026], [10.5, 0.034], [11.5, 0.042], [12.5, 0.046],
  [13.5, 0.048], [14.5, 0.026], [15.5, 0.012], [16.5, 0.018], [17.5, 0.034], [18.5, 0.046], [19.5, 0.052], [20.5, 0.044], [21.5, 0.026], [22.5, 0.014], [23.5, 0.007], [24, 0.004]];
function enLaCalle(h, dia, mes) {
  let f = CURVA[CURVA.length - 1][1];
  for (let i = 0; i + 1 < CURVA.length; i++) { const [h0, v0] = CURVA[i], [h1, v1] = CURVA[i + 1]; if (h >= h0 && h <= h1) { f = v0 + (v1 - v0) * (h - h0) / (h1 - h0); break; } }
  if (dia === 0) f *= h < 10 ? 0.45 : h < 14.5 ? 1.25 : h > 17 && h < 21.5 ? 1.1 : 1;
  if (dia === 6) f *= h < 9 ? 0.6 : h > 21 ? 1.6 : 1.05;
  if (mes === 11 || mes === 12 || mes <= 2) f *= h > 18.5 ? 0.72 : h > 12 && h < 16 ? 1.1 : 1;
  if (mes >= 6 && mes <= 8) f *= h > 14 && h < 18.5 ? 0.35 : h > 21 || h < 1 ? 2 : 1;
  return f;
}
function vecinosAhora() {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: 'numeric', minute: 'numeric', weekday: 'short', month: 'numeric', hourCycle: 'h23' })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
    return Math.round(VECINOS * enLaCalle(+p.hour + +p.minute / 60, dia, +p.month));
  } catch { return null; }
}

export function montarAhora(pueblo = '06060') {
  let box = null, datos = null, reloj = null, visible = false, pidiendo = false;
  async function pedir() {
    if (!SERVER || pidiendo) return;
    pidiendo = true;
    try {
      const c = new AbortController(); const tope = setTimeout(() => c.abort(), 15000);
      const r = await fetch(`${SERVER}/juego?pueblo=${pueblo}`, { cache: 'no-store', signal: c.signal });
      clearTimeout(tope);
      if (r.ok) { datos = await r.json(); pintar(); }
    } catch { /* dormido o sin red: se sigue intentando */ } finally { pidiendo = false; }
  }
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  function pintar() {
    if (!box) return;
    const fmt = new Intl.NumberFormat(locale), hace = HACE[lang];
    box.textContent = '';
    box.append(el('span', 'tit', t('ah.tit')));
    if (!datos) { box.append(el('p', 'nota', t('ah.buscando'))); return; }
    const n = datos.humanos || 0, v = datos.vecinos ?? vecinosAhora();
    const cifras = el('div', 'cifras');
    const c1 = el('div'); c1.append(el('b', null, fmt.format(n)), el('span', null, n === 1 ? t('ah.uno') : t('ah.varias')));
    cifras.append(c1);
    if (v != null) { const c2 = el('div'); c2.append(el('b', null, fmt.format(v)), el('span', null, t('ah.vecinos'))); cifras.append(c2); }
    box.append(cifras);
    if (!n) { box.append(el('p', 'nota', t('ah.nadie'))); return; }
    const ul = el('ul');
    for (const g of (datos.gente || []).slice(0, 4)) {
      const li = el('li'); li.append(el('b', null, g.n || '—'), el('span', 'hace', ' · ' + (hace[g.m] || hace[0])), el('span', 'sitio', g.w || t('ah.lejos')));
      ul.append(li);
    }
    box.append(ul);
    if (n > 4) box.append(el('p', 'nota', t('ah.mas', { n: fmt.format(n - 4) })));
  }
  return {
    // (al pulsar «Jugar»: ya se pide, para despertar al servidor)
    empezar() { if (!reloj) { pedir(); reloj = setInterval(pedir, 5000); } },
    mostrar(si) {
      if (si === visible) return;
      visible = si;
      if (si) {
        box = el('section', 'ahora388'); box.setAttribute('aria-live', 'polite'); box.setAttribute('aria-label', t('ah.tit'));
        document.body.append(box); pintar(); requestAnimationFrame(() => box?.classList.add('on'));
      } else if (box) { const b = box; box = null; b.classList.remove('on'); setTimeout(() => b.remove(), 600); }
    },
    parar() { this.mostrar(false); clearInterval(reloj); reloj = null; },
    get datos() { return datos; },
  };
}
