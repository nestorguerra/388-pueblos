// Escena de la landing: de la plaza de Guareña a los 388 pueblos de Extremadura.
import {
  THREE, buildTownAsync, buildGroundAsync, nextTask, buildTrees, buildStorks, buildSky, buildLights, buildMap,
  applyTimeOfDay, makeRenderer, Rig, interpState, LANDMARKS, GUARENA_CHURCHES,
} from './world.js';
import { getJSON } from './red.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Guion de cámara del prólogo (p = 0..1). Distancias en metros, ángulos en radianes.
const INTRO = [
  { at: 0.0, x: -90, y: 60, dist: 780, tilt: 1.27, az: 0.3, night: 0.0 },
  { at: 0.18, x: -130, y: 90, dist: 250, tilt: 1.1, az: 0.62, night: 0.04 },
  { at: 0.36, x: -20, y: 40, dist: 3400, tilt: 0.84, az: 0.42, night: 0.2 },
  { at: 0.58, x: 2000, y: 5000, dist: 48000, tilt: 0.64, az: 0.22, night: 0.6 },
  { at: 0.82, x: 0, y: 0, dist: 430000, tilt: 0.5, az: 0.06, night: 1.0 },
  { at: 1.0, x: 0, y: 0, dist: 410000, tilt: 0.54, az: 0.0, night: 1.0 },
];

