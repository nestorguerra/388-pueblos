// Página de un pueblo: gemelo explorable, minijuego de nidos, pasaporte y la entrada al juego de Guareña.
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  THREE, buildTownAsync, buildGroundAsync, nextTask, buildTrees, buildStorks, buildSky, buildLights,
  applyTimeOfDay, makeRenderer, glowTexture,
} from './world.js';
import { stamp } from './pasaporte.js';
import { createPlay, canEmbed } from './jugar.js';
import { whenShown } from './red.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const lerp = (a, b, t) => a + (b - a) * t;
const fmt = new Intl.NumberFormat('es-ES');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function townError(msg, { retry = false } = {}) {
  const again = retry ? '<button class="btn primary" type="button" id="retry">Reintentar</button> ' : '';
  $('#loading').classList.remove('relevo'); // (el aviso, sobre el fondo de la noche)
  $('#loading').innerHTML = `<div class="err" role="alert"><b style="font-size:2.4rem">388 Pueblos</b><p>${msg}</p><p>${again}<a class="btn" href="index.html#los388">Volver al mapa de los 388</a></p></div>`;
  $('#retry')?.addEventListener('click', () => location.reload());
}

export async function createTownPage({ data, churches, ine, name, places = [], facts = [], firstFacts = {}, radius = 1200, playable = false }) {
  if (!document.createElement('canvas').getContext('webgl2')) {
    townError('Tu navegador no puede mostrar el modelo 3D. Prueba con una versión reciente de Chrome, Safari, Edge o Firefox.');
    return;
  }
  const canvas = $('#c');
  const { renderer, mobile, governor } = makeRenderer(canvas);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf3b98a, 900, 5200);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 20000);
  const sky = buildSky();
  scene.add(sky.mesh);
  const lights = buildLights(scene);
  // (la construcción se reparte en trozos: la página no se congela mientras se levanta el pueblo)
  await nextTask();
  const ground = await buildGroundAsync(data);
  scene.add(ground.mesh);
  await nextTask();
  const T = await buildTownAsync(data, churches ? { churches } : {});
  scene.add(T.group);
  await nextTask();
  scene.add(buildTrees(data, { count: mobile ? 2600 : 6000, isUrban: ground.isUrban, inner: 300 }));
  const tower = T.special.tower || { x: 0, y: 20, z: 0 };
  const storks = buildStorks({ x: tower.x, z: tower.z }, 8);
  scene.add(storks);
  if ($('#n-parts')) $('#n-parts').textContent = fmt.format(T.count);

  const ctx = { sky, lights, renderer };
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 45;
  controls.maxDistance = 2600;
  controls.maxPolarAngle = 1.38;
  controls.target.set(tower.x * 0.5, 8, tower.z * 0.5);
  const jugar = /[?&]jugar\b/.test(location.search); // (se viene a jugar: la cámara quieta en el encuadre de partida)
  controls.autoRotate = !reduced && !jugar;
  controls.autoRotateSpeed = 0.35;
  const startD = Math.max(380, Math.min(900, radius * 0.75));
  camera.position.set(controls.target.x + startD * 0.45, startD * 0.62, controls.target.z + startD * 0.72);
  controls.update();

  const card = $('#card');
  const showCard = (k, t, p, s) => {
    $('#card-k').textContent = k;
    $('#card-t').textContent = t;
    $('#card-p').textContent = p;
    $('#card-s').textContent = s ? `Fuente: ${s}` : '';
    card.hidden = false;
  };
  $('#card-x').addEventListener('click', () => { card.hidden = true; });
  const toast = $('#toast');
  let toastT;
  const say = (msg) => {
    toast.textContent = msg;
    toast.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => toast.classList.remove('on'), 2600);
  };

  // ---- minijuego de nidos ----
  const game = T.nests.filter((n) => n.kind === 'tejado' || n.big).slice(0, Math.max(1, facts.length + Object.keys(firstFacts).length));
  const found = new Set();
  const nestsEl = $('#nests');
  if (nestsEl) nestsEl.innerHTML = game.map((_, i) => `<i aria-label="Nido ${i + 1} sin encontrar">${i + 1}</i>`).join('');
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffa94d, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const glows = game.map((n) => {
    const s = new THREE.Sprite(glowMat.clone());
    s.position.set(n.x, n.y + 4, n.z);
    s.scale.setScalar(0.001);
    scene.add(s);
    return s;
  });
  let factIdx = 0;
  function collect(i) {
    if (found.has(i)) return;
    found.add(i);
    const n = game[i];
    const fact = firstFacts[n.kind] && !firstFacts[n.kind].used ? (firstFacts[n.kind].used = true, firstFacts[n.kind]) : facts[Math.min(facts.length - 1, factIdx++)];
    const dot = nestsEl?.children[i];
    if (dot) { dot.classList.add('got'); dot.setAttribute('aria-label', `Nido ${i + 1} encontrado`); }
    glows[i].userData.on = true;
    if (fact) showCard(`Nido ${found.size} de ${game.length}`, fact.t, fact.p, fact.s);
    if (found.size === game.length) {
      say('¡Todos los nidos! Eres vecino de honor');
      if ($('#hint')) $('#hint').textContent = `Has encontrado todos los nidos de ${name}.`;
    } else say(`Nido ${found.size} de ${game.length}`);
  }

  // ---- lugares ----
  const labels = places.map((pl) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wlabel';
    b.innerHTML = '<b></b><span></span>';
    b.querySelector('b').textContent = pl.name;
    b.querySelector('span').textContent = pl.tag || '';
    b.addEventListener('click', () => goPlace(pl));
    $('#labels').append(b);
    return { el: b, pl, vis: 0 };
  });
  const placesEl = $('#places');
  if (placesEl) {
    placesEl.innerHTML = places.map((pl, i) => `<button type="button" data-i="${i}"></button>`).join('');
    [...placesEl.children].forEach((b, i) => { b.textContent = places[i].name; const sp = document.createElement('span'); sp.textContent = places[i].tag || ''; b.append(sp); });
    placesEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (b) goPlace(places[+b.dataset.i]);
    });
  }
  let fly = null;
  function goPlace(pl) {
    controls.autoRotate = false;
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target).setY(0).normalize();
    const tgt = new THREE.Vector3(pl.x, pl.h, -pl.y);
    const pos = tgt.clone().addScaledVector(dir, pl.d * 0.8).setY(pl.h + pl.d * 0.62);
    fly = { tgt, pos };
    if (pl.p) showCard(pl.tag || 'Lugar', pl.name, pl.p, pl.s);
  }
  controls.addEventListener('start', () => { fly = null; controls.autoRotate = false; });

  // clic sobre nidos (proyección en pantalla, tolerante en móvil)
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const r = canvas.getBoundingClientRect();
    const v = new THREE.Vector3();
    let best = -1, bd = mobile ? 34 : 24;
    game.forEach((n, i) => {
      v.set(n.x, n.y + 0.6, n.z).project(camera);
      if (v.z > 1) return;
      const sx = ((v.x + 1) / 2) * r.width, sy = ((1 - v.y) / 2) * r.height;
      const d = Math.hypot(sx - (e.clientX - r.left), sy - (e.clientY - r.top));
      const dist = camera.position.distanceTo(new THREE.Vector3(n.x, n.y, n.z));
      if (d < bd && dist < 900) { bd = d; best = i; }
    });
    if (best >= 0) collect(best);
    else if (found.size === 0 && $('#hint')) $('#hint').textContent = 'Acércate más: los nidos son pequeños. Empieza por lo alto de la torre de la iglesia.';
  });

  // ---- luz del día ----
  let tod = 0, todGoal = 0;
  for (const b of $$('[data-t]')) {
    b.addEventListener('click', () => {
      todGoal = +b.dataset.t;
      for (const o of $$('[data-t]')) o.setAttribute('aria-pressed', String(o === b));
    });
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);

  // ---- jugar: la cámara baja hasta el dron del juego y el juego toma el relevo sin salir de la página ----
  let todStart = 0, fovGoal = null;
  const play = playable && canEmbed() ? createPlay({
    camera, controls, canvas,
    onStart: () => {
      todStart = tod;
      fly = null;
      card.hidden = true;
      requestAnimationFrame(resize);
    },
    onExit: ({ fov }) => { todGoal = todStart; fovGoal = fov; requestAnimationFrame(resize); },
  }) : null;
  // jugar: la cámara baja al momento hasta el juego, sin formularios por medio (la lista de espera sigue en la
  // portada). En el visor de claude.ai no se puede incrustar el juego: el enlace lo abre en otra pestaña.
  for (const b of $$('[data-jugar]')) {
    if (play) {
      b.addEventListener('pointerenter', () => play.warm(), { once: true });
      b.addEventListener('focus', () => play.warm(), { once: true });
    }
    b.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (play) { e.preventDefault(); play.start(); }
    });
  }
  const MORNING = new THREE.Vector3(0.62, 0.62, 0.48).normalize(); // (el juego arranca a las 10:36)

  const clock = new THREE.Clock();
  let t = 0;
  const v3 = new THREE.Vector3();
  function frame(now) {
    requestAnimationFrame(frame);
    if (!(play && play.playing)) governor.frame(now); // (resolución adaptativa: solo cuenta lo que se dibuja)
    tick(Math.min(0.05, clock.getDelta()));
  }
  if (/[?&]debug/.test(location.search)) window.__tp = { tick, camera, controls, play, governor };
  function tick(dt) {
    t += dt;
    let mix = null;
    if (play && play.active) {
      if (play.playing) return; // el juego ya está a la vista: la web deja de dibujar
      mix = play.update(dt);
    } else {
      if (fly) {
        controls.target.lerp(fly.tgt, 0.06);
        camera.position.lerp(fly.pos, 0.06);
        if (camera.position.distanceTo(fly.pos) < 1) fly = null;
      }
      if (fovGoal !== null) {
        camera.fov = lerp(camera.fov, fovGoal, 0.06);
        if (Math.abs(camera.fov - fovGoal) < 0.05) { camera.fov = fovGoal; fovGoal = null; }
        camera.updateProjectionMatrix();
      }
      controls.update();
    }
    tod = mix !== null ? lerp(todStart, -0.9, mix) : lerp(tod, todGoal, 0.04);
    applyTimeOfDay(ctx, tod);
    const night = Math.max(0, tod);
    T.lampMat.opacity = Math.min(1, Math.max(0, (night - 0.25) / 0.4));
    const sunY = tod < 0 ? lerp(0.2, 0.75, -tod) : 0.2 - 0.14 * night;
    const sunDir = new THREE.Vector3(-0.82, sunY, 0.22).normalize();
    if (mix !== null) sunDir.lerp(MORNING, mix).normalize();
    sky.uniforms.uSunDir.value.copy(sunDir);
    lights.sun.target.position.copy(mix !== null ? v3.set(110, 0, -200) : controls.target).setY(0);
    lights.sun.position.copy(lights.sun.target.position).addScaledVector(sunDir, 2000);
    const d = camera.position.distanceTo(controls.target);
    scene.fog.color.copy(sky.uniforms.uHorizon.value);
    scene.fog.near = mix !== null ? lerp(d * 1.4 + 200, 3000, mix) : d * 1.4 + 200;
    scene.fog.far = mix !== null ? lerp(d * 7 + 1500, 14000, mix) : d * 7 + 1500;
    ground.uniforms.uCam.value = d;
    sky.mesh.position.copy(camera.position);
    sky.mesh.scale.setScalar(camera.far * 0.5);
    sky.uniforms.uTime.value = t;
    storks.userData.update(t);
    glows.forEach((g, i) => {
      const s = g.userData.on ? 18 + Math.sin(t * 3 + i) * 3 : 0.001;
      g.scale.setScalar(lerp(g.scale.x, s, 0.1));
    });
    renderer.render(scene, camera);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const L of labels) {
      v3.set(L.pl.x, L.pl.h + 6, -L.pl.y).project(camera);
      const show = v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05 && d < 1500;
      L.vis = lerp(L.vis, show ? 1 : 0, 0.15);
      L.el.style.opacity = L.vis.toFixed(3);
      L.el.style.pointerEvents = L.vis > 0.5 ? 'auto' : 'none';
      L.el.style.transform = `translate3d(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * h}px, 0)`;
    }
  }
  // los sombreadores se compilan en paralelo antes del primer fotograma (sin el parón de la primera imagen)
  await nextTask();
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera).catch(() => {});
  // la primera imagen (guarena.html: el último fotograma de la portada, o su cartel) se funde con la maqueta en el
  // mismo encuadre. Con ?jugar se ha seguido acercando: la cámara se pone como ella se ve ahora (en el mismo sitio,
  // con el objetivo cerrado s veces) y la bajada al juego arranca desde ahí mismo, sin parón ni salto
  const ld = $('#loading'), rimg = $('#relevo');
  if (jugar && play && rimg) {
    const m = getComputedStyle(rimg).transform;
    const s = m && m !== 'none' ? parseFloat(m.slice(m.indexOf('(') + 1)) || 1 : 1;
    rimg.style.transition = 'none';
    rimg.style.transform = `scale(${s})`;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / s));
    camera.updateProjectionMatrix();
  }
  requestAnimationFrame(frame);
  ld.style.opacity = 0;
  setTimeout(() => ld.remove(), 900);

  // (si la portada lanzó esta página por adelantado durante su descenso, lo que sigue espera a la llegada)
  whenShown(() => {
    // ?jugar (desde la portada o desde cualquier otro pueblo): la cámara sigue bajando sola hasta el juego, al
    // momento (la imagen venía acercándose: un parón aquí se notaría)
    if (jugar) {
      try { history.replaceState(history.state, '', location.pathname + location.hash); } catch { /* ignore */ }
      if (play) { play.warm(); play.start(); }
      else document.body.classList.remove('jugando'); // (sin juego incrustable aquí: que se vean los paneles)
    }

    // ---- sello del pasaporte ----
    stamp(ine).then((r) => {
      const el = $('#pass');
      if (!r) { if (el) el.innerHTML = '<span>Pasaporte</span><span>Disponible al abrir la beta</span>'; return; }
      if (el) el.innerHTML = `<span>Tu pasaporte</span><span><b>${r.count}</b>/388 sellos</span>`;
      if (r.isNew) setTimeout(() => say(`Sello de ${name} añadido · ${r.count}/388`), 1400);
    });
  });

  return { T, collect };
}
