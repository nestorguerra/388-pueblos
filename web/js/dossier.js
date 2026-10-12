// Dossier para ayuntamientos: general o personalizado (dossier.html?ine=<código INE>), listo para guardar en PDF.
import { SERVICIOS, PROVEEDOR } from './config.js';
import { getJSON } from './red.js';
import { euros, conIva, habitantes, bandaTexto, presupuesto } from './servicios.js';
import { panelHTML } from './panel-demo.js';

const $ = (s) => document.querySelector(s);
const f = (k) => document.querySelector(`[data-f="${k}"]`);
const set = (k, v) => { const el = f(k); if (el) { el.textContent = v; el.hidden = false; } };
const pct = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1, signDisplay: 'exceptZero' });
const row = (cells) => `<tr>${cells.map(([v, r]) => `<td${r ? ' class="r"' : ''}>${v}</td>`).join('')}</tr>`;

$('#print')?.addEventListener('click', () => window.print());
$('#panel-demo').innerHTML = panelHTML();

const hoy = new Date();
set('fecha', hoy.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }));
const ine = new URLSearchParams(location.search).get('ine');
const yymm = `${String(hoy.getFullYear()).slice(2)}${String(hoy.getMonth() + 1).padStart(2, '0')}`;
set('ref', `388-AYTO-${ine && /^\d{5}$/.test(ine) ? ine : 'GEN'}-${yymm}`);

// contacto del proveedor
const P = PROVEEDOR;
$('#provider').innerHTML = [
  ['Proveedor', P.nombre || 'Pendiente de completar'],
  ['NIF', P.nif || 'Pendiente de completar'],
  ['Domicilio', P.domicilio || 'Pendiente de completar'],
  ['Correo', P.email || 'Pendiente de completar'],
  ['Teléfono', P.telefono || 'Pendiente de completar'],
  ['Web', 'pueblos388.onrender.com'],
].map(([k, v]) => `<div><dt>${k}</dt><dd></dd></div>`).join('');
[...$('#provider').querySelectorAll('dd')].forEach((dd, i) => { dd.textContent = [P.nombre, P.nif, P.domicilio, P.email, P.telefono, 'pueblos388.onrender.com'][i] || 'Pendiente de completar'; });

(async () => {
  let munis = [];
  try { munis = (await getJSON('data/municipios.json')).m; } catch { /* sin datos: tablas sin recuentos */ }
  const m = ine ? munis.find((x) => x.id === ine) : null;

  // tablas de precios
  const svc1 = m ? presupuesto(m).modela : null;
  $('#t-svc').innerHTML = [
    row([['<b>1 · Modela mi pueblo</b>'], ['Pago único'], [m ? euros(svc1) : '500–2.000 €', 1], [m ? euros(conIva(svc1) - svc1) : 'según tramo', 1], [m ? euros(conIva(svc1)) : '605–2.420 €', 1]]),
    row([['<b>2 · Planea en 3D</b>'], ['Por modificación'], [euros(SERVICIOS.modificacion), 1], [euros(conIva(SERVICIOS.modificacion) - SERVICIOS.modificacion), 1], [euros(conIva(SERVICIOS.modificacion)), 1]]),
    row([['<b>3 · Panel municipal</b>'], [`Anual (${euros(SERVICIOS.panelMes)}/mes)`], [euros(SERVICIOS.panelAnio), 1], [euros(conIva(SERVICIOS.panelAnio) - SERVICIOS.panelAnio), 1], [euros(conIva(SERVICIOS.panelAnio)), 1]]),
  ].join('');
  const counts = SERVICIOS.bandas.map(() => 0);
  for (const x of munis) counts[SERVICIOS.bandas.findIndex((b) => (x.p || 0) <= b.hasta)]++;
  $('#t-bands').innerHTML = SERVICIOS.bandas.map((b, i) => row([[bandaTexto(i)], [euros(b.precio), 1], [euros(conIva(b.precio)), 1], [munis.length ? habitantes(counts[i]) : '—', 1]])).join('');

  if (!m) { window.__dossierListo = true; return; }

  // personalizado para un municipio
  document.title = `Dossier ${m.n} · 388 Pueblos`;
  set('para', 'para el Ayuntamiento de');
  set('municipio', m.n);
  set('modela', euros(svc1));
  set('modela-nota', `pago único · ${habitantes(m.p || 0)} habitantes`);
  const pr = f('svc1-precio');
  pr.textContent = euros(svc1);
  const ps = document.createElement('span');
  ps.className = 'psub';
  ps.textContent = `para ${m.n} · ${habitantes(m.p || 0)} habitantes`;
  pr.append(ps);
  set('town-title', `${m.n} hoy`);
  set('pop', `${habitantes(m.p || 0)} (padrón ${m.py || 2025})`);
  set('chg', m.p0 ? `${pct.format(((m.p - m.p0) / m.p0) * 100).replace('-', '−')} % (de ${habitantes(m.p0)} a ${habitantes(m.p)})` : '—');
  set('url', m.id === '06060' ? 'pueblos388.onrender.com/guarena.html' : `pueblos388.onrender.com/pueblo.html#${m.id}`);
  try {
    const d = await getJSON(m.id === '06060' ? 'data/guarena.json' : `data/pueblos/${m.id}.json`, { retries: 1 });
    set('parts', `${habitantes(d.parts.length)} volúmenes del Catastro`);
  } catch { set('parts', '—'); }
  f('town-box').hidden = false;

  const p = presupuesto(m);
  set('budget-title', `Presupuesto para ${m.n}`);
  $('#t-budget').innerHTML = [
    row([['Modela mi pueblo · pago único'], [euros(p.modela), 1]]),
    row([['Panel municipal · primer año (opcional)'], [euros(p.panelAnio), 1]]),
    row([['Subtotal primer año'], [euros(p.primerAnio), 1]]),
    row([['IVA 21 %'], [euros(conIva(p.primerAnio) - p.primerAnio), 1]]),
    `<tr class="total"><td>Total primer año, IVA incluido</td><td class="r">${euros(conIva(p.primerAnio))}</td></tr>`,
    row([['Años siguientes · panel municipal'], [`${euros(conIva(p.panelAnio))} con IVA`, 1]]),
    row([['Cada modificación del servicio 2'], [`${euros(conIva(p.modificacion))} con IVA`, 1]]),
  ].join('');
  f('budget').hidden = false;
  window.__dossierListo = true;
})();
