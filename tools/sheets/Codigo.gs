/**
 * 388 Pueblos · lista de espera y votos en una hoja de Google Sheets.
 *
 * Cómo ponerlo en marcha (unos 3 minutos):
 *   1. Crea una hoja de cálculo nueva en Google Drive (por ejemplo, «388 Pueblos · lista de espera»).
 *   2. Extensiones → Apps Script. Borra lo que haya, pega este archivo entero y guarda.
 *   3. Implementar → Nueva implementación → tipo «Aplicación web».
 *        Ejecutar como: yo · Quién tiene acceso: cualquier usuario.
 *      Autoriza el acceso cuando Google lo pida.
 *   4. Copia la URL que termina en /exec y ponla en web/js/config.js (SHEETS_URL).
 *
 * La hoja crea sola dos pestañas: «Lista» (una fila por email) y «Votos» (una fila por dispositivo).
 * Desde la web solo se puede escribir y leer recuentos (votos y apuntados por pueblo); los emails nunca salen de la hoja.
 * Si cambias este archivo, vuelve a implementar: Implementar → Gestionar implementaciones → editar → Nueva versión.
 */

const PERFILES = ['Jugador', 'Creador', 'Desde fuera', 'Ayuntamiento'];
const ORIGENES = ['jugar', 'formulario'];
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const INE = /^\d{5}$/;
const DEVICE = /^[A-Za-z0-9_-]{12,64}$/;

function hoja(nombre, cabecera) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let h = ss.getSheetByName(nombre);
  if (!h) {
    h = ss.insertSheet(nombre);
    h.appendRow(cabecera);
    h.setFrozenRows(1);
    h.getRange(1, 1, 1, cabecera.length).setFontWeight('bold');
  }
  return h;
}

// (un apóstrofo delante: «06060» se queda como texto y no se convierte en el número 6060)
const comoTexto = (v) => (v === '' ? '' : "'" + v);

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function texto(v, max) {
  // (sin fórmulas: nada que empiece por = + - @ llega tal cual a una celda)
  return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').replace(/^[=+\-@]+/, '').trim().slice(0, max);
}

function doGet(e) {
  const accion = e && e.parameter && e.parameter.accion;
  if (accion === 'votos') {
    const cache = CacheService.getScriptCache();
    const guardado = cache.get('votos');
    if (guardado) return responder({ ok: true, votos: JSON.parse(guardado) });
    const filas = hoja('Votos', ['dispositivo', 'pueblo', 'fecha']).getDataRange().getValues().slice(1);
    const votos = {};
    filas.forEach((f) => { const p = String(f[1]); if (INE.test(p)) votos[p] = (votos[p] || 0) + 1; });
    cache.put('votos', JSON.stringify(votos), 30);
    return responder({ ok: true, votos: votos });
  }
  if (accion === 'apuntados') {
    // cuántas personas hay en la lista de espera por pueblo (solo números: los emails no salen de aquí)
    const cache = CacheService.getScriptCache();
    const guardado = cache.get('apuntados');
    if (guardado) return responder(Object.assign({ ok: true }, JSON.parse(guardado)));
    const h = hoja('Lista', ['email', 'alias', 'pueblo (INE)', 'pueblo (escrito)', 'perfil', 'origen', 'dispositivo', 'fecha']);
    const filas = h.getDataRange().getValues().slice(1);
    const pueblos = {};
    filas.forEach((f) => { const p = String(f[2]); if (INE.test(p)) pueblos[p] = (pueblos[p] || 0) + 1; });
    const datos = { pueblos: pueblos, total: filas.length };
    cache.put('apuntados', JSON.stringify(datos), 60);
    return responder(Object.assign({ ok: true }, datos));
  }
  return responder({ ok: true, servicio: '388 Pueblos' });
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return responder({ ok: false, status: 400, error: 'JSON no válido' }); }
  if (!d || typeof d !== 'object') return responder({ ok: false, status: 400, error: 'JSON no válido' });
  if (d.web) return responder({ ok: true }); // el campo trampa: solo lo rellenan los robots

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return responder({ ok: false, status: 503, error: 'ocupado, prueba otra vez' });
  try {
    if (d.accion === 'lista') {
      const email = texto(d.email, 254).toLowerCase();
      if (!EMAIL.test(email)) return responder({ ok: false, status: 400, error: 'email no válido' });
      if (d.edad14 !== true || d.acepto !== true) return responder({ ok: false, status: 400, error: 'falta la confirmación de edad o el consentimiento' });
      const fila = [
        email,
        texto(d.alias, 40),
        comoTexto(INE.test(String(d.pueblo)) ? String(d.pueblo) : ''),
        texto(d.pueblo_texto, 60),
        PERFILES.indexOf(d.perfil) >= 0 ? d.perfil : '',
        ORIGENES.indexOf(d.origen) >= 0 ? d.origen : '',
        comoTexto(DEVICE.test(String(d.device)) ? String(d.device) : ''),
        new Date(),
      ];
      const h = hoja('Lista', ['email', 'alias', 'pueblo (INE)', 'pueblo (escrito)', 'perfil', 'origen', 'dispositivo', 'fecha']);
      const emails = h.getRange(1, 1, h.getLastRow(), 1).getValues().map((r) => String(r[0]).toLowerCase());
      const i = emails.indexOf(email);
      if (i > 0) {
        // ya estaba: se completan los datos que falten, sin tocar la fecha de alta
        const antes = h.getRange(i + 1, 1, 1, fila.length).getValues()[0];
        const nueva = fila.map((v, k) => (k === fila.length - 1 ? antes[k] : (v === '' ? (k === 2 || k === 6 ? comoTexto(String(antes[k])) : antes[k]) : v)));
        h.getRange(i + 1, 1, 1, fila.length).setValues([nueva]);
        return responder({ ok: true, nuevo: false });
      }
      h.appendRow(fila);
      CacheService.getScriptCache().remove('apuntados');
      return responder({ ok: true, nuevo: true });
    }
    if (d.accion === 'voto') {
      const device = String(d.device || '');
      const pueblo = String(d.pueblo || '');
      if (!DEVICE.test(device) || !INE.test(pueblo)) return responder({ ok: false, status: 400, error: 'voto no válido' });
      const h = hoja('Votos', ['dispositivo', 'pueblo', 'fecha']);
      const ids = h.getRange(1, 1, h.getLastRow(), 1).getValues().map((r) => String(r[0]));
      const i = ids.indexOf(device);
      if (i > 0) h.getRange(i + 1, 2, 1, 2).setValues([[comoTexto(pueblo), new Date()]]);
      else h.appendRow([comoTexto(device), comoTexto(pueblo), new Date()]);
      CacheService.getScriptCache().remove('votos');
      return responder({ ok: true });
    }
    return responder({ ok: false, status: 404, error: 'acción desconocida' });
  } finally {
    lock.releaseLock();
  }
}
