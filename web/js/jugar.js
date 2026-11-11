// Entrar a jugar en Guareña sin salir de la página: del gemelo de la web al pueblo entero del juego, como una sola
// película, sin paradas ni pantallas en blanco.
//
// El juego es el gemelo digital de Guareña con la iglesia de Santa María por fuera y por dentro (PlayCanvas, en
// https://nestorguerra.github.io/calle-malfeitos/?escena=guarena; su parte, en el proyecto «388 Foto»,
// src/desde388.js). Va en un marco, debajo, y se descarga desde que se pide jugar (o desde que se pasa el ratón por el
// botón). Mientras, la cámara de la web vuela sin pararse: viene de donde estaba (en la portada, de la bajada desde el
// mapa, sin frenar), mira la torre de Santa María al pasar, gira hacia la calle Malfeitos y baja hasta el punto de la
// FOTO, a 26 m sobre la calle, mirando hacia la chica. Si el juego aún se descarga, el vuelo va más despacio (nunca se
// para). Al llegar, la cámara deja de avanzar y empieza a acercarse con el objetivo (zoom), y la maqueta se funde con
// la foto que el propio juego sacó desde ese punto (web/assets/juego/, tools/foto388.py en «388 Foto»), que sigue
// acercándose por CSS (suave aunque el navegador esté ocupado: es cuando el juego construye el pueblo). Cuando el
// juego está, se pone en el mismo punto con el mismo zoom que lleva la foto en ese instante, se funde con ella (son la
// misma imagen) y su cámara baja por la calle hasta detrás de la chica. Se hablan con mensajes:
//   juego → web  g388:hola · g388:progreso {p, descargado} · g388:obra {p} · g388:listo · g388:aterriza · g388:error {msg}
//   web → juego  g388:construye (la foto ya tapa la web) · g388:entra {s, r, t, cruce} (el zoom de la foto: s en el
//                instante t de Date.now(), creciendo e^r por segundo; el fundido dura «cruce» segundos)
// guarena.html, con ?jugar, monta el marco antes que nada (window.__j388) para que la descarga empiece cuanto antes.
import { t, addTexts, page } from './i18n.js';

addTexts({
  es: {
    'j.fallo': 'No hemos podido abrir el juego ahora mismo.', 'j.reintentar': 'Reintentar', 'j.pestana': 'Abrir en otra pestaña',
    'j.titulo': 'Guareña, el juego', 'j.bajando': ({ p }) => `Bajando el pueblo · ${p} %`, 'j.obra': 'Levantando el pueblo',
    'j.volver': '388 Pueblos', 'j.volverLargo': 'Volver a 388 Pueblos',
  },
  en: {
    'j.fallo': 'We could not open the game right now.', 'j.reintentar': 'Try again', 'j.pestana': 'Open in a new tab',
    'j.titulo': 'Guareña, the game', 'j.bajando': ({ p }) => `Downloading the town · ${p} %`, 'j.obra': 'Building the town',
    'j.volver': '388 Pueblos', 'j.volverLargo': 'Back to 388 Pueblos',
  },
});
import { THREE } from './world.js';

const GAME = 'https://nestorguerra.github.io/calle-malfeitos/?escena=guarena';
// la dirección del juego, con ?desde=388 (su entrada desde aquí). En local se puede probar con el juego servido en local:
// ?juego=http://127.0.0.1:8934/calle-malfeitos/ ; ?sonido=0 pasa al juego
export function gameUrl() {
  let base = GAME;
  const q = new URLSearchParams(location.search);
  const local = q.get('juego');
  if (local && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(local)) base = local;
  const u = new URL(base, location.href);
  if (!u.searchParams.get('escena')) u.searchParams.set('escena', 'guarena');
  u.searchParams.set('desde', '388');
  if (q.get('sonido') === '0') u.searchParams.set('sonido', '0');
  return u.href;
}
// el juego solo, en otra pestaña (sin la entrada desde aquí)
export const gameHref = () => { const u = new URL(gameUrl()); u.searchParams.delete('desde'); return u.href; };

