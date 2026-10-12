// Paseo por el pueblo: avatar propio, vecinos NPC y otras personas conectadas en tiempo real.
// Sin chat libre: solo frases predefinidas y emojis (seguridad para menores por diseño).
import { THREE, rng } from './world.js';
import { SERVER, wsRoom } from './backend.js';

export const FRASES = ['¡Hola!', '¿De qué pueblo eres?', '¡Vamos a la plaza!', '¡He encontrado un nido!', '¡Qué bonito!', '¡Hasta luego!'];
export const EMOJIS = ['👋', '🎉', '❤️', '😂', '🐦', '☀️'];
const CASTUO = ['¡Acho!', '¡Güenas!', '¿Ande vas?', '¡Qué caló hace!', 'Me voy pa la plaza', '¡Arrea!', 'Buenas tardes, mozo', '¿Has visto las cigüeñas?'];
const ALIAS_A = ['Cigüeña', 'Encina', 'Lince', 'Grulla', 'Bellota', 'Abubilla', 'Alcornoque', 'Milano', 'Jara', 'Olivo', 'Abejaruco', 'Romero'];
const COLORS = ['#ffa94d', '#8fa2ff', '#6fa58a', '#e8665a', '#d9b8ff', '#f2d16b', '#4fc3c7', '#ff8fb1'];
const SKIN = ['#e9c4a0', '#c99a72', '#a87452', '#f1d3b8'];

const lerp = (a, b, t) => a + (b - a) * t;

function aliasForMe() {
  let a = null;
  try { a = localStorage.getItem('388p:alias'); } catch {}
  if (!a) {
    a = `${ALIAS_A[Math.floor(Math.random() * ALIAS_A.length)]} ${10 + Math.floor(Math.random() * 90)}`;
    try { localStorage.setItem('388p:alias', a); } catch {}
  }
  let c = null;
  try { c = localStorage.getItem('388p:color'); } catch {}
  if (c == null) {
    c = String(Math.floor(Math.random() * COLORS.length));
    try { localStorage.setItem('388p:color', c); } catch {}
  }
  return { alias: a, color: +c % COLORS.length };
}

function makeAvatar(color, skin, scale = 1.7) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 1.45, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.75 }));
  body.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 }));
  head.position.y = 1.78;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 6), new THREE.MeshStandardMaterial({ color: skin }));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.76, 0.36);
  g.add(body, head, nose);
  g.scale.setScalar(scale);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.body = body;
  return g;
}

