// Entrar a jugar en Guareña sin salir de la página.
//
// El juego, Guareña HQ en plastilina (https://nestorguerra.github.io/guarena-hq/), arranca sin menús con la «foto del
// dron»: una vista aérea pintada desde una cámara fija que se va acercando mientras construye el pueblo, y luego su
// cámara real baja hasta Annie, en su puerta de la calle Malfeitos. Dentro, X abre los ajustes; su botón «Volver a la
// página web» pide aquí cerrarlo (guarena:salir) y la cámara vuelve a la web desde donde estaba.
// Aquí la cámara de la web baja hasta ese mismo punto, con el mismo encuadre, mientras el juego se descarga debajo, en
// un iframe, sin construir nada todavía (su trabajo pesado congelaría esta cámara: en muchos navegadores comparten
// proceso). Al llegar, la web se funde con la foto del juego, que ya no se mueve con JavaScript sino con una transición
// CSS (suave aunque todo esté ocupado); entonces el juego construye el pueblo detrás de la foto, que se sigue acercando,
// y su cámara baja hasta Annie. Se hablan con mensajes:
//   juego → web  guarena:ready   (la foto está puesta y quieta)    guarena:picture (la foto ya se acerca)
//   web → juego  guarena:go {t}  (acércate desde t, en el reloj      guarena:shown   (ya se te ve: sigue hasta Annie)
//                                 de la web: aunque el juego lo oiga tarde, la foto va por donde va la cámara)
//   juego → web  guarena:salir   (el jugador quiere volver a la web: la web cierra el juego y recupera su cámara)
import { THREE } from './world.js';

const DEFAULT_GAME = 'https://nestorguerra.github.io/guarena-hq/';

// Del sistema del juego (metros; x al este, z al sur; origen 38.8596 N, 6.1025 O; proyección equirectangular) al de
// la web (UTM 29N centrado en la Plaza de España; X al este, Z = −norte). Ajuste afín: 1,82° de giro, escala 1,0017.
const A = [1.0011955598159694, 0.031661620112252424, 0.03185755483713001, -0.9971191597776488];
const B = [33.32306793902535, 42.333756785839796];
export function gameToWeb(gx, gy, gz) {
  const east = A[0] * gx + A[1] * gz + B[0];
  const north = A[2] * gx + A[3] * gz + B[1];
  return new THREE.Vector3(east, gy, -north);
}

