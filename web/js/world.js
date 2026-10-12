// 388 Pueblos — motor 3D compartido.
// Sistema de coordenadas: metros, origen en la Plaza de España de Guareña (UTM 29N).
// three.js: X = este, Y = altura, Z = -norte.
import * as THREE from 'three';
import { lang } from './i18n.js';

export const LANDMARKS = {
  plaza: { x: 0, y: 0, name: 'Plaza de España' },
  santamaria: { x: -133.5, y: 99.5, name: 'Iglesia de Santa María' },
  sangregorio: { x: 254.2, y: 26.5, name: 'Iglesia de San Gregorio' },
  ayto: { x: 5.2, y: 35.0, name: 'Ayuntamiento' },
  chamizo: { x: 568.4, y: -133.9, name: 'Casa de Luis Chamizo' },
};

// ---------- utilidades ----------
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (t) => t * t * (3 - 2 * t);
const col = (hex) => new THREE.Color(hex);

// Paleta del mundo (luz de Extremadura)
export const PAL = {
  cal: col('#f3f1ea'),
  calShade: col('#e4dfd3'),
  teja: col('#a95b3f'),
  tejaDark: col('#86452f'),
  tejaLight: col('#bb7a5b'),
  azotea: col('#d8d2c6'),
  granito: col('#c9b89a'),
  anil: col('#3d56a6'),
  almagre: col('#9b4a32'),
  ocre: col('#c99a4a'),
  piedra: col('#9c968c'),
  calle: col('#b9ad9c'),
  olivo: col('#6f7a4c'),
  encina: col('#4c5733'),
  sodio: col('#ffb25b'),
  oro: col('#f0b84f'),
};

// Constructor de geometría no indexada con normales planas explícitas
class GeoBuilder {
  constructor() {
    this.p = [];
    this.n = [];
    this.c = [];
  }
  tri(a, b, c, color, hint) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) {
      [b, c] = [c, b];
      nx = -nx; ny = -ny; nz = -nz;
    }
    for (const v of [a, b, c]) {
      this.p.push(v[0], v[1], v[2]);
      this.n.push(nx, ny, nz);
      this.c.push(color.r, color.g, color.b);
    }
  }
  quad(a, b, c, d, color, hint) {
    this.tri(a, b, c, color, hint);
    this.tri(a, c, d, color, hint);
  }
}

function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

// ---------- pueblo (Catastro) ----------
// Iglesias de Guareña (coordenadas locales de guarena.json, centrado en la Plaza de España)
export const GUARENA_CHURCHES = [
  { x: -126.1, y: 97.0, main: true, name: 'Iglesia de Santa María' },
  { x: 266.8, y: 28.1, main: false, name: 'Iglesia de San Gregorio' },
];

function pointIn(x, y, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// Ceder el hilo principal entre trozos de trabajo pesado (construir un pueblo son ~8.000 piezas): así la página
// sigue respondiendo y el indicador de carga se mueve mientras tanto.
export const nextTask = () => (globalThis.scheduler?.yield ? globalThis.scheduler.yield()
  : new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); }));

const runSync = (it) => { for (;;) { const r = it.next(); if (r.done) return r.value; } };
// un generador de trabajo, repartido en trozos de unos pocos milisegundos
async function runAsync(it, budget = 8) {
  let t = performance.now();
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    if (performance.now() - t > budget) { await nextTask(); t = performance.now(); }
  }
}
export const buildTown = (data, opts) => runSync(townSteps(data, opts));
export const buildTownAsync = (data, opts) => runAsync(townSteps(data, opts));
export const buildGround = (townData, opts) => runSync(groundSteps(townData, opts));
export const buildGroundAsync = (townData, opts) => runAsync(groundSteps(townData, opts));

