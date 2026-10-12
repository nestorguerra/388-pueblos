// Cualquiera de los 388: pueblo.html#<código INE>. Guareña tiene su propia página.
import { createTownPage, townError } from './town-page.js';
import { SHARED, loadVotes, sendVote, wake, loadSignupCounts } from './backend.js';
import { META_DESPERTAR } from './config.js';
import { t, page, addTexts, locale } from './i18n.js';
import { loadContenido } from './contenido.js';
import { getJSON } from './red.js';

const $ = (s) => document.querySelector(s);
const fmt = new Intl.NumberFormat(locale);
const pct = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1, signDisplay: 'exceptZero' });

addTexts({
  es: {
    'p.errLista': 'No se pudo cargar la lista de municipios. Revisa la conexión.', 'p.elige': 'Elige un pueblo en el mapa de los 388 para ver su gemelo.',
    'p.noAun': ({ n }) => `Todavía no hemos levantado ${n}.`, 'p.errPueblo': ({ n }) => `No se pudo cargar ${n}. Revisa la conexión.`,
    'p.prov': ({ p }) => `Provincia de ${p}`,
    'p.desc': ({ n }) => `${n} es uno de los 388 pueblos de Extremadura. Este es su gemelo automático: cada volumen sale de las huellas y plantas del Catastro, sin retoques a mano. Despertarlo es modelar al detalle su plaza, su iglesia y sus calles y abrirlo al juego.`,
    'f.pop.t': ({ p }) => `${p} vecinos`, 'f.pop.p': ({ n, p, y, r }) => `Según el Padrón del INE a 1 de enero de ${y}, ${n} tiene ${p} habitantes. Es el pueblo nº ${r} de 388 por población.`,
    'f.chg.t': ({ down }) => (down ? 'Un pueblo que se vacía' : 'Un pueblo que crece'),
    'f.chg.p': ({ c, p0, p, down }) => `Desde 2001 su población ha cambiado un ${c} %: de ${p0} a ${p} vecinos.${down ? ' Como 335 de los 388 pueblos extremeños.' : ''}`,
    'f.alt.t': ({ e }) => `${e} metros`, 'f.alt.p': ({ n, e }) => `${n} está a ${e} metros sobre el nivel del mar.`,
    'f.area.t': ({ a }) => `${a} km² de término`, 'f.area.p': ({ a, prov }) => `Su término municipal ocupa unos ${a} km² de la provincia de ${prov}.`,
    'f.dem.t': 'Cómo se llaman', 'f.dem.p': ({ n, d }) => `A la gente de ${n} se la llama ${d}.`,
    'f.mc.t': 'Pueblos hermanos', 'f.mc.p': ({ n, mc }) => `${n} forma parte de la ${mc}, donde comparte servicios con sus pueblos vecinos.`,
    'f.ch.p': ({ c }) => `La torre que preside el pueblo pertenece a ${c}. En este gemelo es una torre genérica: al despertar el pueblo se modelará tal como es.`,
    'f.vol.t': ({ v }) => `${v} volúmenes`, 'f.vol.p': ({ v, r }) => `Este modelo se ha levantado automáticamente con ${v} piezas edificadas del Catastro, en un radio de ${r} metros alrededor de la iglesia.`,
    'f.mil.t': 'Menos de mil', 'f.mil.p': ({ n }) => `${n} es uno de los 222 pueblos extremeños con menos de 1.000 vecinos. Juntos suman apenas un 10 % de la población de la región.`,
    'pl.iglesia': 'Iglesia', 'pl.principal': 'Iglesia principal',
    'pl.main.p': ({ n }) => `La iglesia principal de ${n}, el centro de este gemelo.`, 'pl.otra.p': ({ n }) => `Otra de las iglesias del casco urbano de ${n}.`,
    'p.autoria': ({ a }) => ` Con aportaciones de ${a}.`,
    'p.votos': ({ n }) => (n ? `${n} ${n === 1 ? 'voto' : 'votos'}` : 'Aún sin votos'), 'p.tuvoto': 'Tu voto es para este pueblo', 'p.despertar': ({ n }) => `Despertar ${n}`,
    'f.via': 'INE vía Wikidata', 'f.catastro': 'Dirección General del Catastro', 'f.padron': 'INE, Padrón 2025',
    'p.votoLocal': 'Voto guardado en este navegador. En esta vista no se puede compartir con el recuento general.',
  },
  en: {
    'p.errLista': 'We could not load the list of municipalities. Check your connection.', 'p.elige': 'Pick a town on the map of the 388 to see its twin.',
    'p.noAun': ({ n }) => `We have not raised ${n} yet.`, 'p.errPueblo': ({ n }) => `We could not load ${n}. Check your connection.`,
    'p.prov': ({ p }) => `Province of ${p}`,
    'p.desc': ({ n }) => `${n} is one of the 388 towns of Extremadura. This is its automatic twin: every volume comes from the footprints and floor counts in the Catastro, Spain's land registry, with no hand edits. Waking it up means modelling its square, church and streets in detail and opening it to the game.`,
    'f.pop.t': ({ p }) => `${p} people`, 'f.pop.p': ({ n, p, y, r }) => `According to the INE municipal register on 1 January ${y}, ${n} has ${p} inhabitants. It ranks ${r} of 388 by population.`,
    'f.chg.t': ({ down }) => (down ? 'A town that is emptying' : 'A town that is growing'),
    'f.chg.p': ({ c, p0, p, down }) => `Since 2001 its population has changed by ${c} %: from ${p0} to ${p} people.${down ? ' Like 335 of the 388 towns in Extremadura.' : ''}`,
    'f.alt.t': ({ e }) => `${e} metres`, 'f.alt.p': ({ n, e }) => `${n} stands ${e} metres above sea level.`,
    'f.area.t': ({ a }) => `${a} km² of land`, 'f.area.p': ({ a, prov }) => `Its municipal area covers about ${a} km² of the province of ${prov}.`,
    'f.dem.t': 'What locals are called', 'f.dem.p': ({ n, d }) => `People from ${n} are called ${d}.`,
    'f.mc.t': 'Sister towns', 'f.mc.p': ({ n, mc }) => `${n} belongs to the ${mc}, where it shares services with its neighbouring towns.`,
    'f.ch.p': ({ c }) => `The tower that presides over the town belongs to ${c}. In this twin it is a generic tower: when the town wakes up it will be modelled as it really is.`,
    'f.vol.t': ({ v }) => `${v} volumes`, 'f.vol.p': ({ v, r }) => `This model was raised automatically from ${v} built parts in the Catastro, within ${r} metres of the church.`,
    'f.mil.t': 'Under a thousand', 'f.mil.p': ({ n }) => `${n} is one of the 222 towns in Extremadura with fewer than 1,000 people. Together they hold barely 10 % of the region's population.`,
    'pl.iglesia': 'Church', 'pl.principal': 'Main church',
    'pl.main.p': ({ n }) => `The main church of ${n}, the centre of this twin.`, 'pl.otra.p': ({ n }) => `Another of the churches in the centre of ${n}.`,
    'p.autoria': ({ a }) => ` With contributions from ${a}.`,
    'p.votos': ({ n }) => (n ? `${n} ${n === 1 ? 'vote' : 'votes'}` : 'No votes yet'), 'p.tuvoto': 'Your vote goes to this town', 'p.despertar': ({ n }) => `Wake up ${n}`,
    'f.via': 'INE via Wikidata', 'f.catastro': 'Spanish Directorate General for the Catastro', 'f.padron': 'INE, 2025 register',
    'p.votoLocal': 'Vote saved in this browser. This view cannot share it with the overall count.',
  },
});