// La cámara de la foto del dron en el juego (src/intro.js · introPlan: D0 mirando a T, 48° de campo vertical a 16:9)
const DRONE = gameToWeb(239.21775900469402, 150, -289.8913002799052);
const TARGET = gameToWeb(80.96342613091716, 0, -157.29580214110777);
export const GAME_TOWER = gameToWeb(-180.47124298967162, 31, -38.105929466298754);
export function coverFov(aspect) {
  const t = Math.tan(THREE.MathUtils.degToRad(24));
  return aspect > 16 / 9 ? THREE.MathUtils.radToDeg(2 * Math.atan((t * 16) / 9 / aspect)) : 48;
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lerp = (a, b, t) => a + (b - a) * t;

function gameUrl() {
  // en local se puede probar con el juego sin empaquetar: ?juego=http://localhost:8920/index.html
  try {
    const q = new URLSearchParams(location.search).get('juego');
    if (q && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(q)) return q;
  } catch { /* ignore */ }
  return DEFAULT_GAME;
}

// Dentro del visor de claude.ai no se pueden incrustar otras webs: allí el botón abre el juego en otra pestaña.
export const canEmbed = () => !window.claude;

export function createPlay({ camera, controls, canvas, onStart = () => {}, onHandoff = () => {}, onExit = () => {} }) {
  const url = gameUrl();
  // aviso discreto mientras el juego termina de cargar (solo si la espera se nota) y salida digna si no carga
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
  function fail() {
    const href = new URL(url, location.href).href;
    exit();
    const box = document.createElement('div');
    box.className = 'game-status on fail';
    box.setAttribute('role', 'alert');
    box.innerHTML = '<span>No hemos podido abrir el juego ahora mismo.</span> <button type="button">Reintentar</button> <a target="_blank" rel="noopener">Abrir en otra pestaña</a>';
    box.querySelector('a').href = href;
    box.querySelector('button').addEventListener('click', () => { box.remove(); start(); });
    document.body.append(box);
    setTimeout(() => box.remove(), 15000);
  }
  const origin = new URL(url, location.href).origin;
  let st = null; // {phase, t, ...}
  let iframe = null, ready = 0, goSent = 0, goWall = 0, loaded = 0;

  addEventListener('message', (e) => {
    if (!iframe || e.source !== iframe.contentWindow || e.origin !== origin || !e.data || typeof e.data.type !== 'string') return;
    if (e.data.type === 'guarena:ready' && !ready) ready = performance.now();
    // «Volver a la página web» en los ajustes del juego: atrás (el estado #jugar se va y popstate cierra el juego)
    if (e.data.type === 'guarena:salir' && st) { if (st.phase === 'game' && history.state && history.state.jugar) history.back(); else exit(); }
  });
  const post = (type, more) => { try { iframe.contentWindow.postMessage({ type, ...more }, origin); } catch { /* ignore */ } };
  // la foto del juego empieza a acercarse, y el juego a construir el pueblo, cuando lo dice la web: ya fundida con ella
  function go() { if (!goSent && iframe) { goSent = performance.now(); goWall = Date.now(); post('guarena:go', { t: goWall }); } }

  function mountIframe() {
    if (iframe) return;
    iframe = document.createElement('iframe');
    iframe.className = 'game-frame';
    iframe.title = 'Guareña, el juego';
    iframe.allow = 'fullscreen; gamepad; autoplay';
    iframe.tabIndex = -1;
    iframe.setAttribute('aria-hidden', 'true');
    const u = new URL(url, location.href);
    u.searchParams.set('estilo', 'plastilina');
    u.searchParams.set('desde', '388');
    iframe.src = u.href;
    iframe.addEventListener('load', () => { loaded = performance.now(); }, { once: true });
    document.body.append(iframe);
  }

  // la intención de jugar (pasar el ratón por el botón) ya empieza a descargar el juego
  function warm() { mountIframe(); }

  function start() {
    if (st) return;
    mountIframe();
    controls.enabled = false;
    controls.autoRotate = false;
    const p0 = camera.position.clone();
    const l0 = controls.target.clone();
    const away = DRONE.clone().sub(TARGET).normalize();
    // la curva: se separa y sube un poco, rodea y entra por detrás del dron, que ya mira a la calle de Annie
    const p1 = p0.clone().lerp(DRONE, 0.35).add(new THREE.Vector3(0, Math.max(60, p0.y * 0.25), 0));
    const p2 = DRONE.clone().addScaledVector(away, 120).add(new THREE.Vector3(0, 40, 0));
    st = { phase: 'approach', t: 0, dur: reduced ? 1.2 : 4.2, p0, p1, p2, l0, fov0: camera.fov, s: 1, at: performance.now() };
    document.body.classList.add('jugando');
    onStart();
  }

  // en la segunda mitad de la bajada la maqueta se va calentando hacia los colores de la foto del juego (la plastilina:
  // tejas anaranjadas, cal tostada), para que el fundido junte dos imágenes que ya se parecen; al volver, se enfría
  const clay = (c) => {
    c = Math.min(1, Math.max(0, c));
    canvas.style.filter = c > 0.001 ? `sepia(${(0.45 * c).toFixed(3)}) saturate(${(1 + 1.1 * c).toFixed(3)}) hue-rotate(${(-6 * c).toFixed(2)}deg) brightness(${(1 - 0.07 * c).toFixed(3)})` : '';
  };
  const v = new THREE.Vector3(), look = new THREE.Vector3(), end = new THREE.Vector3();
  function bez(a, b, c, d, t, out) {
    const u = 1 - t;
    return out.set(0, 0, 0).addScaledVector(a, u * u * u).addScaledVector(b, 3 * u * u * t).addScaledVector(c, 3 * u * t * t).addScaledVector(d, t * t * t);
  }
  function droneAt(s, out) { return out.copy(DRONE).sub(TARGET).multiplyScalar(1 / s).add(TARGET); }

  // devuelve la mezcla de luz hacia la mañana del juego (0 → 1) o null si no hay transición
  function update(dt) {
    if (!st) return null;
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const fovEnd = coverFov(aspect);
    st.t += dt;
    if (st.phase === 'approach') {
      // el final de la curva es el dron mismo: la foto del juego espera quieta, tal cual se pintó, a que la web
      // llegue a ella (la curva llega frenando: el reposo de la foto no es un parón)
      const k = Math.min(1, st.t / st.dur), e = ease(k);
      const sp = 1;
      bez(st.p0, st.p1, st.p2, droneAt(sp, end), e, v);
      look.copy(st.l0).lerp(TARGET, ease(Math.min(1, k * 1.25)));
      camera.position.copy(v);
      camera.lookAt(look);
      camera.fov = lerp(st.fov0, fovEnd, e);
      camera.updateProjectionMatrix();
      clay(ease(Math.max(0, (k - 0.5) / 0.5)));
      if (k >= 1) { st.s = sp; st.phase = 'hold'; st.t = 0; }
      return e;
    }
    if (st.phase === 'hold') {
      // ya en el dron, quieta en el encuadre de la foto: el fundido empieza en cuanto el juego la tiene puesta
      droneAt(st.s, camera.position);
      camera.lookAt(TARGET);
      camera.fov = fovEnd;
      camera.updateProjectionMatrix();
      if (st.t > 1.2 && !ready) status('Cargando el juego…');
      // (sin noticias del juego: 9 s después de que el iframe esté cargado y de haber pulsado, o 40 s en total)
      const timedOut = (loaded && performance.now() - Math.max(loaded, st.at) > 9000) || st.t > 40;
      if (timedOut && !ready) { fail(); return null; } // (el juego no ha llegado a responder)
      if (ready) {
        status(null);
        st.phase = 'fade'; st.t = 0;
        iframe.classList.add('on');
      }
      return 1;
    }
    if (st.phase === 'fade') {
      // durante el fundido las dos imágenes, quietas en el mismo encuadre
      droneAt(st.s, camera.position);
      camera.lookAt(TARGET);
      camera.updateProjectionMatrix();
      if (st.t > 1.25) {
        st.phase = 'game';
        iframe.classList.add('live');
        iframe.removeAttribute('aria-hidden');
        iframe.tabIndex = 0;
        go(); // (la foto empieza a acercarse y el juego, a construirse detrás)
        post('guarena:shown', { t: goWall || Date.now() });
        try { iframe.focus(); } catch { /* ignore */ }
        try { history.pushState({ jugar: 1 }, '', '#jugar'); } catch { /* ignore */ }
        onHandoff();
      }
      return 1;
    }
    return 1;
  }

  function exit() {
    if (!st) return;
    status(null);
    const fov0 = st.fov0;
    st = null;
    ready = 0; goSent = 0; goWall = 0; loaded = 0;
    if (iframe) { iframe.remove(); iframe = null; }
    document.body.classList.remove('jugando');
    canvas.style.transition = 'filter 1.4s ease'; clay(0); setTimeout(() => { canvas.style.transition = ''; }, 1500);
    // de vuelta en la web, desde donde estaba la cámara y mirando a lo mismo (sin saltos)
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const d = Math.max(controls.minDistance, Math.min(controls.maxDistance, camera.position.y / Math.max(0.2, -dir.y)));
    controls.target.copy(camera.position).addScaledVector(dir, d);
    controls.enabled = true;
    onExit({ fov: fov0 });
  }
  addEventListener('popstate', () => { if (st && st.phase === 'game') exit(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && st && st.phase !== 'game') exit(); });

  return {
    start, warm, update, exit,
    get active() { return !!st; },
    get playing() { return !!st && st.phase === 'game'; },
    get phase() { return st ? st.phase : null; },
    url,
  };
}