// Del juego (metros de una Mercator transversa con el meridiano en su origen, 38,861609 N 6,10126 O; x al este, z al
// sur) a la web (UTM 29N centrado en la Plaza de España; x al este, z al sur): un giro de 1,82° y escala 1,00038,
// ajustados por mínimos cuadrados en ±1,2 km (error < 1 cm)
const GX = [0.9998745527232633, 0.031767196010561105, 133.853547122574];
const GZ = [-0.03176719584545776, 0.9998745513707086, -268.74877702160984];
export const gameToWeb = (x, y, z) => new THREE.Vector3(GX[0] * x + GX[1] * z + GX[2], y, GZ[0] * x + GZ[1] * z + GZ[2]);

// La foto del juego (la misma FOTO de src/desde388.js en «388 Foto»: si cambia allí, cambia aquí y se vuelven a sacar)
const FOTO = { pos: [2, 26, 84], mira: [1, 1, 12],
  apaisada: { ancho: 2560, alto: 1440, fov: 55, src: 'apaisada.jpg' }, vertical: { ancho: 1440, alto: 2560, fov: 80, src: 'vertical.jpg' } };
const fotoDe = (aspecto) => (aspecto >= 1 ? FOTO.apaisada : FOTO.vertical);
// el campo vertical con que se ve la foto a pantalla completa (recortada como «cover») en una pantalla de este aspecto
export function fovFoto(aspecto) {
  const f = fotoDe(aspecto), af = f.ancho / f.alto, tg = Math.tan(f.fov * Math.PI / 360);
  return aspecto >= af ? 2 * Math.atan(tg * af / aspecto) * 180 / Math.PI : f.fov;
}
const lente = (fov, z) => 2 * Math.atan(Math.tan(fov * Math.PI / 360) / z) * 180 / Math.PI; // (el objetivo cerrado z veces)
// (la versión de la foto y el vídeo: assets/ se guarda una semana en el navegador; si se vuelven a sacar, se sube)
const MEDIA = '?v=20261111';
const urlFoto = (aspecto) => new URL(`../assets/juego/${fotoDe(aspecto).src}${MEDIA}`, import.meta.url).href;
// el VÍDEO que sigue a la foto: desde su punto, la cámara del juego sigue calle arriba frenando (lo mismo que VIDEO y
// enVideo en src/desde388.js; lo graba tools/foto388.py). En coordenadas del juego
const VIDEO = { dur: 16, tau: 9, hasta: [1.5, 14, 44] };
const enVideo = (t) => {
  const e = Math.exp(-Math.max(0, Math.min(VIDEO.dur, t)) / VIDEO.tau), P = FOTO.pos, Q = VIDEO.hasta;
  return { pos: P.map((p, i) => p + (1 - e) * (Q[i] - p)), vel: P.map((p, i) => (e / VIDEO.tau) * (Q[i] - p)) };
};
const velWeb = (v) => new THREE.Vector3(GX[0] * v[0] + GX[1] * v[2], v[1], GZ[0] * v[0] + GZ[1] * v[2]);
const urlVideo = (aspecto) => new URL(`../assets/juego/${aspecto >= 1 ? 'apaisada' : 'vertical'}.mp4${MEDIA}`, import.meta.url).href;

// Dentro del visor de claude.ai no se pueden incrustar otras webs: allí el botón abre el juego en otra pestaña.
export const canEmbed = () => !window.claude;

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lerp = (a, b, x) => a + (b - a) * x;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const s = clamp01((x - a) / (b - a)); return s * s * (3 - 2 * s); };

