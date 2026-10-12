// Página para ayuntamientos: tramos de precio, calculadora por municipio, panel de ejemplo y datos del proveedor.
import { SERVICIOS } from './config.js';
import { getJSON } from './red.js';
import { euros, conIva, habitantes, bandaTexto, presupuesto, proveedorTexto } from './servicios.js';
import { panelHTML } from './panel-demo.js';
import { initRedes } from './redes.js';

const $ = (s) => document.querySelector(s);
const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

$('#panel-demo').innerHTML = panelHTML();
$('#provider').textContent = proveedorTexto();
initRedes();

(async () => {
  let munis = [];
  try { munis = (await getJSON('data/municipios.json')).m; } catch { /* sin datos: la tabla sale sin recuentos */ }

  // tramos, con cuántos municipios extremeños caen en cada uno
  const counts = SERVICIOS.bandas.map(() => 0);
  for (const m of munis) counts[SERVICIOS.bandas.findIndex((b) => (m.p || 0) <= b.hasta)]++;
  $('#bands').innerHTML = SERVICIOS.bandas.map((b, i) => `<tr><td>${bandaTexto(i)}</td><td>${euros(b.precio)}</td><td>${euros(conIva(b.precio))}</td><td>${munis.length ? habitantes(counts[i]) : '—'}</td></tr>`).join('');

  // calculadora: presupuesto de un municipio y su dossier
  $('#munis').innerHTML = [...munis].sort((a, b) => a.n.localeCompare(b.n, 'es')).map((m) => `<option value="${m.n}"></option>`).join('');
  const out = $('#calc');
  function show(m) {
    if (!m) return;
    const p = presupuesto(m);
    out.innerHTML = `
      <h3></h3>
      <p class="sub"></p>
      <table>
        <tr><td>Modela mi pueblo · pago único</td><td>${euros(p.modela)}</td></tr>
        <tr><td>Panel municipal · opcional, por año</td><td>${euros(p.panelAnio)}</td></tr>
        <tr><td>Planea en 3D · por cada modificación</td><td>${euros(p.modificacion)}</td></tr>
        <tr class="total"><td>Primer año con panel (sin IVA)</td><td>${euros(p.primerAnio)}</td></tr>
        <tr class="total"><td>Primer año con panel (IVA incluido)</td><td>${euros(conIva(p.primerAnio))}</td></tr>
      </table>
      <div class="ctas"><a class="btn primary" target="_blank" rel="noopener">Ver el dossier de este municipio</a><a class="btn">Su gemelo automático</a></div>`;
    out.querySelector('h3').textContent = m.n;
    out.querySelector('.sub').textContent = `INE ${m.id} · ${habitantes(m.p || 0)} habitantes (padrón ${m.py || 2025})`;
    out.querySelector('.btn.primary').href = `dossier.html?ine=${m.id}`;
    out.querySelector('.btn:not(.primary)').href = m.id === '06060' ? 'guarena.html' : `pueblo.html#${m.id}`;
  }
  const input = $('#muni');
  input.addEventListener('input', () => show(munis.find((m) => norm(m.n) === norm(input.value))));
  const pre = new URLSearchParams(location.search).get('ine');
  if (pre) { const m = munis.find((x) => x.id === pre); if (m) { input.value = m.n; show(m); } }
})();
