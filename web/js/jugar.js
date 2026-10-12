// Entrar a jugar en Guareña sin salir de la página.
//
// El juego (https://nestorguerra.github.io/guarena/) arranca con la «foto del dron»: una vista aérea pintada desde una
// cámara fija que se va acercando mientras construye el pueblo, y luego su cámara real vuela hasta Annie.
// Aquí la cámara de la web baja hasta ese mismo punto, con el mismo encuadre; el juego se carga debajo, en un iframe,
// y las dos imágenes se funden. Se hablan con mensajes:
//   juego → web  guarena:ready   (la foto está puesta y quieta)    guarena:picture (la foto ya se acerca, y se ve)
//   web → juego  guarena:go {t}  (acércate desde t, en el reloj      guarena:shown   (ya se te ve: sigue hasta Annie)
//                                 de la web: aunque el juego lo oiga tarde, la foto va por donde va la cámara)
import { THREE } from './world.js';

const DEFAULT_GAME = 'https://nestorguerra.github.io/guarena/';

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

// cubic-bezier(0.25, 0.55, 0.35, 1): la misma curva con la que se acerca la foto del juego (26 s, hasta 1,34×)
function cssBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x; const d = dx(t); if (Math.abs(e) < 1e-5 || Math.abs(d) < 1e-6) break; t -= e / d; }
    return sy(Math.min(1, Math.max(0, t)));
  };
}
const pictureEase = cssBezier(0.25, 0.55, 0.35, 1);
const pictureScale = (ms) => 1 + 0.34 * pictureEase(Math.min(1, ms / 26000));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

function gameUrl() {
  // en local se puede probar con el juego sin empaquetar: ?juego=http://localhost:8918/index.html
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
  const origin = new URL(url, location.href).origin;
  let st = null; // {phase, t, ...}
  let iframe = null, ready = 0, goSent = 0, goWall = 0, picture = 0, loaded = 0;

  addEventListener('message', (e) => {
    if (!iframe || e.source !== iframe.contentWindow || e.origin !== origin || !e.data || typeof e.data.type !== 'string') return;
    if (e.data.type === 'guarena:ready' && !ready) { ready = performance.now(); if (st) go(); }
    if (e.data.type === 'guarena:picture' && !picture) picture = performance.now();
  });
  const post = (type, more) => { try { iframe.contentWindow.postMessage({ type, ...more }, origin); } catch { /* ignore */ } };
  // la foto del juego empieza a acercarse cuando lo dice la web (si se ha cargado antes, espera quieta)
  function go() { if (!goSent && ready && iframe) { goSent = performance.now(); goWall = Date.now(); post('guarena:go', { t: goWall }); } }
  // cuánto se ha acercado ya la foto del juego (1 = el dron; la web la sigue con su cámara)
  const pictureS = () => {
    const since = goSent || picture; // (un juego que no espera la señal empieza a acercarse él solo)
    return since ? pictureScale(performance.now() - since) : 1;
  };

  function mountIframe() {
    if (iframe) return;
    iframe = document.createElement('iframe');
    iframe.className = 'game-frame';
    iframe.title = 'Guareña, el juego';
    iframe.allow = 'fullscreen; gamepad; autoplay';
    iframe.tabIndex = -1;
    iframe.setAttribute('aria-hidden', 'true');
    const u = new URL(url, location.href);
    u.searchParams.set('estilo', 'anime');
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
    go();
    controls.enabled = false;
    controls.autoRotate = false;
    const p0 = camera.position.clone();
    const l0 = controls.target.clone();
    const away = DRONE.clone().sub(TARGET).normalize();
    // la curva: se separa y sube un poco, rodea y entra por detrás del dron, que ya mira a la calle de Annie
    const p1 = p0.clone().lerp(DRONE, 0.35).add(new THREE.Vector3(0, Math.max(60, p0.y * 0.25), 0));
    const p2 = DRONE.clone().addScaledVector(away, 120).add(new THREE.Vector3(0, 40, 0));
    st = { phase: 'approach', t: 0, dur: 4.2, p0, p1, p2, l0, fov0: camera.fov, s: 1, at: performance.now() };
    document.body.classList.add('jugando');
    onStart();
  }

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
      // el final de la curva es el punto al que ha llegado la foto del juego (si ya se mueve, la curva entra en
      // su acercamiento con su misma velocidad: no hay parón ni tirón al llegar)
      const k = Math.min(1, st.t / st.dur), e = ease(k);
      const sp = pictureS();
      bez(st.p0, st.p1, st.p2, droneAt(sp, end), e, v);
      look.copy(st.l0).lerp(TARGET, ease(Math.min(1, k * 1.25)));
      camera.position.copy(v);
      camera.lookAt(look);
      camera.fov = lerp(st.fov0, fovEnd, e);
      camera.updateProjectionMatrix();
      if (k >= 1) { st.s = sp; st.phase = 'hold'; st.t = 0; }
      return e;
    }
    if (st.phase === 'hold') {
      // ya en el dron, la cámara va con la foto del juego (o, si el juego aún no ha dicho nada, se acerca muy
      // despacio mientras carga); el fundido empieza cuando el juego enseña la foto y la foto ha alcanzado a la cámara
      const sp = pictureS();
      if (!goSent && !picture) st.s = Math.min(1.012, st.s + dt * 0.0012);
      const s = Math.max(st.s, sp);
      droneAt(s, camera.position);
      camera.lookAt(TARGET);
      camera.fov = fovEnd;
      camera.updateProjectionMatrix();
      // (sin noticias del juego: 9 s después de que el iframe esté cargado y de haber pulsado, o 40 s en total)
      const timedOut = (loaded && performance.now() - Math.max(loaded, st.at) > 9000) || st.t > 40;
      if ((picture && performance.now() - picture > 120 && sp >= st.s - 1e-4) || timedOut) {
        st.phase = 'fade'; st.t = 0;
        if (!picture) picture = performance.now(); // (un juego sin mensajes: al menos que la cámara siga acercándose)
        iframe.classList.add('on');
      }
      return 1;
    }
    if (st.phase === 'fade') {
      // durante el fundido la cámara sigue exactamente el acercamiento de la foto del juego
      droneAt(Math.max(st.s, pictureS()), camera.position);
      camera.lookAt(TARGET);
      camera.updateProjectionMatrix();
      if (st.t > 1.25) {
        st.phase = 'game';
        iframe.classList.add('live');
        iframe.removeAttribute('aria-hidden');
        iframe.tabIndex = 0;
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
    const fov0 = st.fov0;
    st = null;
    ready = 0; goSent = 0; goWall = 0; picture = 0; loaded = 0;
    if (iframe) { iframe.remove(); iframe = null; }
    document.body.classList.remove('jugando');
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