export function createPaseo({ scene, camera, controls, canvas, town, labelsEl, roomName, center = { x: 0, y: 0 }, radius = 1200, onStatus = () => {} }) {
  // ---- rejilla de ocupación a partir de las huellas reales ----
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of town.parts) for (const [x, y] of q.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const CELL = 2;
  const W = Math.max(1, Math.ceil((x1 - x0) / CELL) + 2), H = Math.max(1, Math.ceil((y1 - y0) / CELL) + 2);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  for (const q of town.parts) {
    g.beginPath();
    q.pts.forEach(([x, y], i) => {
      const px = (x - x0) / CELL + 1, py = (y1 - y) / CELL + 1;
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    });
    g.closePath();
    g.fill();
  }
  const occ = g.getImageData(0, 0, W, H).data;
  const free = (x, y) => {
    if (Math.hypot(x - center.x, y - center.y) > radius + 250) return false;
    const i = Math.floor((x - x0) / CELL + 1), j = Math.floor((y1 - y) / CELL + 1);
    if (i < 0 || j < 0 || i >= W || j >= H) return true;
    return occ[(j * W + i) * 4 + 3] < 100;
  };
  const clearLine = (ax, ay, bx, by) => {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 1.5);
    for (let k = 1; k <= n; k++) if (!free(lerp(ax, bx, k / n), lerp(ay, by, k / n))) return false;
    return true;
  };
  const nearestFree = (x, y) => {
    if (free(x, y)) return { x, y };
    for (let r = 2; r < 200; r += 2) {
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos((a / 16) * Math.PI * 2) * r, py = y + Math.sin((a / 16) * Math.PI * 2) * r;
        if (free(px, py)) return { x: px, y: py };
      }
    }
    return { x, y };
  };

  // ---- etiquetas y bocadillos ----
  const bubbles = new Set();
  const mkLabel = (text, cls) => {
    const el = document.createElement('div');
    el.className = `plabel ${cls || ''}`;
    el.innerHTML = `<span class="pn"></span><span class="pb"></span>`;
    el.querySelector('.pn').textContent = text;
    labelsEl.appendChild(el);
    return el;
  };
  const say = (who, text) => {
    const b = who.label.querySelector('.pb');
    b.textContent = text;
    who.label.classList.add('talk');
    who.sayUntil = performance.now() + 4200;
    bubbles.add(who);
  };

  // ---- jugador ----
  const me = aliasForMe();
  // cada persona aparece en un punto algo distinto de la plaza para no solaparse
  const spawn = nearestFree(center.x + 4 + (Math.random() - 0.5) * 22, center.y - 6 + (Math.random() - 0.5) * 22);
  const player = {
    x: spawn.x, y: spawn.y, h: 0, walking: false, target: null,
    mesh: makeAvatar(COLORS[me.color], SKIN[me.color % SKIN.length], 1.8),
    label: mkLabel(`${me.alias} · tú`, 'me'),
  };
  player.mesh.visible = false;
  player.label.style.display = 'none';
  scene.add(player.mesh);

  // ---- vecinos NPC ----
  const R = rng(4041);
  const npcs = [];
  const npcColors = ['#7a6a5a', '#3f4a5e', '#8a4b3a', '#5d6b4a', '#a08a6a', '#4b3f52', '#2f4f4f'];
  for (let i = 0; i < 16; i++) {
    let p = null;
    for (let tries = 0; tries < 40 && !p; tries++) {
      const a = R() * Math.PI * 2, r = 20 + R() * Math.min(320, radius * 0.6);
      const c = { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
      if (free(c.x, c.y)) p = c;
    }
    if (!p) continue;
    const n = { x: p.x, y: p.y, h: R() * 6.28, target: null, wait: R() * 3, speed: 1.6 + R() * 0.9, mesh: makeAvatar(npcColors[i % npcColors.length], SKIN[i % SKIN.length], 1.7), label: mkLabel('Vecino', 'npc'), talkAt: 6 + R() * 30 };
    n.label.querySelector('.pn').textContent = '';
    scene.add(n.mesh);
    npcs.push(n);
  }

  let active = false;

  // ---- otras personas (presencia en tiempo real) ----
  const others = new Map(); // peer -> {x,y,h,tx,ty,mesh,label,st,et}
  let room = null, online = 1, connected = false;
  const myPresence = () => ({ x: Math.round(player.x * 10) / 10, y: Math.round(player.y * 10) / 10, h: Math.round(player.h * 100) / 100, n: me.alias, c: me.color, w: player.walking ? 1 : 0, on: active ? 1 : 0 });
  let lastSent = 0, pendingSay = null;
  const sendPresence = (extra) => {
    if (!room) return;
    room.presence({ ...myPresence(), ...(extra || {}) }).catch(() => {});
  };
  const applyPeers = (peers) => {
    const seen = new Set();
    let count = 0;
    for (const p of peers) {
      if (p.kind !== 'viewer') continue;
      count++;
      if (p.isMe && p.sameTab) continue;
      const s = p.presence || {};
      if (typeof s.x !== 'number' || typeof s.y !== 'number' || !s.on) continue;
      seen.add(p.peer);
      let o = others.get(p.peer);
      if (!o) {
        const ci = Number.isInteger(s.c) ? Math.abs(s.c) % COLORS.length : 0;
        o = { x: s.x, y: s.y, h: s.h || 0, tx: s.x, ty: s.y, mesh: makeAvatar(COLORS[ci], SKIN[ci % SKIN.length], 1.8), label: mkLabel('Vecino', 'peer'), st: 0, et: 0 };
        scene.add(o.mesh);
        others.set(p.peer, o);
      }
      o.label.querySelector('.pn').textContent = typeof s.n === 'string' ? s.n.slice(0, 24) : 'Vecino';
      o.tx = s.x; o.ty = s.y; o.th = typeof s.h === 'number' ? s.h : o.h;
      o.walking = !!s.w;
      if (typeof s.st === 'number' && s.st !== o.st && typeof s.s === 'number' && FRASES[s.s]) { o.st = s.st; say(o, FRASES[s.s]); }
      if (typeof s.et === 'number' && s.et !== o.et && typeof s.e === 'number' && EMOJIS[s.e]) { o.et = s.et; say(o, EMOJIS[s.e]); }
    }
    for (const [k, o] of others) {
      if (!seen.has(k)) { scene.remove(o.mesh); o.label.remove(); others.delete(k); bubbles.delete(o); }
    }
    online = Math.max(1, count);
    onStatus({ online, connected, others: others.size });
  };
  (async () => {
    const c = window.claude;
    let lobby = null;
    if (c?.use) { try { lobby = await c.use('room'); } catch { lobby = null; } }
    try {
      if (lobby) {
        lobby.presence({ pg: 'pueblo', r: roomName }).catch(() => {});
        room = await lobby.join(roomName);
      } else if (SERVER) {
        room = wsRoom(roomName);
      } else {
        onStatus({ online: 1, connected: false, others: 0 });
        return;
      }
      connected = !!(room.connected ? room.connected() : true);
      room.onPeers((ch) => applyPeers(ch.peers), () => { connected = false; onStatus({ online: 1, connected: false, others: 0 }); });
      room.onConnection?.((ok) => { connected = ok; onStatus({ online, connected, others: others.size }); });
      sendPresence();
    } catch {
      room = null;
      onStatus({ online: 1, connected: false, others: 0 });
    }
  })();

  // ---- entrada ----
  const keys = new Set();
  const onKey = (e) => {
    if (!active) return;
    if (e.target.closest && e.target.closest('input, textarea')) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
      if (e.type === 'keydown') keys.add(k); else keys.delete(k);
      if (k.startsWith('arrow')) e.preventDefault();
    }
  };
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKey);
  addEventListener('blur', () => keys.clear());
  const ray = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitV = new THREE.Vector3();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!active || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera);
    if (ray.ray.intersectPlane(ground, hitV)) {
      const t = nearestFree(hitV.x, -hitV.z);
      player.target = t;
    }
  });

  function enable() {
    active = true;
    player.mesh.visible = true;
    player.label.style.display = '';
    controls.autoRotate = false;
    controls.minDistance = 14;
    controls.maxDistance = 220;
    const off = new THREE.Vector3().subVectors(camera.position, controls.target);
    off.setLength(Math.min(90, Math.max(40, off.length() * 0.25)));
    off.y = Math.max(off.y, 28);
    controls.target.set(player.x, 3, -player.y);
    camera.position.copy(controls.target).add(off);
    sendPresence();
  }
  function disable() {
    active = false;
    keys.clear();
    player.target = null;
    player.mesh.visible = false;
    player.label.style.display = 'none';
    controls.minDistance = 45;
    controls.maxDistance = 2600;
    sendPresence({ on: 0 });
  }
  function phrase(i) {
    say(player, FRASES[i]);
    sendPresence({ s: i, st: Date.now() });
  }
  function emoji(i) {
    say(player, EMOJIS[i]);
    sendPresence({ e: i, et: Date.now() });
  }

  // ---- bucle ----
  const tmp = new THREE.Vector3();
  const v3 = new THREE.Vector3();
  function moveTo(ent, nx, ny) {
    if (free(nx, ny)) { ent.x = nx; ent.y = ny; return true; }
    if (free(nx, ent.y)) { ent.x = nx; return true; }
    if (free(ent.x, ny)) { ent.y = ny; return true; }
    return false;
  }
  function placeLabel(ent, h, w, hh) {
    v3.set(ent.x, h, -ent.y).project(camera);
    const vis = v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1 && camera.position.distanceTo(tmp.set(ent.x, h, -ent.y)) < 420;
    ent.label.style.opacity = vis ? '1' : '0';
    if (vis) ent.label.style.transform = `translate3d(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * hh}px, 0) translate(-50%, -100%)`;
  }
  function update(dt, t) {
    const w = canvas.clientWidth, hh = canvas.clientHeight;
    // jugador
    if (active) {
      let mx = 0, my = 0;
      if (keys.has('w') || keys.has('arrowup')) my += 1;
      if (keys.has('s') || keys.has('arrowdown')) my -= 1;
      if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
      if (keys.has('d') || keys.has('arrowright')) mx += 1;
      const speed = keys.has('shift') ? 16 : 8;
      let moving = false;
      if (mx || my) {
        player.target = null;
        // relativo a la cámara
        tmp.subVectors(controls.target, camera.position);
        const fx = tmp.x, fy = -tmp.z;
        const fl = Math.hypot(fx, fy) || 1;
        const ux = fx / fl, uy = fy / fl; // adelante en xy
        const rx = uy, ry = -ux; // derecha
        const dx = (ux * my + rx * mx), dy = (uy * my + ry * mx);
        const dl = Math.hypot(dx, dy) || 1;
        moving = moveTo(player, player.x + (dx / dl) * speed * dt, player.y + (dy / dl) * speed * dt);
        player.h = Math.atan2(dx, dy);
      } else if (player.target) {
        const dx = player.target.x - player.x, dy = player.target.y - player.y;
        const d = Math.hypot(dx, dy);
        if (d < 1.2) player.target = null;
        else {
          const st = Math.min(d, speed * dt);
          moving = moveTo(player, player.x + (dx / d) * st, player.y + (dy / d) * st);
          if (!moving) player.target = null;
          player.h = Math.atan2(dx, dy);
        }
      }
      player.walking = moving;
      player.mesh.position.set(player.x, Math.abs(Math.sin(t * 9)) * (moving ? 0.25 : 0), -player.y);
      player.mesh.rotation.y = player.h;
      // cámara que sigue
      const nt = tmp.set(player.x, 3, -player.y);
      const dlt = nt.clone().sub(controls.target).multiplyScalar(0.12);
      controls.target.add(dlt);
      camera.position.add(dlt);
      placeLabel(player, 6.2, w, hh);
      if (room && t - lastSent > 0.1) { lastSent = t; sendPresence(); }
    }
    // NPC
    for (const n of npcs) {
      if (n.wait > 0) { n.wait -= dt; }
      else if (!n.target) {
        for (let k = 0; k < 6 && !n.target; k++) {
          const a = R() * Math.PI * 2, r = 12 + R() * 60;
          const tx = n.x + Math.cos(a) * r, ty = n.y + Math.sin(a) * r;
          if (free(tx, ty) && clearLine(n.x, n.y, tx, ty) && Math.hypot(tx - center.x, ty - center.y) < radius * 0.8) n.target = { x: tx, y: ty };
        }
        if (!n.target) n.wait = 1;
      } else {
        const dx = n.target.x - n.x, dy = n.target.y - n.y, d = Math.hypot(dx, dy);
        if (d < 0.8) { n.target = null; n.wait = 1 + R() * 5; }
        else {
          const st = Math.min(d, n.speed * dt);
          if (!moveTo(n, n.x + (dx / d) * st, n.y + (dy / d) * st)) { n.target = null; n.wait = 0.5; }
          n.h = Math.atan2(dx, dy);
        }
      }
      const walking = !!n.target && n.wait <= 0;
      n.mesh.position.set(n.x, walking ? Math.abs(Math.sin(t * 7 + n.speed * 10)) * 0.18 : 0, -n.y);
      n.mesh.rotation.y = lerp(n.mesh.rotation.y, n.h, 0.2);
      n.talkAt -= dt;
      if (n.talkAt < 0) {
        n.talkAt = 14 + R() * 40;
        if (camera.position.distanceTo(tmp.set(n.x, 2, -n.y)) < 260) say(n, CASTUO[Math.floor(R() * CASTUO.length)]);
      }
      if (bubbles.has(n)) placeLabel(n, 5.6, w, hh);
    }
    // otras personas
    for (const o of others.values()) {
      o.x = lerp(o.x, o.tx, 0.18);
      o.y = lerp(o.y, o.ty, 0.18);
      o.h = lerp(o.h, o.th ?? o.h, 0.25);
      o.mesh.position.set(o.x, o.walking ? Math.abs(Math.sin(t * 9)) * 0.25 : 0, -o.y);
      o.mesh.rotation.y = o.h;
      placeLabel(o, 6.2, w, hh);
    }
    // bocadillos que caducan
    const now = performance.now();
    for (const b of bubbles) {
      if (now > b.sayUntil) {
        b.label.classList.remove('talk');
        bubbles.delete(b);
        if (npcs.includes(b)) b.label.style.opacity = '0';
      }
    }
  }

  return {
    enable, disable, update, phrase, emoji,
    get active() { return active; },
    get alias() { return me.alias; },
    get online() { return online; },
    get connected() { return connected; },
  };
}
