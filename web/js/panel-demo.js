// El panel municipal (servicio 3), en una maqueta con datos ficticios: lo que verá cada ayuntamiento de su pueblo.
// Lo usan ayuntamientos.html y el dossier.

const KPI = [
  ['Visitas este mes', '1.284', '+18 %'],
  ['Jugadores del municipio', '312', '+41'],
  ['Vecinos en la lista', '146', '146/100'],
  ['Visitas desde fuera', '38 %', 'diáspora'],
];
const SEMANAS = [22, 31, 28, 40, 37, 52, 49, 61, 58, 74, 69, 88];
const ACTIVIDADES = [
  ['Fiestas patronales', '11–14 sep', '214 asistentes en el mundo'],
  ['Ruta del patrimonio', 'todo el mes', '86 participantes'],
  ['Concurso de fotos del pueblo', 'hasta el 30', '41 envíos'],
];
const AVISOS = [
  ['Corte de agua en la calle Mayor', 'martes 9:00–13:00', 'enviado a 412 vecinos'],
  ['Inscripciones abiertas: torneo de verano', 'viernes', 'enviado a 298 vecinos'],
];

export function panelHTML({ municipio = 'Municipio de ejemplo' } = {}) {
  const max = Math.max(...SEMANAS);
  return `
  <div class="pd" role="img" aria-label="Maqueta del panel municipal de 388 Pueblos con datos ficticios">
    <div class="pd-top">
      <span class="pd-brand"><b>388</b> Panel municipal</span>
      <span class="pd-town">${municipio}</span>
      <span class="pd-tag">Ejemplo · datos ficticios</span>
    </div>
    <div class="pd-body">
      <nav class="pd-nav" aria-hidden="true"><span class="on">Resumen</span><span>Actividades</span><span>Avisos</span><span>Consultas</span><span>Modelo 3D</span><span>Informes</span></nav>
      <div class="pd-main">
        <div class="pd-kpis">${KPI.map(([k, v, d]) => `<div><span>${k}</span><b>${v}</b><i>${d}</i></div>`).join('')}</div>
        <div class="pd-row">
          <div class="pd-card pd-chart"><span class="pd-h">Visitas por semana</span><div class="pd-bars">${SEMANAS.map((n) => `<i style="height:${Math.round((n / max) * 100)}%"></i>`).join('')}</div></div>
          <div class="pd-card"><span class="pd-h">Consulta vecinal</span><p class="pd-q">Peatonalizar la plaza los fines de semana</p><div class="pd-vote"><i style="width:63%"></i></div><p class="pd-small"><b>63 %</b> a favor · 418 votos · cierra en 6 días</p></div>
        </div>
        <div class="pd-row">
          <div class="pd-card"><span class="pd-h">Actividades en el mundo</span><ul>${ACTIVIDADES.map(([a, b, c]) => `<li><b>${a}</b><span>${b}</span><em>${c}</em></li>`).join('')}</ul></div>
          <div class="pd-card"><span class="pd-h">Avisos a los vecinos</span><ul>${AVISOS.map(([a, b, c]) => `<li><b>${a}</b><span>${b}</span><em>${c}</em></li>`).join('')}</ul><span class="pd-btn">+ Nuevo aviso</span></div>
        </div>
      </div>
    </div>
  </div>`;
}
