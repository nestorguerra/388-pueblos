// Entrar a jugar en Guareña sin salir de la página: del gemelo de la web al pueblo entero del juego.
//
// El juego es el gemelo digital de Guareña con la iglesia de Santa María por fuera y por dentro (PlayCanvas, en
// https://nestorguerra.github.io/calle-malfeitos/?escena=guarena; código en el proyecto «388 Foto», src/desde388.js).
// Va en un marco, debajo, y se descarga desde que se abre esta página. Mientras, la cámara de la web vuela (un solo
// movimiento, sin paradas): baja desde el encuadre de partida, rodea la torre de Santa María con sus cigüeñas mientras
// la luz pasa del atardecer a la mañana del juego, sigue sobre los tejados hacia el norte del pueblo y gira hacia la
// calle Malfeitos, bajando, hasta entrar en una bruma de mañana. Si el juego aún se está descargando, la vuelta a la
// torre se hace más lenta (nunca se para). Dentro de la bruma (capas de nubes que se acercan, animadas por CSS: siguen
// suaves aunque el navegador esté ocupado) la web deja de dibujar y el juego construye el pueblo. Cuando lo tiene, su
// cámara está en la misma bruma, sobre los tejados del principio de la calle: la bruma se abre, la cámara del juego
// baja por la calle y se posa detrás de la chica, mirando calle abajo. Se hablan con mensajes:
//   juego → web  g388:hola · g388:progreso {p, descargado} · g388:obra {p} · g388:listo · g388:aterriza · g388:error {msg}
//   web → juego  g388:construye (ya en la bruma) · g388:baja {dur} (la bruma se abre: baja hasta la chica)
// guarena.html, con ?jugar, monta el marco antes que nada (window.__j388) para que la descarga empiece cuanto antes.
import { t, addTexts, page } from './i18n.js';