const ine = (location.hash || '').replace('#', '');
if (ine === '06060') location.replace(page('guarena.html'));
addEventListener('hashchange', () => location.reload());

(async () => {
  let meta, data;
  try {
    meta = (await getJSON('data/municipios.json')).m;
  } catch {
    townError(t('p.errLista'), { retry: true });
    return;
  }
  $('#rnd').addEventListener('click', () => {
    const m = meta[Math.floor(Math.random() * meta.length)];
    location.hash = m.id === '06060' ? '06001' : m.id;
  });
  const m = meta.find((x) => x.id === ine);
  if (!m) {
    townError(t('p.elige'));
    return;
  }
  document.title = `${m.n} · 388 Pueblos`;
  // el enlace a la otra lengua lleva a este mismo pueblo
  for (const a of document.querySelectorAll('a[hreflang][href$="pueblo.html"], a[hreflang][href$="town.html"]')) a.href = `${a.getAttribute('href')}#${ine}`;
  $('#ld-name').textContent = m.n;
  try {
    data = await getJSON(`data/pueblos/${ine}.json`);
  } catch (err) {
    // (404: ese pueblo aún no tiene modelo; cualquier otra cosa es la red)
    if (err.status === 404) townError(t('p.noAun', { n: m.n }));
    else townError(t('p.errPueblo', { n: m.n }), { retry: true });
    return;
  }

  // ficha
  const prov = m.pr === 'BA' ? 'Badajoz' : 'Cáceres';
  const byPop = [...meta].sort((a, b) => (b.p || 0) - (a.p || 0));
  const rank = byPop.findIndex((x) => x.id === ine) + 1;
  const ch = m.p0 ? ((m.p - m.p0) / m.p0) * 100 : 0;
  const dem = m.d ? m.d.charAt(0).toLowerCase() + m.d.slice(1) : null;
  $('#p-kicker').textContent = `INE ${m.id} · ${prov}`;
  $('#p-name').firstChild.textContent = m.n;
  $('#p-sub').textContent = m.mc || t('p.prov', { p: prov });
  $('#p-pop').textContent = m.p ? fmt.format(m.p) : '—';
  $('#p-alt').textContent = m.e != null ? `${fmt.format(m.e)} m` : '—';
  $('#p-area').textContent = m.a ? `${fmt.format(Math.round(m.a))} km²` : '—';
  $('#p-desc').textContent = t('p.desc', { n: m.n });
  $('#mine').addEventListener('click', () => { try { localStorage.setItem('388p:mipueblo', m.n); } catch {} });

  const facts = [];
  const F = (k, v, src) => facts.push({ t: t(`f.${k}.t`, v), p: t(`f.${k}.p`, v), s: src });
  const v0 = { n: m.n, p: fmt.format(m.p || 0) };
  if (m.p) F('pop', { ...v0, y: m.py || 2025, r: rank }, 'INE');
  if (m.p0 && m.p) F('chg', { ...v0, c: pct.format(ch).replace('-', '−'), p0: fmt.format(m.p0), down: ch < 0 }, t('f.via'));
  if (m.e != null) F('alt', { n: m.n, e: fmt.format(m.e) }, 'Wikidata');
  if (m.a) F('area', { a: fmt.format(Math.round(m.a)), prov }, 'Wikidata');
  if (dem) F('dem', { n: m.n, d: dem }, 'Wikidata');
  if (m.mc) F('mc', { n: m.n, mc: m.mc }, 'Wikidata');
  if (data.churches?.length) facts.push({ t: data.churches[0].name, p: t('f.ch.p', { c: data.churches[0].name }), s: 'OpenStreetMap' });
  F('vol', { v: fmt.format(data.parts.length), r: fmt.format(data.radius) }, t('f.catastro'));
  if ((m.p || 0) < 1000) F('mil', { n: m.n }, t('f.padron'));

  const places = (data.churches || []).map((c) => ({
    name: c.name || t('pl.iglesia'), tag: t(c.main ? 'pl.principal' : 'pl.iglesia'),
    p: t(c.main ? 'pl.main.p' : 'pl.otra.p', { n: m.n }),
    s: 'OpenStreetMap', x: c.x, y: c.y, h: c.main ? 16 : 10, d: 170,
  }));

  // lo que la comunidad ha escrito de este pueblo (data/contenido/<INE>.json, ver CONTRIBUTING.md)
  const extra = await loadContenido(ine, data);
  if (extra) {
    places.push(...extra.lugares);
    facts.unshift(...extra.datos);
    if (extra.descripcion) $('#p-desc').textContent = extra.descripcion;
    if (extra.autoria.length) $('#p-desc').textContent += t('p.autoria', { a: extra.autoria.join(', ') });
  }

  createTownPage({ data, ine, name: m.n, places, facts, radius: data.radius || 800 });

  // votos para despertar el pueblo (misma colección que el mapa de la landing)
  const vBtn = $('#vote'), vCount = $('#v-count');
  let db = null, uid = null, mine = null;
  try { mine = localStorage.getItem('388p:voto'); } catch {}
  const render = (n) => {
    vCount.textContent = t('p.votos', { n });
    const isMine = mine === ine;
    vBtn.textContent = isMine ? t('p.tuvoto') : t('p.despertar', { n: m.n });
    vBtn.disabled = isMine;
  };
  render(0);
  const c = window.claude;
  const loadShared = async () => { try { const v = await loadVotes(); if (v) render(v[ine] || 0); } catch {} };
  if (!c?.use && SHARED) { wake(); loadShared(); }

  // la cola del pueblo: cuántos vecinos se han apuntado y cuántos faltan para que despierte
  const join = $('#q-join');
  if (join) { join.href = page(`index.html?pueblo=${ine}#unete`); join.textContent = t('cola.apuntate', { name: m.n }); }
  if (!c?.use && SHARED) {
    loadSignupCounts().then((cnt) => {
      const box = $('#q-box');
      if (!cnt || !box) return;
      const n = cnt.pueblos[ine] || 0;
      box.innerHTML = `<div class="qt"><b>${t('cola.apuntados', { n })}</b><span>${t('cola.faltan', { n, meta: META_DESPERTAR })}</span></div><div class="qbar" aria-hidden="true"><i style="width:${Math.min(100, (n / META_DESPERTAR) * 100).toFixed(1)}%"></i></div>`;
      box.hidden = false;
    }).catch(() => {});
  }
  if (c?.use) {
    Promise.all([c.use('db'), c.use('user')]).then(async ([d, u]) => {
      if (!d) return;
      db = d;
      uid = u ? await u.id() : null;
      db.collection('votos').limit(1000).onSnapshot((snap) => {
        let n = 0;
        for (const doc of snap.docs) {
          const p = doc.data()?.pueblo;
          if (p === ine) n++;
          if (doc.id === uid) mine = p;
        }
        render(n);
      }, () => {});
    }).catch(() => {});
  }
  vBtn.addEventListener('click', async () => {
    mine = ine;
    try { localStorage.setItem('388p:voto', ine); } catch {}
    if (db && uid) {
      try { await db.doc(`votos/${uid}`).set({ pueblo: ine, t: Date.now() }); return; } catch {}
    }
    if (!c?.use && SHARED) {
      try { await sendVote(ine); await loadShared(); return; } catch {}
    }
    render(1);
    $('#v-note').textContent = t('p.votoLocal');
  });
})();