export async function createLandingWorld({ canvas, labelLayer, base = '.', onProgress = () => {}, onHover = () => {}, onPick = () => {} }) {
  const fetchJSON = async (u, w) => {
    const j = await getJSON(`${base}/${u}`);
    onProgress(w);
    return j;
  };
  const [town, muni, ctxd] = await Promise.all([
    fetchJSON('data/guarena.json', 0.5),
    fetchJSON('data/municipios.json', 0.3),
    fetchJSON('data/contexto.json', 0.1),
  ]);

  const { renderer, mobile, governor } = makeRenderer(canvas);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf3b98a, 1000, 8000);
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 10000);
  const rig = new Rig(camera);

  const sky = buildSky();
  scene.add(sky.mesh);
  const lights = buildLights(scene);
  // (la construcción se reparte en trozos: la portada no se congela mientras se levanta Guareña)
  await nextTask();
  const ground = await buildGroundAsync(town);
  scene.add(ground.mesh);
  await nextTask();
  const T = await buildTownAsync(town, { churches: GUARENA_CHURCHES });
  scene.add(T.group);
  await nextTask();
  const trees = buildTrees(town, { count: mobile ? 2600 : 6000, isUrban: ground.isUrban });
  scene.add(trees);
  const tower = T.special.tower || { x: -140, y: 36, z: -100 };
  const storks = buildStorks({ x: tower.x, z: tower.z }, 7);
  scene.add(storks);
  await nextTask();
  const map = buildMap(muni.m, ctxd);
  scene.add(map.group);
  await nextTask();
  onProgress(0.1);

  const ctx = { sky, lights, renderer };
  const wide = () => canvas.clientWidth / Math.max(1, canvas.clientHeight) > 1.2;
  const fitIntro = () => {
    for (const K of INTRO.slice(-2)) { K.x = map.center.x - (wide() ? 120000 : 0); K.y = map.center.y - 22000; }
  };
  fitIntro();
  addEventListener('resize', fitIntro);

  // ---- etiquetas HTML ancladas al mundo ----
  const labels = [];
  const addLabel = (text, x, y, opts = {}) => {
    const el = document.createElement('div');
    el.className = `wlabel ${opts.cls || ''}`;
    el.innerHTML = text;
    labelLayer.appendChild(el);
    const L = { el, x, y, h: opts.h ?? 0, muni: opts.muni ?? -1, range: opts.range || [0, Infinity], mode: opts.mode || 'intro', vis: 0 };
    labels.push(L);
    return L;
  };
  addLabel('<b>Iglesia de Santa María</b><span>torre · nidos de cigüeña</span>', tower.x, -tower.z, { h: 40, range: [120, 620] });
  addLabel('<b>Plaza de España</b><span>Ayuntamiento</span>', LANDMARKS.plaza.x, LANDMARKS.plaza.y, { h: 14, range: [120, 620] });
  addLabel('<b>San Gregorio</b>', LANDMARKS.sangregorio.x, LANDMARKS.sangregorio.y, { h: 22, range: [1200, 5200] });
  addLabel('<b>Casa de Luis Chamizo</b><span>poeta de <i>El miajón de los castúos</i></span>', LANDMARKS.chamizo.x, LANDMARKS.chamizo.y, { h: 10, range: [1200, 5200] });
  const byName = (n) => muni.m.findIndex((m) => m.n === n);
  const Q = map.Q;
  const muniLabel = (n, cls, range, mode = 'intro') => {
    const i = byName(n);
    if (i < 0) return;
    const m = muni.m[i];
    addLabel(`<b>${m.n}</b>`, m.c[0] * Q, m.c[1] * Q, { muni: i, cls, range, mode });
  };
  muniLabel('Guareña', 'home', [9000, 2e6], 'both');
  for (const n of ['Don Benito', 'Villanueva de la Serena', 'Mérida', 'Almendralejo', 'Oliva de Mérida', 'Valdetorres', 'Cristina', 'Manchita']) muniLabel(n, 'minor', [12000, 120000]);
  for (const n of ['Badajoz', 'Cáceres', 'Plasencia', 'Mérida', 'Trujillo', 'Zafra', 'Navalmoral de la Mata', 'Coria', 'Jerez de los Caballeros', 'Llerena', 'Guadalupe']) muniLabel(n, 'city', [150000, 2e6], 'both');
  // provincias
  const provC = (pr) => {
    let x = 0, y = 0, n = 0;
    for (const m of muni.m) if (m.pr === pr) { x += m.c[0]; y += m.c[1]; n++; }
    return [(x / n) * Q, (y / n) * Q];
  };
  const [cx1, cy1] = provC('CC');
  const [cx2, cy2] = provC('BA');
  addLabel('CÁCERES<span>223 municipios</span>', cx1 + 20000, cy1 + 30000, { cls: 'prov', range: [200000, 2e6], mode: 'both' });
  addLabel('BADAJOZ<span>165 municipios</span>', cx2 - 25000, cy2 - 32000, { cls: 'prov', range: [200000, 2e6], mode: 'both' });
  addLabel('PORTUGAL', map.center.x - map.center.w * 0.62, map.center.y, { cls: 'country', range: [200000, 2e6], mode: 'both' });

  // ---- estado ----
  const state = {
    mode: 'intro', // 'intro' | 'map'
    intro: 0,
    visible: true,
    hover: -1,
    sel: -1,
    pointer: { x: 0, y: 0, nx: 0, ny: 0, inside: false },
    mapGrow: 0,
    mapView: { x: map.center.x, y: map.center.y - 26000, dist: 440000, tilt: 0.55, az: 0.0 },
    camTarget: null,
    dataMode: 'pop',
  };
  const modeVec = { pop: [1, 0, 0, 0], loss: [0, 1, 0, 0], alt: [0, 0, 1, 0], votes: [0, 0, 0, 1] };
  const modeCur = new THREE.Vector4(1, 0, 0, 0);
  const modeGoal = new THREE.Vector4(1, 0, 0, 0);
  let cur = { ...INTRO[0] };
  let flight = null;
  let dive = null; // descenso de cámara hacia un pueblo antes de abrir su juego

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    map.pmat.uniforms.uPx.value = renderer.getPixelRatio() * Math.min(1.25, Math.max(0.7, h / 900));
  }
  resize();
  addEventListener('resize', resize);
  governor.onChange = resize; // (el grosor de los puntos del mapa depende de la resolución)

  const UI_SEL = '.box, .sheet, .nav, .tip, .hud, a, button, input, label, .step';
  addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    state.pointer.x = e.clientX - r.left;
    state.pointer.y = e.clientY - r.top;
    state.pointer.nx = (state.pointer.x / r.width) * 2 - 1;
    state.pointer.ny = -(state.pointer.y / r.height) * 2 + 1;
    state.pointer.inside = true;
    state.pointer.overUI = !!(e.target.closest && e.target.closest(UI_SEL));
  }, { passive: true });
  document.addEventListener('pointerleave', () => { state.pointer.inside = false; if (state.hover >= 0) { state.hover = -1; onHover(-1); } });
  addEventListener('click', (e) => {
    if (state.mode !== 'map' || !state.visible) return;
    if (e.target.closest && e.target.closest(UI_SEL)) return;
    if (state.hover >= 0) onPick(state.hover);
  });

  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  function pickAt(nx, ny) {
    ray.setFromCamera({ x: nx, y: ny }, camera);
    plane.constant = 0;
    if (!ray.ray.intersectPlane(plane, hit)) return -1;
    let i = map.pick(hit.x, -hit.z);
    if (i >= 0) {
      plane.constant = -map.heightOf(i);
      if (ray.ray.intersectPlane(plane, hit)) {
        const j = map.pick(hit.x, -hit.z);
        if (j >= 0) i = j;
      }
    }
    return i;
  }

  const v3 = new THREE.Vector3();
  function updateLabels(dist) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const L of labels) {
      const okMode = L.mode === 'both' || L.mode === state.mode;
      let show = okMode && dist >= L.range[0] && dist <= L.range[1];
      let y = L.h;
      if (L.muni >= 0) y = map.heightOf(L.muni) + 900 * map.uniforms.uGrow.value + 60;
      v3.set(L.x, y, -L.y).project(camera);
      if (v3.z > 1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1) show = false;
      L.vis = lerp(L.vis, show ? 1 : 0, 0.15);
      if (L.vis < 0.01) {
        if (L.el.style.opacity !== '0') L.el.style.opacity = '0';
        continue;
      }
      L.el.style.opacity = L.vis.toFixed(3);
      L.el.style.transform = `translate3d(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * h}px, 0)`;
    }
  }

  const clock = new THREE.Clock();
  let t = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!state.visible) return;
    governor.frame(now);
    tick(Math.min(0.05, clock.getDelta()));
  }
  function tick(dt) {
    t += dt;

    // objetivo de cámara
    let goal;
    if (state.mode === 'intro') {
      goal = interpState(INTRO, state.intro);
      goal.az += t * 0.012 * (1 - clamp01(state.intro * 3)); // giro lento en la portada
    } else {
      goal = { ...state.mapView, night: 1 };
      if (wide()) goal.x -= 75000; // deja sitio al panel de la izquierda
      if (flight) goal = { ...flight, night: 1 };
    }
    // parallax del puntero (desactivado durante el descenso)
    const px = state.pointer.inside && !dive ? state.pointer.nx : 0;
    const py = state.pointer.inside && !dive ? state.pointer.ny : 0;
    rig.off.az = lerp(rig.off.az, px * 0.05, 0.05);
    rig.off.tilt = lerp(rig.off.tilt, -py * 0.025, 0.05);
    if (dive) {
      // descenso continuo: primero se centra sobre el pueblo y la distancia cae en escala logarítmica
      dive.t += dt;
      const p = clamp01(dive.t / dive.dur);
      const pp = 1 - Math.pow(1 - p, 3);
      const pd = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const s = dive.s, e = dive.e;
      cur.x = lerp(s.x, e.x, pp);
      cur.y = lerp(s.y, e.y, pp);
      cur.dist = Math.exp(lerp(Math.log(s.dist), Math.log(e.dist), pd));
      cur.tilt = lerp(s.tilt, e.tilt, pd);
      cur.az = lerp(s.az, e.az, pd);
      cur.night = lerp(s.night ?? 1, e.night, pd);
      camera.fov = lerp(32, e.fov || 32, clamp01((p - 0.6) / 0.4));
      if (p >= 1 && !dive.done) { dive.done = true; dive.onDone?.(); }
    } else {
      const k = state.mode === 'intro' ? 0.12 : 0.06;
      cur.x = lerp(cur.x, goal.x, k);
      cur.y = lerp(cur.y, goal.y, k);
      cur.dist = Math.exp(lerp(Math.log(cur.dist), Math.log(goal.dist), k));
      cur.tilt = lerp(cur.tilt, goal.tilt, k);
      cur.az = lerp(cur.az, goal.az, k);
      cur.night = lerp(cur.night ?? 0, goal.night ?? 0, k);
    }
    Object.assign(rig.s, cur);
    rig.apply();

    const d = cur.dist;
    // capas según escala
    const mapIn = clamp01((Math.log(d) - Math.log(9000)) / (Math.log(30000) - Math.log(9000)));
    const grow = clamp01((Math.log(d) - Math.log(60000)) / (Math.log(260000) - Math.log(60000)));
    map.uniforms.uOpacity.value = mapIn;
    map.uniforms.uGrow.value = lerp(map.uniforms.uGrow.value, grow, 0.2);
    map.cmat.opacity = 0.25 * grow;
    ground.uniforms.uFade.value = 1 - clamp01((Math.log(d) - Math.log(14000)) / (Math.log(60000) - Math.log(14000)));
    ground.uniforms.uCam.value = d;
    ground.mesh.visible = ground.uniforms.uFade.value > 0.01;
    T.group.visible = trees.visible = d < 60000;
    if (dive?.e.noGround) ground.mesh.visible = T.group.visible = trees.visible = false;
    storks.visible = d < 6000;
    map.uniforms.uNight.value = cur.night;
    applyTimeOfDay(ctx, cur.night);
    T.lampMat.opacity = clamp01((cur.night - 0.25) / 0.4) * (d < 9000 ? 1 : 0);

    // sol y sombras siguen al objetivo
    const sunDir = new THREE.Vector3(-0.82, 0.2 - 0.14 * cur.night, 0.22).normalize();
    sky.uniforms.uSunDir.value.copy(sunDir);
    lights.sun.target.position.set(cur.x, 0, -cur.y);
    lights.sun.position.copy(lights.sun.target.position).addScaledVector(sunDir, 2000);
    lights.sun.castShadow = d < 4000;
    scene.fog.color.copy(sky.uniforms.uHorizon.value);
    scene.fog.near = d * 1.1;
    scene.fog.far = d < 20000 ? d * 5.5 : 1e9;
    sky.mesh.position.copy(camera.position);
    sky.mesh.scale.setScalar(camera.far * 0.5);
    sky.uniforms.uTime.value = t;
    map.uniforms.uTime.value = t;

    // transición de modo de datos
    const mv = modeVec[state.dataMode];
    modeGoal.set(...mv);
    modeCur.lerp(modeGoal, 0.08);
    map.uniforms.uMode.value.copy(modeCur);

    if (storks.visible) storks.userData.update(t);

    // hover
    if (state.mode === 'map' && state.pointer.inside && !dive) {
      const i = state.pointer.overUI ? -1 : pickAt(state.pointer.nx, state.pointer.ny);
      if (i !== state.hover) {
        state.hover = i;
        onHover(i, state.pointer);
      } else if (i >= 0) onHover(i, state.pointer, true);
    }
    map.uniforms.uHover.value = state.mode === 'map' && !dive ? state.hover : -1;
    map.uniforms.uSel.value = state.sel;
    document.body.style.cursor = state.mode === 'map' && state.hover >= 0 ? 'pointer' : '';

    renderer.render(scene, camera);
    updateLabels(d);
  }
  // los sombreadores se compilan en paralelo antes del primer fotograma
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera).catch(() => {});
  requestAnimationFrame(frame);

  return {
    munis: muni.m,
    townCount: T.count,
    setIntro(p) { state.intro = clamp01(p); },
    setMode(m) {
      if (state.mode === m) return;
      state.mode = m;
      flight = null;
      if (m !== 'map') state.hover = -1;
    },
    setVisible(v) { state.visible = v; if (v) clock.getDelta(); },
    setDataMode(m) { state.dataMode = m; },
    setFilter(fn) { map.setDim(fn); },
    setVotes(counts) { map.setVotes(counts); },
    select(i) { state.sel = i; },
    flyTo(i) {
      if (i < 0) { flight = null; return; }
      const m = muni.m[i];
      flight = { x: m.c[0] * Q, y: m.c[1] * Q - 9000, dist: 120000, tilt: 0.78, az: 0.12 };
    },
    overview() { flight = null; },
    // Descenso de cámara hasta un pueblo. Guareña termina en el mismo encuadre con el que arranca su juego
    // (guarena.html: objetivo en la mitad de la torre, distancia ~946 m, fov 38, hora dorada).
    dive(i, onDone) {
      const m = muni.m[i];
      if (!m) return false;
      let e, dur;
      if (m.id === '06060') {
        e = { x: tower.x * 0.5, y: -tower.z * 0.5, dist: 946, tilt: 0.94, az: 0.5586, night: 0, fov: 38 };
        dur = cur.dist > 30000 ? 6.2 : 2.4;
      } else {
        // el suelo detallado solo existe alrededor de Guareña: el resto termina sobre su término en el mapa
        e = { x: m.c[0] * Q, y: m.c[1] * Q - 6000, dist: 38000, tilt: 0.8, az: 0.18, night: 0.75, fov: 34, noGround: true };
        dur = 3.8;
      }
      flight = null;
      state.hover = -1;
      state.sel = i;
      dive = { s: { ...cur }, e, t: 0, dur, onDone, done: false };
      return true;
    },
    cancelDive() {
      dive = null;
      camera.fov = 32;
      camera.updateProjectionMatrix();
    },
    get diving() { return !!dive; },
    get hover() { return state.hover; },
    _step: (n = 60) => { for (let i = 0; i < n; i++) tick(1 / 60); },
    _governor: governor,
    _dbg: () => ({ cur: { ...cur }, cam: camera.position.toArray(), near: camera.near, far: camera.far, fade: ground.uniforms.uFade.value, op: map.uniforms.uOpacity.value }),
  };
}