// ---- el vuelo: puntos de paso en el tiempo unidos por curvas de Hermite, con la velocidad de cada punto sacada de sus
// vecinos (Catmull-Rom en el tiempo): la velocidad nunca salta. Sale con la que traía la cámara (en la portada, la de
// la bajada) y llega al punto de la foto con la velocidad con que arranca el vídeo. La torre: tower (x, z de la web)
const R_ZOOM = 0.1; // (si no hay vídeo: lo que crece la foto por segundo, en escala logarítmica)
function recorrido(st, tower) {
  const P = gameToWeb(...FOTO.pos), M = gameToWeb(...FOTO.mira);
  const adelante = M.clone().sub(P).setY(0).normalize();
  const T = (dx, h, dz) => new THREE.Vector3(tower.x + dx, h, tower.z + dz);
  const K = [st.pos.clone(), new THREE.Vector3(250, 210, 170), new THREE.Vector3(190, 96, 12),
    P.clone().addScaledVector(adelante, -70).setY(40), P.clone()];
  const L = [st.look.clone(), T(0, 22, 0), new THREE.Vector3(40, 8, -150), M.clone().addScaledVector(adelante, 20).setY(2), M.clone()];
  // los tiempos: el primer tramo, según lo lejos que esté la cámara (desde la portada viene lanzada)
  const t1 = Math.min(2.8, Math.max(1.3, K[0].distanceTo(K[1]) / (st.vel.length() > 30 ? 280 : 200)));
  const times = [0, t1, t1 + 1.6, t1 + 3.1, t1 + 4.5];
  const vFin = velWeb(enVideo(0).vel);
  const tang = (pts, v0, vn) => pts.map((p, i) => {
    if (i === 0) return v0 ? v0.clone() : new THREE.Vector3();
    if (i === pts.length - 1) return vn.clone(); // (llega con la velocidad del vídeo; lo que mira, quieto)
    return pts[i + 1].clone().sub(pts[i - 1]).multiplyScalar(1 / (times[i + 1] - times[i - 1]));
  });
  const mk = tang(K, st.vel, vFin), ml = tang(L, st.lookVel, new THREE.Vector3());
  const at = (pts, m, tau, out) => {
    const n = times.length - 1;
    tau = Math.min(times[n], Math.max(0, tau));
    let i = 0; while (i < n - 1 && tau > times[i + 1]) i++;
    const h = times[i + 1] - times[i], s = (tau - times[i]) / h, s2 = s * s, s3 = s2 * s;
    return out.set(0, 0, 0)
      .addScaledVector(pts[i], 2 * s3 - 3 * s2 + 1).addScaledVector(m[i], (s3 - 2 * s2 + s) * h)
      .addScaledVector(pts[i + 1], -2 * s3 + 3 * s2).addScaledVector(m[i + 1], (s3 - s2) * h);
  };
  return { end: times[times.length - 1], lento: [times[1] * 0.5, times[3] + 0.6], pos: (tau, o) => at(K, mk, tau, o), look: (tau, o) => at(L, ml, tau, o) };
}