addTexts({
  es: {
    'j.fallo': 'No hemos podido abrir el juego ahora mismo.', 'j.reintentar': 'Reintentar', 'j.pestana': 'Abrir en otra pestaña',
    'j.titulo': 'Guareña, el juego', 'j.bajando': ({ p }) => `Bajando el pueblo · ${p} %`, 'j.obra': 'Levantando el pueblo',
    'j.calle': 'Calle Malfeitos', 'j.volver': '388 Pueblos', 'j.volverLargo': 'Volver a 388 Pueblos',
  },
  en: {
    'j.fallo': 'We could not open the game right now.', 'j.reintentar': 'Try again', 'j.pestana': 'Open in a new tab',
    'j.titulo': 'Guareña, the game', 'j.bajando': ({ p }) => `Downloading the town · ${p} %`, 'j.obra': 'Building the town',
    'j.calle': 'Calle Malfeitos', 'j.volver': '388 Pueblos', 'j.volverLargo': 'Back to 388 Pueblos',
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

// Dentro del visor de claude.ai no se pueden incrustar otras webs: allí el botón abre el juego en otra pestaña.
export const canEmbed = () => !window.claude;

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lerp = (a, b, x) => a + (b - a) * x;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const s = clamp01((x - a) / (b - a)); return s * s * (3 - 2 * s); };

// ---- el recorrido de la cámara: puntos de paso en el tiempo, unidos por una curva de Hermite con la velocidad de cada
// punto sacada de sus vecinos (Catmull-Rom en el tiempo): la velocidad nunca salta. Sale parada y llega a la bruma
// volando. Los puntos, en metros respecto a la torre (E al este, N al norte, h de altura) o a la calle (la del juego)
const ARCO = [3.5, 9.4]; // (la vuelta a la torre, entre estos dos tiempos: va más despacio si el juego aún se descarga)
function recorrido(p0, look0, tower) {
  const T = (E, N, h) => new THREE.Vector3(tower.x + E, h, tower.z - N);
  // la calle Malfeitos: la chica está en (1, 22) del juego y aterriza mirando al sur; la bruma, al norte de su calle
  const G = (x, y, z) => gameToWeb(x, y, z);
  const P = [
    [0, p0.clone()],
    [2.2, T(190, -250, 240)],    // baja deprisa desde el sureste, sobre el pueblo
    [3.5, T(40, -112, 82)],      // al sur de la torre, ya cerca
    [5.0, T(-72, -70, 52)],      // suroeste
    [6.5, T(-102, 6, 44)],       // oeste: la fachada y la torre con la luz de frente
    [8.0, T(-68, 78, 44)],       // noroeste
    [9.4, T(26, 146, 48)],       // norte: deja la torre
    [11.0, G(-62, 46, -118)],    // sobre los tejados, hacia la calle
    [12.5, G(-10, 42, -96)],     // gira hacia el sur, sobre el cruce del norte de la calle: entra en la bruma
    [13.8, G(1, 37, -70)],       // (solo para la velocidad de llegada: la bruma sigue hacia aquí)
  ];
  const L = [
    look0.clone(),
    T(0, 0, 18),
    T(0, 0, 20),
    T(0, 0, 21),
    T(0, 0, 21),
    T(6, 6, 19),
    T(80, 70, 10),
    G(-20, 0, -30),
    G(1, 0, -10),
    G(1, 0, 30),
  ];
  const times = P.map((k) => k[0]), pos = P.map((k) => k[1]);
  const tangents = (pts) => pts.map((p, i) => {
    if (i === 0) return new THREE.Vector3(); // (sale parada)
    const a = pts[i - 1], b = pts[Math.min(pts.length - 1, i + 1)], ta = times[i - 1], tb = times[Math.min(pts.length - 1, i + 1)];
    return b.clone().sub(a).multiplyScalar(1 / (tb - ta));
  });
  const mp = tangents(pos), ml = tangents(L);
  const at = (pts, m, tau, out) => {
    const n = times.length - 1;
    tau = Math.min(times[n], Math.max(0, tau));
    let i = 0; while (i < n - 1 && tau > times[i + 1]) i++;
    const h = times[i + 1] - times[i], s = (tau - times[i]) / h, s2 = s * s, s3 = s2 * s;
    return out.set(0, 0, 0)
      .addScaledVector(pts[i], 2 * s3 - 3 * s2 + 1).addScaledVector(m[i], (s3 - 2 * s2 + s) * h)
      .addScaledVector(pts[i + 1], -2 * s3 + 3 * s2).addScaledVector(m[i + 1], (s3 - s2) * h);
  };
  return { end: times[times.length - 2], pos: (tau, out) => at(pos, mp, tau, out), look: (tau, out) => at(L, ml, tau, out) };
}

// ---- la bruma: capas de nubes (una textura de ruido hecha aquí) que crecen hacia la cámara, en bucle, por CSS
let nubeUrl = null;
function cloudTexture() {
  if (nubeUrl) return nubeUrl;
  const N = 256, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  // ruido de valor en 5 octavas, periódico
  const rnd = (i, j, o) => { const s = Math.sin(i * 127.1 + j * 311.7 + o * 74.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (x, y, per, o) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const w = (a, b) => rnd(((a % per) + per) % per, ((b % per) + per) % per, o);
    return lerp(lerp(w(i, j), w(i + 1, j), u), lerp(w(i, j + 1), w(i + 1, j + 1), u), v);
  };
  const fbm = (x, y, o0) => { let f = 0, a = 0.5, per = 3; for (let o = 0; o < 5; o++) { f += a * noise(x * per, y * per, per, o + o0); a *= 0.5; per *= 2; } return f; };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const f = fbm(x / N, y / N, 0);
      const dx = x / N - 0.5, dy = y / N - 0.5, r = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      // copos de nube con su densidad (el alfa) y su luz: blancos por arriba y gris cálido en lo hondo, para que las
      // capas se vean pasar unas sobre otras (en blanco sobre blanco no se veía nada: parecía una pantalla vacía)
      const al = Math.pow(clamp01((f - 0.34) * 2.6), 1.15) * (1 - r * r);
      const luz = clamp01(0.55 + (fbm(x / N + 0.07, y / N - 0.09, 9) - f) * 3.2 + (0.5 - y / N) * 0.35);
      const k = (y * N + x) * 4;
      img.data[k] = Math.round(lerp(212, 255, luz)); img.data[k + 1] = Math.round(lerp(207, 253, luz)); img.data[k + 2] = Math.round(lerp(201, 249, luz));
      img.data[k + 3] = Math.round(al * 255);
    }
  }
  g.putImageData(img, 0, 0);
  nubeUrl = c.toDataURL('image/png');
  return nubeUrl;
}
function makeClouds() {
  const box = document.createElement('div');
  box.className = 'nubes';
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = '<div class="velo"></div>';
  const url = cloudTexture();
  for (let i = 0; i < 5; i++) {
    const n = document.createElement('i');
    n.style.backgroundImage = `url(${url})`;
    n.style.setProperty('--g', `${(i * 71) % 360}deg`);
    n.style.animationDelay = `${-i * 1.5}s`;
    box.append(n);
  }
  const r = document.createElement('div');
  r.className = 'rotulo';
  r.innerHTML = '<b></b><span class="mono"></span><i><u></u></i>';
  r.querySelector('b').textContent = 'Guareña';
  r.querySelector('span').textContent = `${t('j.calle')} · 38,861° N · 6,101° O`;
  box.append(r);
  document.body.append(box);
  return box;
}

export function createPlay({ camera, controls, canvas, tower, onStart = () => {}, onNubes = () => {}, onRelevo = () => {}, onExit = () => {} }) {
  const url = gameUrl();
  const origin = new URL(url).origin;
  const tw = new THREE.Vector3(tower?.x ?? -126.1, 0, tower?.z ?? -97.0);
  // aviso discreto y salida digna si el juego no llega
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
  addEventListener('message', (e) => {
    if (!iframe || e.source !== iframe.contentWindow || e.origin !== origin || !e.data || typeof e.data.type !== 'string') return;
    const d = e.data;
    if (d.type === 'g388:hola') J.hola = true;
    if (d.type === 'g388:progreso') { J.p = Math.max(J.p, +d.p || 0); if (d.descargado) J.descargado = true; }
    if (d.type === 'g388:obra') J.obra = Math.max(J.obra, +d.p || 0);
    if (d.type === 'g388:listo') J.listo = true;
    if (d.type === 'g388:aterriza') { J.aterriza = true; landed(); }
  });

  function mountIframe() {
    if (iframe) return;
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
  if (iframe && !J.montado) J.montado = performance.now();
  // la intención de jugar (pasar el ratón por el botón) ya empieza a descargar el juego
  const warm = () => mountIframe();

  let st = null, clouds = null, back = null;
  const v = new THREE.Vector3(), look = new THREE.Vector3();

  function start() {
    if (st) return;
    mountIframe();
    controls.enabled = false;
    controls.autoRotate = false;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const look0 = camera.position.clone().addScaledVector(dir, camera.position.distanceTo(controls.target));
    st = { phase: 'vuelo', tau: 0, k: 1, prisa: false, path: recorrido(camera.position.clone(), look0, tw), fov0: camera.fov, t: 0, wait: 0 };
    if (reduced) st.tau = st.path.end - 2.2; // (sin tanto vuelo: directo a la bruma)
    clouds = clouds || makeClouds();
    document.body.classList.add('jugando');
    // un toque durante el vuelo lo acelera (no lo corta: llega antes a la bruma)
    addEventListener('pointerdown', hurry);
    onStart();
  }
  function hurry() { if (st && st.phase === 'vuelo') st.prisa = true; }

  // si el juego no llega: el aviso, con reintentar y abrirlo aparte. En el vuelo, la web sigue como estaba; en la bruma
  // (la web ya no dibuja), el aviso se queda sobre ella y reintentar vuelve a cargar la página
  function fail() {
    const enVuelo = st && st.phase === 'vuelo';
    if (enVuelo) exit(true);
    else { st.phase = 'fallo'; iframe?.remove(); iframe = null; J.iframe = null; clouds?.querySelector('.rotulo')?.classList.remove('on'); }
    const box = document.createElement('div');
    box.className = 'game-status on fail';
    box.setAttribute('role', 'alert');
    box.innerHTML = `<span>${t('j.fallo')}</span> <button type="button">${t('j.reintentar')}</button> <a target="_blank" rel="noopener">${t('j.pestana')}</a>`;
    box.querySelector('a').href = gameHref();
    box.querySelector('button').addEventListener('click', () => { box.remove(); if (enVuelo) start(); else location.reload(); });
    document.body.append(box);
    if (enVuelo) setTimeout(() => box.remove(), 15000);
  }

  // en el aire, cada fotograma: devuelve {mix, niebla} (la luz de la mañana del juego y la bruma, de 0 a 1) o null
  function update(dt) {
    if (!st) return null;
    st.t += dt;
    if (st.phase === 'vuelo') {
      // la velocidad del tiempo del recorrido: en la vuelta a la torre, más despacio mientras el juego se descarga
      const inArc = st.tau > ARCO[0] && st.tau < ARCO[1];
      const goal = st.prisa ? 2.4 : inArc && !J.descargado ? 0.55 : 1;
      st.k += (goal - st.k) * Math.min(1, dt * 1.4);
      st.tau += dt * st.k;
      const { path } = st;
      path.pos(st.tau, v);
      path.look(st.tau, look);
      camera.position.copy(v);
      camera.lookAt(look);
      camera.fov = lerp(st.fov0, lerp(46, 58, smooth(8.0, path.end, st.tau)), smooth(0, 3.2, st.tau));
      camera.updateProjectionMatrix();
      const niebla = smooth(path.end - 2.3, path.end, st.tau);
      clouds.style.opacity = smooth(0.3, 1, niebla).toFixed(3);
      if (st.tau > 6 && !J.descargado && st.k < 0.8) status(t('j.bajando', { p: Math.round(J.p * 100) }));
      else status(null);
      // el juego empieza a construir cuando la bruma ya lo tapa casi todo (si algo da un tirón, apenas se ve)
      if (!st.obra && st.tau >= path.end - 1.1) { st.obra = true; post('g388:construye'); }
      if (st.tau >= path.end) {
        // ya en la bruma: la web deja de dibujar
        status(null);
        clouds.style.opacity = '1';
        st.phase = 'bruma'; st.wait = 0;
        removeEventListener('pointerdown', hurry);
        if (!st.obra) { st.obra = true; post('g388:construye'); }
        onNubes();
      }
      return { mix: smooth(1.5, path.end - 1, st.tau), niebla };
    }
    return null;
  }

  // la bruma y lo que sigue van con su propio reloj (la web ya no dibuja)
  let raf = 0;
  function cloudLoop() {
    raf = requestAnimationFrame(cloudLoop);
    if (!st || st.phase === 'vuelo') return;
    const now = performance.now();
    st.last = st.last || now;
    const dt = Math.min(0.1, (now - st.last) / 1000); st.last = now;
    st.wait += dt;
    if (st.phase === 'bruma') {
      const rot = clouds.querySelector('.rotulo');
      if (st.wait > 2.2) {
        rot.classList.add('on');
        const p = J.descargado ? 0.5 + 0.5 * J.obra : 0.5 * J.p;
        rot.querySelector('u').style.transform = `scaleX(${p.toFixed(3)})`;
      }
      if (!J.hola && J.cargado && now - J.cargado > 20000) { fail(); return; }
      if (st.wait > 150) { fail(); return; }
      if (J.listo) {
        // el juego ya está en la bruma, quieto: la bruma se cierra un momento (lo más hondo de la nube), el juego se pone
        // debajo en lugar del pueblo de la web, y la bruma se abre mientras su cámara baja
        st.phase = 'cierra'; st.wait = 0;
        rot.classList.remove('on');
        clouds.classList.add('denso');
      }
    } else if (st.phase === 'cierra' && st.wait > 0.7) {
      st.phase = 'abre'; st.wait = 0;
      iframe.classList.add('g388', 'on');
      onRelevo();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        post('g388:baja', { dur: reduced ? 3 : 6.6 });
        clouds.classList.add('abre');
        clouds.style.opacity = '0';
      }));
    } else if (st.phase === 'abre' && st.wait > 2.4) {
      st.phase = 'juego';
      iframe.classList.add('live');
      iframe.removeAttribute('aria-hidden');
      iframe.tabIndex = 0;
      try { iframe.focus(); iframe.contentWindow.focus(); } catch { /* ignore */ }
      if (J.aterriza) landed();
    }
  }
  raf = requestAnimationFrame(cloudLoop);

  // ya jugando: el botón para volver a la web
  function landed() {
    if (!st || st.phase !== 'juego' || back) return;
    back = document.createElement('a');
    back.className = 'game-back';
    back.href = page('index.html#los388');
    back.setAttribute('aria-label', t('j.volverLargo'));
    back.innerHTML = `<span aria-hidden="true">←</span> ${t('j.volver')}`;
    back.addEventListener('click', (e) => {
      // de vuelta a donde se estaba (la portada se recupera tal cual), o a la portada
      try { if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) { e.preventDefault(); history.back(); } } catch { /* ignore */ }
    });
    document.body.append(back);
    requestAnimationFrame(() => back.classList.add('on'));
  }

  // salir sin haber llegado al juego (si no carga): la web vuelve a verse, desde donde estaba la cámara
  function exit(failed = false) {
    if (!st) return;
    status(null);
    const fov0 = st.fov0, dibujaba = st.phase === 'vuelo';
    st = null;
    removeEventListener('pointerdown', hurry);
    if (iframe) { iframe.remove(); iframe = null; J.iframe = null; Object.assign(J, { p: 0, descargado: false, obra: 0, listo: false, hola: false, aterriza: false, cargado: 0 }); }
    if (clouds) { clouds.remove(); clouds = null; }
    back?.remove(); back = null;
    document.body.classList.remove('jugando');
    if (!dibujaba && failed) { onExit({ fov: fov0, reload: true }); return; }
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const d = Math.max(controls.minDistance, Math.min(controls.maxDistance, camera.position.y / Math.max(0.2, -dir.y)));
    controls.target.copy(camera.position).addScaledVector(dir, d);
    controls.enabled = true;
    onExit({ fov: fov0 });
  }
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && st && st.phase === 'vuelo') hurry(); });

  return {
    start, warm, update, exit,
    get active() { return !!st; },
    get dibuja() { return !st || st.phase === 'vuelo'; },
    get playing() { return !!st && st.phase === 'juego'; },
    get phase() { return st ? st.phase : null; },
    url,
  };
}