function* townSteps(data, { seed = 388, churches = data.churches || [] } = {}) {
  const R = rng(seed);
  const unit = data.unit;
  const geo = new GeoBuilder();
  const up = [0, 1, 0];
  const nests = []; // posiciones de nidos de cigüeña
  const lamps = [];
  const special = {};
  const towers = [];
  const roofCand = [];

  const wallBlock = (pts, h0, h1, color, zocalo) => {
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      const out = [y2 - y1, 0, x2 - x1]; // normal exterior (CCW en xy -> XZ con Z=-y)
      const zc = zocalo && h1 - h0 > 2.5;
      const hz = h0 + 0.95;
      if (zc) {
        geo.quad([x1, h0, -y1], [x2, h0, -y2], [x2, hz, -y2], [x1, hz, -y1], zocalo, out);
        geo.quad([x1, hz, -y1], [x2, hz, -y2], [x2, h1, -y2], [x1, h1, -y1], color, out);
      } else {
        geo.quad([x1, h0, -y1], [x2, h0, -y2], [x2, h1, -y2], [x1, h1, -y1], color, out);
      }
    }
  };
  const flatCap = (pts, h, color) => {
    const contour = pts.map(([x, y]) => new THREE.Vector2(x, y));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [a, b, c] of tris) {
      geo.tri([pts[a][0], h, -pts[a][1]], [pts[b][0], h, -pts[b][1]], [pts[c][0], h, -pts[c][1]], color, up);
    }
  };
  const isRect = (pts) => {
    if (pts.length !== 4) return false;
    for (let i = 0; i < 4; i++) {
      const a = pts[(i + 3) % 4], b = pts[i], c = pts[(i + 1) % 4];
      const ux = a[0] - b[0], uy = a[1] - b[1], vx = c[0] - b[0], vy = c[1] - b[1];
      const cos = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1);
      if (Math.abs(cos) > 0.26) return false;
    }
    return true;
  };
  const gable = (pts, h, wallColor, roofColor) => {
    let [p0, p1, p2, p3] = pts;
    const e0 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const e1 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    if (e1 > e0) [p0, p1, p2, p3] = [p1, p2, p3, p0];
    const short = Math.min(e0, e1);
    const rh = Math.min(3.2, 0.36 * short);
    const r0 = [(p0[0] + p3[0]) / 2, (p0[1] + p3[1]) / 2];
    const r1 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
    const V = (p, y) => [p[0], y, -p[1]];
    geo.quad(V(p0, h), V(p1, h), V(r1, h + rh), V(r0, h + rh), roofColor, up);
    geo.quad(V(p2, h), V(p3, h), V(r0, h + rh), V(r1, h + rh), roofColor, up);
    geo.tri(V(p1, h), V(p2, h), V(r1, h + rh), wallColor, [p2[1] - p1[1], 0, p2[0] - p1[0]]);
    geo.tri(V(p3, h), V(p0, h), V(r0, h + rh), wallColor, [p0[1] - p3[1], 0, p0[0] - p3[0]]);
  };

  const zocalos = [PAL.piedra, PAL.ocre, PAL.anil, PAL.almagre];
  // pre-proceso: polígonos, áreas y centroides
  const P = data.parts.map(([floors, useCode, flat]) => {
    const pts = [];
    for (let i = 0; i < flat.length; i += 2) pts.push([flat[i] * unit, flat[i + 1] * unit]);
    if (polyArea(pts) < 0) pts.reverse();
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p[0]; cy += p[1]; }
    return { floors, use: data.uses[useCode] || '', pts, cx: cx / pts.length, cy: cy / pts.length, area: Math.abs(polyArea(pts)) };
  });
  // cada iglesia se asigna a la pieza que la contiene (o la de servicios públicos más cercana)
  const churchOf = new Map();
  for (const ch of churches) {
    let pick = -1, best = -1;
    P.forEach((q, i) => {
      if (Math.abs(q.cx - ch.x) > 90 || Math.abs(q.cy - ch.y) > 90 || churchOf.has(i)) return;
      const inside = pointIn(ch.x, ch.y, q.pts);
      const d = Math.hypot(q.cx - ch.x, q.cy - ch.y);
      const pub = q.use.includes('publicServices');
      let score = -1;
      if (inside && pub) score = 3000 + q.area;
      else if (pub && d < 35 && q.area > 80) score = 2000 - d;
      else if (inside && q.area > 150) score = 1000 + q.area;
      else if (d < 20 && q.area > 150) score = 500 - d;
      if (score > best) { best = score; pick = i; }
    });
    if (pick >= 0) churchOf.set(pick, ch);
  }
  const westEnd = (pts, inset) => {
    let far = [0, 1], dmax = 0;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d > dmax) { dmax = d; far = [i, j]; }
    }
    const A = pts[far[0]], B = pts[far[1]];
    const W = A[0] < B[0] ? A : B, E = A[0] < B[0] ? B : A;
    const ax = (E[0] - W[0]) / (dmax || 1), ay = (E[1] - W[1]) / (dmax || 1);
    return { x: W[0] + ax * inset, y: W[1] + ay * inset, ax, ay, len: dmax };
  };
  let count = 0;
  yield;
  for (let idx = 0; idx < P.length; idx++) {
    if ((idx & 127) === 127) yield;
    const { floors, use, pts, cx, cy, area } = P[idx];
    count++;
    const ch = churchOf.get(idx);
    if (ch && ch.main) {
      // iglesia principal: nave alta en granito y torre-campanario con nidos
      const nave = 12 + Math.min(4, area / 450);
      wallBlock(pts, 0, nave, PAL.granito, null);
      flatCap(pts, nave, PAL.tejaDark);
      const s = Math.max(3, Math.min(4.6, Math.sqrt(area) / 9));
      const w = westEnd(pts, s + 3);
      const h = 24 + 8 * Math.min(1, Math.max(0, (area - 300) / 1200));
      towers.push({ x: w.x, y: w.y, s, h, name: ch.name });
      continue;
    }
    if (ch) {
      // iglesia secundaria o ermita: cal, zócalo de granito y espadaña
      wallBlock(pts, 0, 10, PAL.cal, PAL.granito);
      flatCap(pts, 10, PAL.teja);
      const w = westEnd(pts, 2.5);
      towers.push({ x: w.x, y: w.y, s: 2.4, h: 17, espadana: true, name: ch.name });
      continue;
    }
    const industrial = use.includes('industrial') || use.includes('agriculture');
    const h = floors * 3.05 + 0.5 + R() * 0.5 + (industrial ? 1.6 : 0);
    const shade = 0.94 + R() * 0.06;
    const wall = industrial ? PAL.azotea.clone().multiplyScalar(shade) : PAL.cal.clone().multiplyScalar(shade);
    const zr = R();
    const zoc = industrial ? null : zr < 0.32 ? zocalos[0] : zr < 0.5 ? zocalos[1] : zr < 0.62 ? zocalos[2] : zr < 0.7 ? zocalos[3] : null;
    wallBlock(pts, 0, h, wall, zoc);
    const tr = R();
    const roof = (tr < 0.5 ? PAL.teja : tr < 0.8 ? PAL.tejaLight : PAL.tejaDark).clone().multiplyScalar(0.92 + R() * 0.12);
    if (!industrial && isRect(pts) && area < 420) {
      gable(pts, h, wall, roof);
    } else {
      flatCap(pts, h, industrial ? PAL.azotea.clone().multiplyScalar(0.9 + R() * 0.1) : R() < 0.72 ? roof : PAL.azotea);
    }
    // farolas: algunas esquinas de fachada
    if (R() < 0.22) {
      const v = pts[Math.floor(R() * pts.length)];
      lamps.push(v[0] + (R() - 0.5) * 2, 5.2, -(v[1] + (R() - 0.5) * 2));
    }
    // candidatos a nido: edificios altos
    if (floors >= 3 && area > 60) roofCand.push({ x: cx, y: h + 0.3, z: -cy, kind: 'tejado' });
  }

  // torres y campanarios
  for (const t of towers) {
    const s = t.s;
    const sq = [[t.x - s, t.y - s], [t.x + s, t.y - s], [t.x + s, t.y + s], [t.x - s, t.y + s]];
    if (t.espadana) {
      const sq2 = [[t.x - s, t.y - 0.6], [t.x + s, t.y - 0.6], [t.x + s, t.y + 0.6], [t.x - s, t.y + 0.6]];
      wallBlock(sq2, 0, t.h, PAL.cal, PAL.granito);
      flatCap(sq2, t.h, PAL.granito);
      nests.push({ x: t.x, y: t.h + 0.2, z: -t.y, kind: 'espadaña', big: true, name: `Espadaña · ${t.name}` });
    } else {
      wallBlock(sq, 0, t.h - 7, PAL.granito, null);
      // cuerpo de campanas: algo más oscuro
      wallBlock(sq, t.h - 7, t.h - 0.8, PAL.granito.clone().multiplyScalar(0.82), null);
      const sq3 = sq.map(([x, y]) => [x + Math.sign(x - t.x) * 0.35, y + Math.sign(y - t.y) * 0.35]);
      wallBlock(sq3, t.h - 0.8, t.h, PAL.granito, null);
      flatCap(sq3, t.h, PAL.granito.clone().multiplyScalar(0.9));
      // nidos de cigüeña en las esquinas y el centro
      for (const [x, y] of sq) nests.push({ x: lerp(x, t.x, 0.18), y: t.h + 0.2, z: -lerp(y, t.y, 0.18), kind: 'torre' });
      nests.push({ x: t.x, y: t.h + 0.2, z: -t.y, kind: 'torre', big: true, name: `Torre · ${t.name}` });
      special.tower = { x: t.x, y: t.h, z: -t.y, name: t.name };
    }
  }

  // 7 nidos en tejados, repartidos por el pueblo (muestreo del punto más lejano)
  const picked = [];
  const pool = roofCand.filter((c) => Math.hypot(c.x, c.z) < 900 && !nests.some((n) => Math.hypot(n.x - c.x, n.z - c.z) < 25));
  if (pool.length) picked.push(pool[Math.floor(R() * pool.length)]);
  while (picked.length < 7 && picked.length < pool.length) {
    let best = null, bd = -1;
    for (const c of pool) {
      let d = Infinity;
      for (const p of picked) d = Math.min(d, Math.hypot(c.x - p.x, c.z - p.z));
      if (d > bd) { bd = d; best = c; }
    }
    picked.push(best);
  }
  nests.push(...picked);

  // (los tres atributos son ~1,6 millones de números cada uno: se convierten por separado)
  yield;
  const townGeo = new THREE.BufferGeometry();
  townGeo.setAttribute('position', new THREE.Float32BufferAttribute(geo.p, 3));
  yield;
  townGeo.setAttribute('normal', new THREE.Float32BufferAttribute(geo.n, 3));
  yield;
  townGeo.setAttribute('color', new THREE.Float32BufferAttribute(geo.c, 3));
  townGeo.computeBoundingSphere();
  const mesh = new THREE.Mesh(townGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.add(mesh);

  // nidos
  const nestGeo = new THREE.CylinderGeometry(1.25, 0.95, 0.9, 9);
  const nestMat = new THREE.MeshStandardMaterial({ color: '#5b4632', roughness: 1 });
  const nestMesh = new THREE.InstancedMesh(nestGeo, nestMat, nests.length);
  const m4 = new THREE.Matrix4();
  nests.forEach((n, i) => {
    const s = n.big ? 1.25 : 0.95;
    m4.compose(new THREE.Vector3(n.x, n.y + 0.4, n.z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    nestMesh.setMatrixAt(i, m4);
  });
  nestMesh.castShadow = true;
  group.add(nestMesh);

  // farolas (luz de sodio, sólo de noche)
  const lampGeo = new THREE.BufferGeometry();
  lampGeo.setAttribute('position', new THREE.Float32BufferAttribute(lamps, 3));
  const lampMat = new THREE.PointsMaterial({
    color: PAL.sodio, size: 10, sizeAttenuation: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, map: glowTexture(),
  });
  const lampPts = new THREE.Points(lampGeo, lampMat);
  group.add(lampPts);

  return { group, mesh, nests, special, lampMat, count, parts: P };
}

let _glow;
export function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}

// ---------- suelo procedural: parcelas de la Vega y casco urbano ----------
function* groundSteps(townData, { size = 90000 } = {}) {
  // máscara del casco urbano (huellas dilatadas) -> calles
  const N = 1024, EXT = 3200; // 3,2 km
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, N, N);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineJoin = 'round';
  g.lineWidth = (14 / EXT) * N;
  const u = townData.unit;
  let k = 0;
  for (const [, , flat] of townData.parts) {
    if ((++k & 511) === 0) yield;
    g.beginPath();
    for (let i = 0; i < flat.length; i += 2) {
      const x = ((flat[i] * u) / EXT + 0.5) * N;
      const y = (0.5 - (flat[i + 1] * u) / EXT) * N;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    g.fill();
    g.stroke();
  }
  const mask = new THREE.CanvasTexture(cv);
  mask.colorSpace = THREE.NoColorSpace;
  mask.minFilter = THREE.LinearMipmapLinearFilter;
  mask.anisotropy = 4;

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const uniforms = {
    uMask: { value: mask },
    uExt: { value: EXT },
    uCam: { value: 1000 },
    uNight: { value: 0 },
    uFade: { value: 1 },
    uCalle: { value: PAL.calle },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform sampler2D uMask; uniform float uExt; uniform float uCam; uniform float uNight; uniform float uFade; uniform vec3 uCalle;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
vec3 fieldColor(vec2 w){
  float a = 0.38; mat2 r = mat2(cos(a),-sin(a),sin(a),cos(a));
  vec2 q = r*w;
  vec2 cell = vec2(150.0, 95.0);
  vec2 id = floor(q/cell);
  float jitter = h21(id+7.0);
  q.x += jitter*60.0*step(0.5,h21(id.yx));
  id = floor(q/cell);
  vec2 f = fract(q/cell);
  float k = h21(id);
  vec3 c;
  if(k<0.22) c = vec3(0.80,0.67,0.40);        // cereal segado
  else if(k<0.40) c = vec3(0.47,0.50,0.30);   // olivar
  else if(k<0.55) c = vec3(0.36,0.45,0.25);   // regadío
  else if(k<0.66) c = vec3(0.63,0.48,0.33);   // barbecho arado
  else if(k<0.76) c = vec3(0.55,0.58,0.36);   // viñedo
  else if(k<0.86) c = vec3(0.74,0.62,0.42);
  else c = vec3(0.42,0.47,0.30);              // dehesa
  float rows = 0.5+0.5*sin(q.y*(k<0.4?0.9:0.35));
  c *= 0.93 + 0.07*rows;
  float edge = smoothstep(0.0,0.02,f.x)*smoothstep(1.0,0.98,f.x)*smoothstep(0.0,0.03,f.y)*smoothstep(1.0,0.97,f.y);
  c = mix(c*0.82, c, edge);
  return c;
}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
vec2 w = vec2(vWPos.x, -vWPos.z);
float detail = 1.0 - smoothstep(6000.0, 40000.0, uCam);
vec3 base = mix(vec3(0.62,0.55,0.40), fieldColor(w), detail);
vec2 muv = w/uExt + 0.5; muv.y = 1.0 - muv.y;
float m = 0.0;
if(muv.x>0.0 && muv.x<1.0 && muv.y>0.0 && muv.y<1.0) m = texture2D(uMask, muv).r;
base = mix(base, uCalle, smoothstep(0.15,0.6,m));
float r = length(w);
base = mix(base, base*vec3(0.92,0.9,0.85), smoothstep(1500.0, 9000.0, r));
vec4 diffuseColor = vec4( base, opacity*uFade );`);
  };
  mat.transparent = true;
  mat.depthWrite = false;
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = -1;
  const px = g.getImageData(0, 0, N, N).data;
  const isUrban = (x, y) => {
    const i = Math.floor((x / EXT + 0.5) * N), j = Math.floor((0.5 - y / EXT) * N);
    if (i < 0 || j < 0 || i >= N || j >= N) return false;
    return px[(j * N + i) * 4] > 40;
  };
  return { mesh, uniforms, isUrban };
}

// ---------- olivares y encinas ----------
// réplica en JS del hash del shader del suelo, para plantar árboles en sus parcelas
const f32 = Math.fround;
const fract = (x) => f32(x - Math.floor(x));
function h21(px, py) {
  px = fract(f32(px * 123.34));
  py = fract(f32(py * 456.21));
  const d = f32(f32(px * f32(px + 45.32)) + f32(py * f32(py + 45.32)));
  px = f32(px + d);
  py = f32(py + d);
  return fract(f32(px * py));
}
export function parcelKind(wx, wy) {
  const a = 0.38, ca = Math.cos(a), sa = Math.sin(a);
  let qx = ca * wx + sa * wy;
  const qy = -sa * wx + ca * wy;
  let ix = Math.floor(qx / 150), iy = Math.floor(qy / 95);
  const jitter = h21(ix + 7, iy + 7);
  qx += jitter * 60 * (h21(iy, ix) >= 0.5 ? 1 : 0);
  ix = Math.floor(qx / 150);
  iy = Math.floor(qy / 95);
  return h21(ix, iy);
}

export function buildTrees(townData, { seed = 7, count = 5200, inner = 620, outer = 2900, isUrban = () => false } = {}) {
  const R = rng(seed);
  const olive = new THREE.Group();
  const crown = new THREE.IcosahedronGeometry(2.6, 0);
  crown.scale(1, 0.72, 1);
  crown.translate(0, 3.1, 0);
  const trunk = new THREE.CylinderGeometry(0.28, 0.4, 2.2, 5);
  trunk.translate(0, 1.1, 0);
  const crownMat = new THREE.MeshStandardMaterial({ color: PAL.olivo, roughness: 1, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5a4a3a', roughness: 1 });
  const crowns = new THREE.InstancedMesh(crown, crownMat, count);
  const trunks = new THREE.InstancedMesh(trunk, trunkMat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const c = new THREE.Color();
  let i = 0;
  const a = 0.38, ca = Math.cos(a), sa = Math.sin(a);
  let guard = 0;
  while (i < count && guard++ < count * 12) {
    const r = Math.sqrt(lerp(inner * inner, outer * outer, R()));
    const th = R() * Math.PI * 2;
    let x = Math.cos(th) * r, y = Math.sin(th) * r;
    const hk = parcelKind(x, y);
    const dehesa = hk >= 0.86;
    if (!(hk >= 0.22 && hk < 0.4) && !(dehesa && R() < 0.35)) continue;
    if (!dehesa) {
      // marco de plantación 8 x 8 m alineado con la parcela
      const qx = Math.round((ca * x + sa * y) / 8) * 8, qy = Math.round((-sa * x + ca * y) / 8) * 8;
      x = ca * qx - sa * qy;
      y = sa * qx + ca * qy;
    }
    if (isUrban(x, y)) continue;
    const sc = dehesa ? 1.5 + R() * 0.8 : 0.75 + R() * 0.35;
    p.set(x, 0, -y);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28);
    s.set(sc, sc * (0.9 + R() * 0.2), sc);
    m.compose(p, q, s);
    crowns.setMatrixAt(i, m);
    trunks.setMatrixAt(i, m);
    c.copy(dehesa ? PAL.encina : PAL.olivo).multiplyScalar(0.85 + R() * 0.25);
    crowns.setColorAt(i, c);
    i++;
  }
  crowns.count = trunks.count = i;
  crowns.castShadow = true;
  trunks.castShadow = false;
  olive.add(crowns, trunks);
  return olive;
}

// ---------- cigüeñas ----------
export function buildStorks(center, n = 6, seed = 11) {
  const R = rng(seed);
  const group = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.8 });
  const black = new THREE.MeshStandardMaterial({ color: '#16130f', roughness: 0.9 });
  const red = new THREE.MeshStandardMaterial({ color: '#d2502d', roughness: 0.6 });
  const birds = [];
  for (let i = 0; i < n; i++) {
    const b = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), white);
    body.scale.set(1, 0.8, 2.1);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 1.1, 5), white);
    neck.rotation.x = Math.PI / 2.4;
    neck.position.set(0, 0.25, 1.4);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.9, 5), red);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.5, 2.25);
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 4), red);
    legs.rotation.x = Math.PI / 2;
    legs.position.set(0, -0.15, -1.9);
    const wingGeo = new THREE.BoxGeometry(3.2, 0.06, 1.1);
    wingGeo.translate(1.6, 0, 0);
    const tipGeo = new THREE.BoxGeometry(1.0, 0.07, 1.12);
    tipGeo.translate(2.7, 0, 0);
    const wl = new THREE.Group(), wr = new THREE.Group();
    wl.add(new THREE.Mesh(wingGeo, white), new THREE.Mesh(tipGeo, black));
    wr.add(new THREE.Mesh(wingGeo, white), new THREE.Mesh(tipGeo, black));
    wr.scale.x = -1;
    wl.position.set(0.3, 0.1, 0.1);
    wr.position.set(-0.3, 0.1, 0.1);
    b.add(body, neck, beak, legs, wl, wr);
    b.userData = {
      wl, wr,
      r: 28 + R() * 55, h: 42 + R() * 38, sp: (0.10 + R() * 0.08) * (R() < 0.5 ? 1 : -1),
      ph: R() * 6.28, flap: 0.8 + R() * 0.6, bob: R() * 6.28,
    };
    b.scale.setScalar(1.6);
    birds.push(b);
    group.add(b);
  }
  group.userData.update = (t) => {
    for (const b of birds) {
      const u = b.userData;
      const a = u.ph + t * u.sp;
      const x = center.x + Math.cos(a) * u.r;
      const z = center.z + Math.sin(a) * u.r;
      const y = u.h + Math.sin(t * 0.4 + u.bob) * 4;
      b.position.set(x, y, z);
      const dir = u.sp > 0 ? 1 : -1;
      b.rotation.set(0, -a - (dir > 0 ? 0 : Math.PI), dir * 0.28);
      // planeo con aleteos ocasionales
      const flap = Math.max(0, Math.sin(t * 0.35 + u.bob)) ** 3;
      const w = Math.sin(t * 6 * u.flap) * 0.45 * flap + 0.08;
      u.wl.rotation.z = w;
      u.wr.rotation.z = w;
    }
  };
  return group;
}

// ---------- cielo ----------
export function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTop: { value: col('#5d7fb8') },
      uHorizon: { value: col('#f2c38e') },
      uSunDir: { value: new THREE.Vector3(0.5, 0.15, 0.3).normalize() },
      uSun: { value: col('#ffd9a0') },
      uNight: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
varying vec3 vDir; uniform vec3 uTop, uHorizon, uSun, uSunDir; uniform float uNight, uTime;
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
void main(){
  float y = clamp(vDir.y, -0.2, 1.0);
  vec3 c = mix(uHorizon, uTop, pow(smoothstep(-0.05, 0.75, y), 0.75));
  float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
  c += uSun * (pow(s, 600.0)*1.6 + pow(s, 12.0)*0.22) * (1.0-uNight);
  // estrellas (cielo Starlight)
  vec3 d = normalize(vDir)*420.0; vec3 id = floor(d);
  float st = step(0.9965, h(id)) * smoothstep(0.02, 0.35, y);
  float tw = 0.6 + 0.4*sin(uTime*2.0 + h(id+3.1)*30.0);
  c += vec3(1.0,0.95,0.86) * st * tw * uNight * 0.9;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  mesh.renderOrder = -2;
  mesh.frustumCulled = false;
  return { mesh, uniforms: mat.uniforms };
}

// ---------- iluminación y hora del día ----------
export function buildLights(scene) {
  const hemi = new THREE.HemisphereLight('#cfe0ff', '#7a5b3a', 0.9);
  const sun = new THREE.DirectionalLight('#ffd6a0', 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  const sc = sun.shadow.camera;
  sc.left = -700; sc.right = 700; sc.top = 700; sc.bottom = -700; sc.near = 10; sc.far = 4000;
  scene.add(hemi, sun, sun.target);
  return { hemi, sun };
}

const DAY = {
  // [cenit, horizonte, sol, intensidad sol, hemi cielo, hemi suelo, intensidad hemi, exposición]
  golden: ['#5f7fb6', '#f3b98a', '#ffc685', 4.2, '#b9c9ee', '#6b4a2c', 0.55, 1.0],
  noon: ['#4f86d8', '#cfe1f2', '#fff4e0', 3.6, '#e6efff', '#8a7a5e', 1.15, 0.95],
  dusk: ['#1d2650', '#d9774f', '#ff8a4c', 2.0, '#7a84b8', '#3e2e22', 0.5, 1.05],
  night: ['#04060f', '#0d1430', '#9fb3ff', 0.15, '#2c3a66', '#0e0c0a', 0.3, 1.1],
};
const _a = new THREE.Color(), _b = new THREE.Color();
function mixHex(h1, h2, t, out) {
  _a.set(h1); _b.set(h2);
  return out.copy(_a).lerp(_b, t);
}
// t: -1 mediodía, 0 hora dorada, 0.5 atardecer, 1 noche
export function applyTimeOfDay(ctx, t) {
  const { sky, lights, renderer } = ctx;
  let A, B, k;
  if (t < 0) { A = DAY.noon; B = DAY.golden; k = t + 1; }
  else if (t < 0.5) { A = DAY.golden; B = DAY.dusk; k = t / 0.5; }
  else { A = DAY.dusk; B = DAY.night; k = (t - 0.5) / 0.5; }
  k = smooth(clamp01(k));
  mixHex(A[0], B[0], k, sky.uniforms.uTop.value);
  mixHex(A[1], B[1], k, sky.uniforms.uHorizon.value);
  mixHex(A[2], B[2], k, sky.uniforms.uSun.value);
  mixHex(A[2], B[2], k, lights.sun.color);
  lights.sun.intensity = lerp(A[3], B[3], k);
  mixHex(A[4], B[4], k, lights.hemi.color);
  mixHex(A[5], B[5], k, lights.hemi.groundColor);
  lights.hemi.intensity = lerp(A[6], B[6], k);
  renderer.toneMappingExposure = lerp(A[7], B[7], k);
  sky.uniforms.uNight.value = clamp01((t - 0.45) / 0.55);
}

// ---------- mapa de los 388 ----------
const HEIGHT_GLSL = `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec4 uMode; uniform float uGrow; uniform sampler2D uData; uniform float uVoteMax;
float muniH(vec3 v, float id){
  vec4 d = texelFetch(uData, ivec2(int(id+0.5), 0), 0);
  float hp = 400.0 + 17000.0*v.x;
  float hl = 400.0 + 17000.0*abs(v.y);
  float ha = 400.0 + 16000.0*v.z;
  float hv = 400.0 + 19000.0*d.g;
  return (uMode.x*hp + uMode.y*hl + uMode.z*ha + uMode.w*hv) * uGrow + 60.0;
}`;

export function buildMap(munis, ctxData) {
  const Q = 25; // metros por unidad
  const N = munis.length;
  const pos = [], nor = [], ids = [], vals = [], tops = [];
  const lpos = [], lids = [], lvals = [];
  const polys = []; // para hit-testing [ [x,y]... ] en metros
  const bbox = [];
  munis.forEach((m, idx) => {
    const v = muniValues(m);
    m._v = v;
    m._idx = idx;
    const rings = m.r.map((flat) => {
      const pts = [];
      for (let i = 0; i < flat.length; i += 2) pts.push([flat[i] * Q, flat[i + 1] * Q]);
      return pts;
    });
    polys.push(rings);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const ring of rings) for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    bbox.push([x0, y0, x1, y1]);
    const push = (x, top, y, n) => {
      pos.push(x, top, -y);
      nor.push(n[0], n[1], n[2]);
      ids.push(idx);
      vals.push(v[0], v[1], v[2]);
      tops.push(top);
    };
    for (const pts of rings) {
      // tapa superior
      const contour = pts.map(([x, y]) => new THREE.Vector2(x, y));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      for (const [a, b, c] of tris) {
        // CCW en xy sigue siendo CCW visto desde +Y con Z = -y
        push(pts[a][0], 1, pts[a][1], [0, 1, 0]);
        push(pts[b][0], 1, pts[b][1], [0, 1, 0]);
        push(pts[c][0], 1, pts[c][1], [0, 1, 0]);
      }
      // paredes
      for (let i = 0; i < pts.length; i++) {
        const [xa, ya] = pts[i];
        const [xb, yb] = pts[(i + 1) % pts.length];
        const len = Math.hypot(xb - xa, yb - ya) || 1;
        const n = [(yb - ya) / len, 0, (xb - xa) / len];
        push(xa, 0, ya, n); push(xb, 0, yb, n); push(xb, 1, yb, n);
        push(xa, 0, ya, n); push(xb, 1, yb, n); push(xa, 1, ya, n);
        lpos.push(xa, 1, -ya, xb, 1, -yb);
        lids.push(idx, idx);
        lvals.push(v[0], v[1], v[2], v[0], v[1], v[2]);
      }
    }
  });

  // textura de datos por municipio: r = atenuado (filtro), g = votos normalizados
  const dataArr = new Float32Array(512 * 4);
  for (let i = 0; i < N; i++) dataArr[i * 4] = 0;
  const dataTex = new THREE.DataTexture(dataArr, 512, 1, THREE.RGBAFormat, THREE.FloatType);
  dataTex.needsUpdate = true;

  const shared = {
    uMode: { value: new THREE.Vector4(1, 0, 0, 0) },
    uGrow: { value: 0 },
    uData: { value: dataTex },
    uVoteMax: { value: 1 },
    uHover: { value: -1 },
    uSel: { value: -1 },
    uHome: { value: munis.findIndex((m) => m.id === '06060') },
    uNight: { value: 1 },
    uOpacity: { value: 0 },
    uTime: { value: 0 },
  };

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aId', new THREE.Float32BufferAttribute(ids, 1));
  g.setAttribute('aV', new THREE.Float32BufferAttribute(vals, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: shared,
    transparent: true,
    vertexShader: `
${HEIGHT_GLSL}
attribute float aId; attribute vec3 aV;
varying vec3 vN; varying float vTop; varying vec3 vV; varying float vId; varying float vDim; varying float vVote; varying vec3 vW;
void main(){
  vec3 p = position;
  float h = muniH(aV, aId);
  vTop = p.y;
  p.y *= h;
  vec4 d = texelFetch(uData, ivec2(int(aId+0.5), 0), 0);
  vDim = d.r; vVote = d.g;
  vN = normal; vV = aV; vId = aId;
  vec4 wp = modelMatrix * vec4(p,1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`,
    fragmentShader: `
#include <logdepthbuf_pars_fragment>
uniform vec4 uMode; uniform float uHover, uSel, uHome, uNight, uOpacity, uTime, uGrow;
varying vec3 vN; varying float vTop; varying vec3 vV; varying float vId; varying float vDim; varying float vVote; varying vec3 vW;
vec3 popC(float t){ return mix(vec3(0.006,0.009,0.028), vec3(0.11,0.105,0.13), pow(t,1.2)); }
vec3 lossC(float s){ return s<0.0 ? mix(vec3(0.020,0.020,0.040), vec3(0.42,0.07,0.03), min(1.0,-s*1.1)) : mix(vec3(0.02,0.03,0.05), vec3(0.08,0.36,0.24), min(1.0,s*1.6)); }
vec3 altC(float t){ return mix(vec3(0.010,0.025,0.014), vec3(0.20,0.19,0.17), smoothstep(0.0,1.0,t)); }
vec3 voteC(float t){ return mix(vec3(0.012,0.015,0.040), vec3(1.0,0.42,0.10), t); }
void main(){
  #include <logdepthbuf_fragment>
  vec3 c = uMode.x*popC(vV.x) + uMode.y*lossC(vV.y) + uMode.z*altC(vV.z) + uMode.w*voteC(vVote);
  bool home = abs(vId-uHome)<0.5;
  bool hov = abs(vId-uHover)<0.5;
  bool sel = abs(vId-uSel)<0.5;
  if(home) c = vec3(0.80,0.36,0.07);
  float side = 1.0 - step(0.5, vN.y);
  vec3 L = normalize(vec3(-0.4,0.8,0.45));
  float lit = 0.55 + 0.45*max(dot(normalize(vN),L),0.0);
  c *= lit;
  c *= mix(1.0, 0.55 + 0.45*vTop, side);
  if(hov) c = mix(c, vec3(0.9,0.62,0.30), 0.55);
  if(sel) c = mix(c, vec3(1.0,0.55,0.18), 0.6 + 0.15*sin(uTime*4.0));
  c *= 1.0 - 0.72*vDim;
  float a = uOpacity * (1.0 - 0.5*vDim);
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;

  // contornos
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lpos, 3));
  lg.setAttribute('aId', new THREE.Float32BufferAttribute(lids, 1));
  lg.setAttribute('aV', new THREE.Float32BufferAttribute(lvals, 3));
  const lmat = new THREE.ShaderMaterial({
    uniforms: shared,
    transparent: true,
    depthWrite: false,
    vertexShader: `
${HEIGHT_GLSL}
attribute float aId; attribute vec3 aV; varying float vId; varying float vDim;
void main(){ vec3 p = position; p.y = muniH(aV, aId) + 25.0; vId = aId; vDim = texelFetch(uData, ivec2(int(aId+0.5),0),0).r; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
  #include <logdepthbuf_vertex>
}`,
    fragmentShader: `
#include <logdepthbuf_pars_fragment>
uniform float uHome, uOpacity, uSel, uHover; varying float vId; varying float vDim;
void main(){
  #include <logdepthbuf_fragment>
  bool home = abs(vId-uHome)<0.5; bool sel = abs(vId-uSel)<0.5 || abs(vId-uHover)<0.5;
  vec3 c = home ? vec3(1.0,0.62,0.22) : sel ? vec3(1.0,0.80,0.55) : vec3(0.45,0.50,0.75);
  float a = (home||sel ? 0.95 : 0.22) * uOpacity * (1.0-0.6*vDim);
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`,
  });
  const lines = new THREE.LineSegments(lg, lmat);
  lines.frustumCulled = false;
  lines.renderOrder = 2;

  // luces de los pueblos
  const ppos = [], pid = [], pval = [], psize = [];
  munis.forEach((m, idx) => {
    ppos.push(m.c[0] * Q, 1, -m.c[1] * Q);
    pid.push(idx);
    pval.push(m._v[0], m._v[1], m._v[2]);
    psize.push(Math.sqrt(Math.max(60, m.p || 60)));
  });
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(ppos, 3));
  pg.setAttribute('aId', new THREE.Float32BufferAttribute(pid, 1));
  pg.setAttribute('aV', new THREE.Float32BufferAttribute(pval, 3));
  pg.setAttribute('aS', new THREE.Float32BufferAttribute(psize, 1));
  const pmat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uPx: { value: 1 }, uTex: { value: glowTexture() } },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
${HEIGHT_GLSL}
uniform float uPx, uTime, uHome, uSel;
attribute float aId; attribute vec3 aV; attribute float aS; varying float vA; varying float vHome; varying float vDim;
void main(){
  vec3 p = position; p.y = muniH(aV, aId) + 400.0;
  vec4 mv = modelViewMatrix * vec4(p,1.0);
  gl_Position = projectionMatrix * mv;
  float home = abs(aId-uHome)<0.5 ? 1.0 : 0.0;
  float sel = abs(aId-uSel)<0.5 ? 1.0 : 0.0;
  vHome = max(home, sel);
  vDim = texelFetch(uData, ivec2(int(aId+0.5),0),0).r;
  float tw = 0.82 + 0.18*sin(uTime*1.7 + aId*12.7);
  gl_PointSize = (2.5 + min(aS, 230.0)*0.085) * uPx * tw * (1.0 + vHome*(1.6 + 0.5*sin(uTime*3.0)));
  vA = tw;
  #include <logdepthbuf_vertex>
}`,
    fragmentShader: `
#include <logdepthbuf_pars_fragment>
uniform sampler2D uTex; uniform float uNight, uOpacity; varying float vA; varying float vHome; varying float vDim;
void main(){
  #include <logdepthbuf_fragment>
  float t = texture2D(uTex, gl_PointCoord).r;
  vec3 c = mix(vec3(1.0,0.70,0.36), vec3(1.0,0.86,0.55), vHome);
  gl_FragColor = vec4(c * t * vA * 0.85, t * uOpacity * uNight * (1.0-0.8*vDim));
}`,
  });
  const points = new THREE.Points(pg, pmat);
  points.frustumCulled = false;
  points.renderOrder = 3;

  // contexto: provincias vecinas
  const cpos = [];
  for (const p of ctxData.p) {
    if (p.id === '06' || p.id === '10') continue;
    for (const flat of p.r) {
      for (let i = 0; i < flat.length; i += 2) {
        const j = (i + 2) % flat.length;
        cpos.push(flat[i] * Q, 0, -flat[i + 1] * Q, flat[j] * Q, 0, -flat[j + 1] * Q);
      }
    }
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3));
  const cmat = new THREE.LineBasicMaterial({ color: '#8d96c4', transparent: true, opacity: 0, depthWrite: false });
  const ctxLines = new THREE.LineSegments(cg, cmat);
  ctxLines.frustumCulled = false;

  const group = new THREE.Group();
  group.add(mesh, lines, points, ctxLines);

  // hit-testing
  const inRing = (x, y, ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const pick = (x, y) => {
    for (let i = 0; i < N; i++) {
      const b = bbox[i];
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      for (const ring of polys[i]) if (inRing(x, y, ring)) return i;
    }
    return -1;
  };
  const heightOf = (i) => {
    const v = munis[i]._v, md = shared.uMode.value, vote = dataArr[i * 4 + 1];
    const h = md.x * (400 + 17000 * v[0]) + md.y * (400 + 17000 * Math.abs(v[1])) + md.z * (400 + 16000 * v[2]) + md.w * (400 + 19000 * vote);
    return h * shared.uGrow.value + 60;
  };
  const setDim = (fn) => {
    for (let i = 0; i < N; i++) dataArr[i * 4] = fn ? (fn(munis[i]) ? 0 : 1) : 0;
    dataTex.needsUpdate = true;
  };
  const setVotes = (counts) => {
    let max = 1;
    for (let i = 0; i < N; i++) max = Math.max(max, counts[munis[i].id] || 0);
    for (let i = 0; i < N; i++) dataArr[i * 4 + 1] = (counts[munis[i].id] || 0) / max;
    dataTex.needsUpdate = true;
  };
  const center = (() => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const b of bbox) { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  })();

  return { group, uniforms: shared, pmat, cmat, pick, heightOf, setDim, setVotes, center, munis, Q };
}

export function muniValues(m) {
  const pop = Math.max(50, m.p || 50);
  const vPop = clamp01((Math.log10(pop) - 1.8) / (5.2 - 1.8));
  const ch = m.p0 ? (m.p - m.p0) / m.p0 : 0;
  const vLoss = Math.max(-1, Math.min(1, ch / 0.45));
  const vAlt = clamp01(((m.e ?? 400) - 150) / (1100 - 150));
  return [vPop, vLoss, vAlt];
}

// ---------- utilidades de cámara ----------
export class Rig {
  constructor(camera) {
    this.camera = camera;
    this.s = { x: 0, y: 0, dist: 500, tilt: 1.0, az: 0.6 };
    this.off = { tilt: 0, az: 0 };
  }
  apply(lift = 0) {
    const { x, y, dist, tilt, az } = this.s;
    const t = tilt + this.off.tilt, a = az + this.off.az;
    const cam = this.camera;
    cam.position.set(x + dist * Math.sin(t) * Math.sin(a), dist * Math.cos(t) + lift, -y + dist * Math.sin(t) * Math.cos(a));
    cam.lookAt(x, lift * 0.5, -y);
    cam.near = Math.max(0.5, dist / 2000);
    cam.far = Math.max(8000, dist * 30);
    cam.updateProjectionMatrix();
  }
}

export function interpState(keys, p) {
  // keys: [{at, x, y, dist, tilt, az}] ordenados por at
  if (p <= keys[0].at) return { ...keys[0] };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (p <= b.at) {
      const t = smooth((p - a.at) / (b.at - a.at));
      return {
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        dist: Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), t)),
        tilt: lerp(a.tilt, b.tilt, t),
        az: lerp(a.az, b.az, t),
        night: lerp(a.night ?? 0, b.night ?? 0, t),
      };
    }
  }
  return { ...keys[keys.length - 1] };
}

export function makeRenderer(canvas) {
  const mobile = matchMedia('(max-width: 760px)').matches || /Mobi|Android/i.test(navigator.userAgent);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, logarithmicDepthBuffer: true, powerPreference: 'high-performance', alpha: false });
  const maxRatio = Math.min(window.devicePixelRatio, mobile ? 1.5 : 1.75);
  renderer.setPixelRatio(maxRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // si el sistema se queda sin memoria gráfica (pasa en móviles con la pestaña en segundo plano), en vez de un
  // lienzo negro: un aviso y, al recuperar el contexto, la página vuelve a cargarse sola
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (document.getElementById('gl-lost')) return;
    const d = document.createElement('div');
    d.id = 'gl-lost';
    d.setAttribute('role', 'status');
    d.style.cssText = 'position:fixed;inset:auto 16px 16px;z-index:95;padding:12px 16px;border-radius:14px;background:rgba(7,10,20,.88);color:#eef0ec;font:14px/1.4 system-ui,sans-serif;text-align:center';
    const [msg, btn] = lang === 'en' ? ['3D has stopped to save memory.', 'Reload'] : ['El 3D se ha detenido para ahorrar memoria.', 'Recargar'];
    d.innerHTML = `${msg} <button type="button" style="margin-left:8px;font:inherit;color:#0c1122;background:#ffa94d;border:0;border-radius:999px;padding:6px 12px;cursor:pointer">${btn}</button>`;
    d.querySelector('button').addEventListener('click', () => location.reload());
    document.body.append(d);
  });
  canvas.addEventListener('webglcontextrestored', () => location.reload());
  return { renderer, mobile, governor: createGovernor(renderer, { max: maxRatio, min: Math.max(0.6, maxRatio * 0.5) }) };
}

// Resolución adaptativa: mide el ritmo real de fotogramas y, si baja de unos 42 por segundo (móviles modestos,
// pantallas enormes), reduce la resolución interna del 3D por pasos; si vuelve a ir sobrado (53 o más), la recupera
// poco a poco. En pantallas de 120 Hz, 60 fotogramas por segundo ya cuentan como fluidos.
export function createGovernor(renderer, { max, min, onChange = () => {} }) {
  const SLOW = 24, FAST = 19; // ms por fotograma
  let ratio = max, last = 0, ema = 0, settle = 60, calm = 0;
  // si subir la resolución vuelve a ahogar, ese nivel queda como techo y se espera el doble para reintentar
  let calmNeeded = 240, sinceUp = Infinity, ceiling = max;
  function apply(r) {
    if (r > ratio) sinceUp = 0;
    else if (sinceUp < 400) { calmNeeded = Math.min(calmNeeded * 2, 7200); ceiling = Math.min(ceiling, ratio - 0.01); }
    ratio = r;
    renderer.setPixelRatio(r);
    onChange(r);
    settle = 45; calm = 0; ema = 0;
  }
  return {
    // una vez por fotograma dibujado, con la marca de tiempo de requestAnimationFrame
    frame(now) {
      const dt = last ? now - last : 0;
      last = now;
      if (!dt || dt > 250) { settle = Math.max(settle, 20); return; } // (pestaña oculta, pausa o arranque)
      sinceUp++;
      if (settle > 0) { settle--; return; }
      ema = ema ? ema + (dt - ema) * 0.08 : dt;
      if (ema > SLOW && ratio > min) apply(Math.max(min, Math.round(ratio * 0.85 * 100) / 100));
      else if (ema < FAST && ratio < ceiling) { if (++calm > calmNeeded) apply(Math.min(ceiling, Math.round(ratio * 1.1 * 100) / 100)); }
      else calm = 0;
    },
    set onChange(f) { onChange = f; },
    get ratio() { return ratio; },
  };
}

export { THREE };