export function createPlay({ camera, canvas, tower, controls = null, onStart = () => {}, onFoto = () => {}, onExit = () => {}, onVolver = null }) {
  const url = gameUrl();
  const origin = new URL(url).origin;
  const tw = { x: tower?.x ?? -126.1, z: tower?.z ?? -97.0 };
  // aviso discreto (solo si la espera se alarga) y salida digna si el juego no llega
  let pill = null;
  const status = (text) => {
    if (!text) { if (pill) { pill.classList.remove('on'); const p = pill; pill = null; setTimeout(() => p.remove(), 400); } return; }
    if (!pill) {
      pill = document.createElement('div');
      pill.className = 'game-status';
      pill.setAttribute('role', 'status');
      document.body.append(pill);
      requestAnimationFrame(() => pill && pill.classList.add('on'));
    }
    pill.textContent = text;
  };

  // el estado del juego (guarena.html lo empieza a apuntar antes de que llegue este código)
  const J = window.__j388 || (window.__j388 = { p: 0, descargado: false, obra: 0, listo: false, hola: false, aterriza: false });
  let iframe = J.iframe || null;
  const post = (type, more) => { try { iframe.contentWindow.postMessage({ type, ...more }, origin); } catch { /* ignore */ } };
  // (el ritmo de la descarga, para saber cuánto le falta)
  const hist = [];
  const faltaDescarga = () => {
    if (J.descargado) return 0;
    const now = performance.now(), v = hist.find((h) => now - h[0] < 4000);
    if (!v || now - v[0] < 600) return 8; // (aún sin ritmo: una espera media)
    if (J.p <= v[1]) return 25;
    return Math.min(90, (1 - J.p) * (now - v[0]) / 1000 / (J.p - v[1]));
  };
  addEventListener('message', (e) => {
    if (!iframe || e.source !== iframe.contentWindow || e.origin !== origin || !e.data || typeof e.data.type !== 'string') return;
    const d = e.data;
    if (d.type === 'g388:hola') J.hola = true;
    if (d.type === 'g388:progreso') { J.p = Math.max(J.p, +d.p || 0); if (d.descargado) J.descargado = true; hist.push([performance.now(), J.p]); if (hist.length > 60) hist.shift(); }
    if (d.type === 'g388:obra') J.obra = Math.max(J.obra, +d.p || 0);
    if (d.type === 'g388:listo') J.listo = true;
    if (d.type === 'g388:aterriza') { J.aterriza = true; landed(); }
  });

  let foto = null, video = null;
  const aspecto = () => canvas.clientWidth / Math.max(1, canvas.clientHeight);
  function mountIframe() {
    // el vídeo, lo primero (se necesita antes que el juego), con la foto como cartel
    if (!video && !reduced) {
      video = document.createElement('video');
      video.className = 'foto388';
      video.muted = true; video.defaultMuted = true; video.playsInline = true;
      video.setAttribute('muted', ''); video.setAttribute('playsinline', ''); video.setAttribute('aria-hidden', 'true');
      video.preload = 'auto';
      video.poster = urlFoto(aspecto());
      video.src = urlVideo(aspecto());
      document.body.append(video);
      try { video.load(); } catch { /* ignore */ }
    }
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.className = 'game-frame';
      iframe.title = t('j.titulo');
      iframe.allow = 'fullscreen; gamepad; autoplay; pointer-lock';
      iframe.tabIndex = -1;
      iframe.setAttribute('aria-hidden', 'true');
      iframe.src = url;
      iframe.addEventListener('load', () => { J.cargado = performance.now(); }, { once: true });
      document.body.append(iframe);
      J.iframe = iframe; J.montado = performance.now();
    }
    // la foto, ya pedida (para que esté cuando haga falta)
    if (!foto) {
      foto = new Image();
      foto.className = 'foto388';
      foto.alt = '';
      foto.decoding = 'async';
      foto.src = urlFoto(aspecto());
    }
  }
  // la intención de jugar (pasar el ratón por el botón) ya empieza a descargar el juego
  const warm = () => mountIframe();

  let st = null, back = null;
  const v = new THREE.Vector3(), look = new THREE.Vector3();

  // start({pos, vel, look, lookVel}): la cámara, por dónde va y a qué velocidad (si no se dan, la cámara parada)
  function start(desde = {}) {
    if (st) return;
    mountIframe();
    if (controls) { controls.enabled = false; controls.autoRotate = false; }
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const s0 = {
      pos: desde.pos ? desde.pos.clone() : camera.position.clone(),
      vel: desde.vel ? desde.vel.clone() : new THREE.Vector3(),
      look: desde.look ? desde.look.clone() : camera.position.clone().addScaledVector(dir, controls ? camera.position.distanceTo(controls.target) : 300),
      lookVel: desde.lookVel ? desde.lookVel.clone() : new THREE.Vector3(),
    };
    st = { phase: 'vuelo', tau: 0, k: 1, prisa: false, path: recorrido(s0, tw), fov0: camera.fov, z: 1, t: 0, wait: 0 };
    if (reduced) st.tau = st.path.end - 1.2;
    document.body.classList.add('jugando');
    addEventListener('pointerdown', hurry);
    onStart();
  }
  function hurry() { if (st && st.phase === 'vuelo') st.prisa = true; }

  // si el juego no llega: el aviso, con reintentar y abrirlo aparte
  function fail() {
    const enVuelo = st && st.phase === 'vuelo';
    if (enVuelo) exit(true);
    else { st.phase = 'fallo'; iframe?.remove(); iframe = null; J.iframe = null; }
    status(null);
    const box = document.createElement('div');
    box.className = 'game-status on fail';
    box.setAttribute('role', 'alert');
    box.innerHTML = `<span>${t('j.fallo')}</span> <button type="button">${t('j.reintentar')}</button> <a target="_blank" rel="noopener">${t('j.pestana')}</a>`;
    box.querySelector('a').href = gameHref();
    box.querySelector('button').addEventListener('click', () => { box.remove(); if (enVuelo) start(); else location.reload(); });
    document.body.append(box);
    if (enVuelo) setTimeout(() => box.remove(), 15000);
  }

  // ---- el zoom de la foto por CSS: de la escala z a la que toque, saliendo con su velocidad (r: crecimiento
  // logarítmico por segundo) y frenando poco a poco, para que dure lo que se calcula que le falta al juego (y algo más:
  // si tarda más, se vuelve a planear mientras la página no esté ocupada; nunca se queda quieta)
  function usarFoto() {
    st.media = foto; st.modo = 'foto';
    foto.src = urlFoto(aspecto()); // (por si la pantalla ha girado)
    if (!foto.isConnected) document.body.append(foto);
    foto.style.transition = 'none'; foto.style.opacity = '0';
    if (video) video.style.opacity = '0';
  }
  const escalaFoto = () => { const m = getComputedStyle(st.media).transform; return m && m !== 'none' ? parseFloat(m.slice(m.indexOf('(') + 1)) || 1 : 1; };
  // (lo que le falta al juego: la descarga y, si aún no ha construido, la obra)
  const faltaJuego = () => (J.listo ? 0 : faltaDescarga() + (J.obra >= 0.5 ? 3 : 5.5));
  function planearZoom(z, r) {
    const T = faltaJuego() * 1.25 + 5;
    const zFin = Math.min(2.2, z * (1 + Math.max(0.02, r) * T * 0.6));
    const x1 = 0.3, y1 = Math.min(1.4, Math.max(0.05, (r * z * T * x1) / Math.max(0.01, zFin - z)));
    const m = st.media;
    m.style.transition = 'none';
    m.style.transform = `scale(${z.toFixed(4)})`;
    void m.offsetWidth;
    m.style.transition = `transform ${T.toFixed(2)}s cubic-bezier(${x1}, ${y1.toFixed(3)}, 0.55, 1)`;
    m.style.transform = `scale(${zFin.toFixed(4)})`;
    st.zoomPlan = { desde: performance.now(), T, zFin };
  }
  let ultimaEscala = null; // [ms, escala]: para medir la velocidad del zoom
  const medirZoom = () => {
    const now = performance.now(), z = escalaFoto();
    let r = 0;
    if (ultimaEscala && now - ultimaEscala[0] > 30 && now - ultimaEscala[0] < 600 && z > 0) r = Math.max(0, Math.log(z / ultimaEscala[1]) / ((now - ultimaEscala[0]) / 1000));
    ultimaEscala = [now, z];
    return { z, r };
  };

  // en el vuelo, cada fotograma: devuelve {mix (la luz de la mañana del juego, de 0 a 1), look} o null
  function update(dt) {
    if (!st) return null;
    st.t += dt;
    const fs = fovFoto(aspecto());
    if (st.phase === 'vuelo') {
      // el ritmo: más despacio en medio del vuelo si al juego aún le falta mucho por descargar
      const { path } = st;
      // (lo que le falta al juego por descargar: el vuelo dura hasta entonces. La obra se hace siempre con la foto ya
      // puesta: aunque el marco vaya en otro proceso, construir compite por la tarjeta gráfica y la web daba tirones)
      const falta = faltaDescarga();
      const enLento = st.tau > path.lento[0] && st.tau < path.lento[1];
      const goal = st.prisa ? 1.8 : enLento ? Math.min(1, Math.max(0.4, (path.end - st.tau) / Math.max(0.1, falta - 1))) : 1;
      st.k += (goal - st.k) * Math.min(1, dt * 0.8);
      st.tau = Math.min(path.end, st.tau + dt * st.k);
      path.pos(st.tau, v);
      path.look(st.tau, look);
      camera.position.copy(v);
      camera.lookAt(look);
      st.z = 1;
      const fovVuelo = lerp(Math.min(60, Math.max(42, st.fov0)), fs, smooth(path.end * 0.55, path.end, st.tau));
      camera.fov = lente(lerp(st.fov0, fovVuelo, smooth(0, 1.6, st.tau)), st.z);
      camera.updateProjectionMatrix();
      if (st.tau > 4 && st.k < 0.8 && !J.descargado) status(t('j.bajando', { p: Math.round(J.p * 100) }));
      else status(null);
      if (st.tau >= path.end) {
        status(null);
        removeEventListener('pointerdown', hurry);
        st.phase = 'funde'; st.ft = 0;
        // con el vídeo, si ya puede reproducirse (si no, la foto, que se acerca con un zoom)
        if (video && video.readyState >= 3 && video.src === urlVideo(aspecto())) {
          st.media = video; st.modo = 'video';
          try { video.currentTime = 0; } catch { /* ignore */ }
          const pr = video.play();
          if (pr && pr.catch) pr.catch(() => { if (st && st.modo === 'video' && st.phase === 'funde') usarFoto(); });
        } else usarFoto();
        st.media.style.transition = 'none'; st.media.style.opacity = '0';
      }
      return { mix: smooth(0.6, path.end - 0.5, st.tau), look: look.clone() };
    }
    if (st.phase === 'funde') {
      st.ft += dt;
      const k = smooth(0, 0.85, st.ft);
      let listo = true;
      if (st.modo === 'video') {
        // la maqueta se funde con el vídeo: la cámara de la web sigue el mismo camino que la del vídeo, al mismo tiempo
        const ev = enVideo(st.ft);
        camera.position.copy(gameToWeb(...ev.pos));
        camera.lookAt(gameToWeb(...FOTO.mira));
        camera.fov = fs;
        st.media.style.opacity = k.toFixed(3);
      } else {
        // la maqueta se funde con la foto: la cámara quieta en su punto y las dos con el mismo zoom
        st.z *= Math.exp(R_ZOOM * dt);
        camera.fov = lente(fs, st.z);
        foto.style.transform = `scale(${st.z.toFixed(4)})`;
        foto.style.opacity = (foto.complete ? k : 0).toFixed(3);
        listo = foto.complete;
      }
      camera.updateProjectionMatrix();
      if (st.ft >= 0.85 && listo) {
        // ya es el vídeo (o la foto, que sigue acercándose por CSS): la web deja de dibujar y el juego construye
        st.media.style.opacity = '1';
        st.phase = 'foto'; st.wait = 0;
        if (st.modo === 'foto') planearZoom(st.z, R_ZOOM);
        ultimaEscala = null;
        if (!st.obra) { st.obra = true; post('g388:construye'); }
        onFoto();
      }
      return { mix: 1, look: look.clone() };
    }
    return null;
  }

  // la foto y lo que sigue van con su propio reloj (la web ya no dibuja)
  let ultimoPlan = 0;
  function loop() {
    requestAnimationFrame(loop);
    if (!st || st.phase === 'vuelo' || st.phase === 'funde') return;
    const now = performance.now();
    st.last = st.last || now;
    const dt = Math.min(0.1, (now - st.last) / 1000); st.last = now;
    st.wait += dt;
    if (st.phase === 'foto') {
      if (!J.hola && J.cargado && now - J.cargado > 20000) { fail(); return; }
      if (st.wait > 180) { fail(); return; }
      if (st.wait > 9 && !J.listo) status(J.descargado ? t('j.obra') : t('j.bajando', { p: Math.round(J.p * 100) }));
      if (st.modo === 'video' && !st.zoomPlan && (video.ended || video.currentTime >= VIDEO.dur - 0.08)) {
        // (el vídeo se ha acabado y el juego aún no está: su último fotograma sigue acercándose)
        st.finVideo = Math.min(VIDEO.dur, video.currentTime || VIDEO.dur);
        planearZoom(1, R_ZOOM * 0.5);
      }
      // si el juego va a tardar más de lo planeado, se vuelve a planear el zoom desde donde va (sin saltos)
      const p = st.zoomPlan;
      if (p && now - ultimoPlan > 1500 && !J.listo) {
        ultimoPlan = now;
        const quedaPlan = p.T - (now - p.desde) / 1000;
        if (quedaPlan < faltaJuego() + 3) { medirZoom(); requestAnimationFrame(() => { if (st?.phase !== 'foto') return; const m = medirZoom(); planearZoom(m.z, m.r || R_ZOOM * 0.3); }); }
      }
      if (J.listo) {
        // el juego ya está en el punto de la foto, quieto: se le da el zoom que lleva la foto y se funden
        status(null);
        st.phase = 'mide'; medirZoom();
      }
    } else if (st.phase === 'mide') {
      const { z, r } = medirZoom();
      st.phase = 'cruza'; st.wait = 0;
      // el juego se pone donde va el vídeo (o la foto) en este instante y sigue igual mientras se funden
      const enMarcha = st.modo === 'video' && !st.zoomPlan && !video.paused && !video.ended;
      const tv = st.modo === 'video' ? (st.zoomPlan ? st.finVideo ?? VIDEO.dur : video.currentTime) : 0;
      post('g388:entra', { tv, vel: enMarcha ? 1 : 0, s: st.zoomPlan ? z : 1, r: st.zoomPlan ? (r || R_ZOOM * 0.3) : 0, t: Date.now(), cruce: 0.9 });
      iframe.style.transition = 'opacity 0.9s ease';
      iframe.classList.add('on');
    } else if (st.phase === 'cruza' && st.wait > 0.95) {
      st.phase = 'juego';
      foto?.remove(); video?.pause(); video?.remove(); video = null;
      iframe.classList.add('live');
      iframe.removeAttribute('aria-hidden');
      iframe.tabIndex = 0;
      try { iframe.focus(); iframe.contentWindow.focus(); } catch { /* ignore */ }
      if (J.aterriza) landed();
    }
  }
  requestAnimationFrame(loop);

  // ya jugando: el botón para volver a la web
  function landed() {
    if (!st || st.phase !== 'juego' || back) return;
    back = document.createElement('a');
    back.className = 'game-back';
    back.href = page('index.html#los388');
    back.setAttribute('aria-label', t('j.volverLargo'));
    back.innerHTML = `<span aria-hidden="true">←</span> ${t('j.volver')}`;
    back.addEventListener('click', (e) => {
      if (onVolver) { e.preventDefault(); onVolver(); return; }
      // de vuelta a donde se estaba (la portada se recupera tal cual), o a la portada
      try { if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) { e.preventDefault(); history.back(); } } catch { /* ignore */ }
    });
    document.body.append(back);
    requestAnimationFrame(() => back.classList.add('on'));
  }

  // salir sin haber llegado al juego (si no carga) o al volver: la web vuelve a verse, desde donde estaba la cámara
  function exit(failed = false) {
    if (!st) return;
    status(null);
    const fov0 = st.fov0, dibujaba = st.phase === 'vuelo' || st.phase === 'funde';
    st = null;
    removeEventListener('pointerdown', hurry);
    if (iframe) { iframe.remove(); iframe = null; J.iframe = null; Object.assign(J, { p: 0, descargado: false, obra: 0, listo: false, hola: false, aterriza: false, cargado: 0 }); }
    foto?.remove(); foto = null;
    video?.pause(); video?.remove(); video = null;
    back?.remove(); back = null;
    document.body.classList.remove('jugando');
    if (!dibujaba) { onExit({ fov: fov0, reload: true }); return; }
    if (controls) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const d = Math.max(controls.minDistance, Math.min(controls.maxDistance, camera.position.y / Math.max(0.2, -dir.y)));
      controls.target.copy(camera.position).addScaledVector(dir, d);
      controls.enabled = true;
    }
    onExit({ fov: fov0, failed });
  }
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && st && st.phase === 'vuelo') hurry(); });

  return {
    start, warm, update, exit,
    get active() { return !!st; },
    get dibuja() { return !st || st.phase === 'vuelo' || st.phase === 'funde'; },
    get playing() { return !!st && st.phase === 'juego'; },
    get phase() { return st ? st.phase : null; },
    get dbg() { return st && { tau: +st.tau.toFixed(2), k: +st.k.toFixed(2), falta: +faltaDescarga().toFixed(1), p: J.p, d: J.descargado }; },
    url,
  };
}
