// Cualquiera de los 388: pueblo.html#<código INE>. Guareña tiene su propia página.
import { createTownPage, townError } from './town-page.js';
import { SERVER, deviceId, apiGet, apiPost } from './backend.js';

const $ = (s) => document.querySelector(s);
const fmt = new Intl.NumberFormat('es-ES');
const pct = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1, signDisplay: 'exceptZero' });

const ine = (location.hash || '').replace('#', '');
if (ine === '06060') location.replace('guarena.html');
addEventListener('hashchange', () => location.reload());

(async () => {
  let meta, data;
  try {
    meta = (await (await fetch('data/municipios.json')).json()).m;
  } catch {
    townError('No se pudo cargar la lista de municipios.');
    return;
  }
  $('#rnd').addEventListener('click', () => {
    const m = meta[Math.floor(Math.random() * meta.length)];
    location.hash = m.id === '06060' ? '06001' : m.id;
  });
  const m = meta.find((x) => x.id === ine);
  if (!m) {
    townError('Elige un pueblo en el mapa de los 388 para ver su gemelo.');
    return;
  }
  document.title = `${m.n} · 388 Pueblos`;
  $('#ld-name').textContent = m.n;
  try {
    data = await (await fetch(`data/pueblos/${ine}.json`)).json();
  } catch {
    townError(`Todavía no hemos levantado ${m.n}.`);
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
  $('#p-sub').textContent = m.mc || `Provincia de ${prov}`;
  $('#p-pop').textContent = m.p ? fmt.format(m.p) : '—';
  $('#p-alt').textContent = m.e != null ? `${fmt.format(m.e)} m` : '—';
  $('#p-area').textContent = m.a ? `${fmt.format(Math.round(m.a))} km²` : '—';
  $('#p-desc').textContent = `${m.n} es uno de los 388 pueblos de Extremadura. Este es su gemelo automático: cada volumen sale de las huellas y plantas del Catastro, sin retoques a mano. Despertarlo es modelar al detalle su plaza, su iglesia y sus calles y abrirlo al juego.`;
  $('#mine').addEventListener('click', () => { try { localStorage.setItem('388p:mipueblo', m.n); } catch {} });

  const facts = [];
  if (m.p) facts.push({ t: `${fmt.format(m.p)} vecinos`, p: `Según el Padrón del INE a 1 de enero de ${m.py || 2025}, ${m.n} tiene ${fmt.format(m.p)} habitantes. Es el pueblo nº ${rank} de 388 por población.`, s: 'INE' });
  if (m.p0 && m.p) facts.push({ t: ch < 0 ? 'Un pueblo que se vacía' : 'Un pueblo que crece', p: `Desde 2001 su población ha cambiado un ${pct.format(ch).replace('-', '−')} %: de ${fmt.format(m.p0)} a ${fmt.format(m.p)} vecinos.${ch < 0 ? ' Como 335 de los 388 pueblos extremeños.' : ''}`, s: 'INE vía Wikidata' });
  if (m.e != null) facts.push({ t: `${fmt.format(m.e)} metros`, p: `${m.n} está a ${fmt.format(m.e)} metros sobre el nivel del mar.`, s: 'Wikidata' });
  if (m.a) facts.push({ t: `${fmt.format(Math.round(m.a))} km² de término`, p: `Su término municipal ocupa unos ${fmt.format(Math.round(m.a))} km² de ${prov === 'Badajoz' ? 'la provincia de Badajoz' : 'la provincia de Cáceres'}.`, s: 'Wikidata' });
  if (dem) facts.push({ t: 'Cómo se llaman', p: `A la gente de ${m.n} se la llama ${dem}.`, s: 'Wikidata' });
  if (m.mc) facts.push({ t: 'Pueblos hermanos', p: `${m.n} forma parte de la ${m.mc}, donde comparte servicios con sus pueblos vecinos.`, s: 'Wikidata' });
  if (data.churches?.length) facts.push({ t: data.churches[0].name, p: `La torre que preside el pueblo pertenece a ${data.churches[0].name}. En este gemelo es una torre genérica: al despertar el pueblo se modelará tal como es.`, s: 'OpenStreetMap' });
  facts.push({ t: `${fmt.format(data.parts.length)} volúmenes`, p: `Este modelo se ha levantado automáticamente con ${fmt.format(data.parts.length)} piezas edificadas del Catastro, en un radio de ${fmt.format(data.radius)} metros alrededor de la iglesia.`, s: 'Dirección General del Catastro' });
  if ((m.p || 0) < 1000) facts.push({ t: 'Menos de mil', p: `${m.n} es uno de los 222 pueblos extremeños con menos de 1.000 vecinos. Juntos suman apenas un 10 % de la población de la región.`, s: 'INE, Padrón 2025' });

  const places = (data.churches || []).map((c) => ({
    name: c.name || 'Iglesia', tag: c.main ? 'Iglesia principal' : 'Iglesia',
    p: c.main ? `La iglesia principal de ${m.n}, el centro de este gemelo.` : `Otra de las iglesias del casco urbano de ${m.n}.`,
    s: 'OpenStreetMap', x: c.x, y: c.y, h: c.main ? 16 : 10, d: 170,
  }));

  createTownPage({ data, ine, name: m.n, places, facts, radius: data.radius || 800 });

  // votos para despertar el pueblo (misma colección que el mapa de la landing)
  const vBtn = $('#vote'), vCount = $('#v-count');
  let db = null, uid = null, mine = null;
  try { mine = localStorage.getItem('388p:voto'); } catch {}
  const render = (n) => {
    vCount.textContent = n ? `${n} ${n === 1 ? 'voto' : 'votos'}` : 'Aún sin votos';
    const isMine = mine === ine;
    vBtn.textContent = isMine ? 'Tu voto es para este pueblo' : `Despertar ${m.n}`;
    vBtn.disabled = isMine;
  };
  render(0);
  const c = window.claude;
  const loadServer = async () => { try { const v = await apiGet('/votos'); render(v[ine] || 0); } catch {} };
  if (!c?.use && SERVER) loadServer();
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
    if (SERVER) {
      try { await apiPost('/votos', { device: deviceId(), pueblo: ine }); await loadServer(); return; } catch {}
    }
    render(1);
    $('#v-note').textContent = 'Voto guardado en este navegador. En esta vista no se puede compartir con el recuento general.';
  });
})();
