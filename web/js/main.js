// 388 Pueblos — landing: scroll, interfaz y mapa de los 388.
import { createLandingWorld } from './landing-world.js';
import { readPassport } from './pasaporte.js';
import { SERVER, deviceId, apiGet, apiPost } from './backend.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const fmt = new Intl.NumberFormat('es-ES');
const pct = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1, signDisplay: 'exceptZero' });
const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
gsap.registerPlugin(ScrollTrigger);

// ---------------- precarga ----------------
const ld = { n: $('#ld-n'), name: $('#ld-name'), bar: $('#ld-bar'), status: $('#ld-status') };
let loadP = 0, shownP = 0, names = ['Guareña'];
const t0 = performance.now();
const ldTick = () => {
  shownP += (loadP - shownP) * 0.08;
  const n = Math.round(shownP * 388);
  ld.n.textContent = String(n).padStart(3, '0');
  ld.bar.style.transform = `scaleX(${shownP})`;
  if (n > 0 && n < 388 && Math.random() < 0.35) ld.name.textContent = names[Math.floor(Math.random() * names.length)];
};
gsap.ticker.add(ldTick);

// ---------------- scroll suave ----------------
let lenis = null;
if (!reduced && window.Lenis) {
  lenis = new window.Lenis({ lerp: 0.09, wheelMultiplier: 1, touchMultiplier: 1.2 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}
const scrollToEl = (el, opts = {}) => {
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4), ...opts });
  else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
};
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href');
  if (id.length < 2) return;
  const el = document.querySelector(id);
  if (!el) return;
  e.preventDefault();
  if (a.dataset.role) setRole(a.dataset.role);
  scrollToEl(el);
});

// ---------------- entrar en un pueblo: descenso de cámara continuo hasta su juego ----------------
function enterTown(href, name, idx) {
  const ov = document.createElement('div');
  ov.className = 'dive-ov';
  ov.innerHTML = '<div><b></b><span class="mono"></span></div>';
  ov.querySelector('b').textContent = name;
  ov.querySelector('span').textContent = href.startsWith('guarena.html') ? `Levantando ${fmt.format(world.townCount)} volúmenes…` : 'Levantando el pueblo…';
  document.body.append(ov);
  document.documentElement.classList.add('diving');
  lenis?.stop();
  tip.style.opacity = 0;
  const go = () => {
    ov.classList.add('on');
    setTimeout(() => { location.href = href; }, 520);
  };
  // un clic durante el descenso salta directamente al pueblo
  ov.addEventListener('click', go, { once: true });
  addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { removeEventListener('keydown', esc); go(); } });
  if (!world.dive(idx, go)) go();
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="guarena.html"], a[href^="pueblo.html#"]');
  if (!a || !world || reduced || e.metaKey || e.ctrlKey || e.shiftKey || world.diving) return;
  if (canvas.style.visibility === 'hidden') return; // el mundo no está a la vista: navegación normal
  const href = a.getAttribute('href');
  const id = href.startsWith('guarena.html') ? '06060' : href.split('#')[1];
  const idx = world.munis.findIndex((m) => m.id === id);
  if (idx < 0) return;
  e.preventDefault();
  enterTown(href, world.munis[idx].n, idx);
});
// al volver atrás desde el pueblo, la página puede restaurarse tal cual: deshacer el descenso
addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  document.querySelectorAll('.dive-ov').forEach((n) => n.remove());
  document.documentElement.classList.remove('diving');
  world?.cancelDive();
  lenis?.start();
});

// ---------------- mundo 3D ----------------
let world = null;
const canvas = $('#world');
const hasWebGL = (() => {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch { return false; }
})();

async function boot() {
  if (!hasWebGL) {
    document.documentElement.classList.add('no-webgl');
    ld.status.textContent = 'Tu navegador no muestra 3D: verás la versión ligera';
  } else {
    try {
      world = await createLandingWorld({
        canvas,
        labelLayer: $('#wlabels'),
        onProgress: (w) => { loadP = Math.min(0.98, loadP + w); },
        onHover,
        onPick: (i) => selectMuni(i, { fly: true }),
      });
      names = world.munis.map((m) => m.n);
      if (/[?&]debug/.test(location.search)) window.__w = world; // depuración local
      $('#n-parts').textContent = fmt.format(world.townCount);
    } catch (err) {
      console.error(err);
      document.documentElement.classList.add('no-webgl');
    }
  }
  loadP = 1;
  const wait = Math.max(0, 1900 - (performance.now() - t0));
  setTimeout(revealPage, wait);
  initUI();
}

function revealPage() {
  ld.status.textContent = 'Listo';
  const tl = gsap.timeline();
  tl.to('#loader .inner', { yPercent: -30, opacity: 0, duration: 0.6, ease: 'power3.in' }, 0.25)
    .to('#loader', { clipPath: 'inset(0 0 100% 0)', duration: 1.1, ease: 'power4.inOut' }, 0.5)
    .from('.hero h1 .line > span', { yPercent: 110, rotate: 4, duration: 1.2, stagger: 0.08, ease: 'expo.out' }, 0.95)
    .from('.hero .sub > *, .hero-tag', { y: 24, opacity: 0, duration: 0.9, stagger: 0.08, ease: 'power3.out' }, 1.25)
    .add(() => {
      $('#loader').hidden = true;
      gsap.ticker.remove(ldTick);
      lenis?.start();
      ScrollTrigger.refresh();
    });
  if (reduced) tl.progress(1);
}

// ---------------- prólogo y escenas ----------------
function initScroll() {
  const steps = $$('.step');
  const counted = new WeakSet();
  const hudCoord = $('#hud-coord');
  let hudStage = '';
  const setHud = (stage) => {
    if (stage === hudStage) return;
    hudStage = stage;
    const H = {
      pueblo: '<span><b>06060</b> Guareña</span><span>38.859°N 6.103°W</span><span>285 msnm</span><span>UTM 29N</span>',
      comarca: '<span><b>Vegas Altas</b> del Guadiana</span><span>Escala 1:500.000</span><span>Badajoz</span>',
      region: '<span><b>Extremadura</b></span><span>41.634 km²</span><span>388 municipios</span><span>1.051.638 hab.</span>',
    };
    hudCoord.innerHTML = H[stage];
  };

  ScrollTrigger.create({
    trigger: '#inicio',
    start: 'top top',
    endTrigger: '#vuelo',
    end: 'bottom bottom',
    scrub: true,
    onUpdate: (self) => {
      const p = self.progress;
      world?.setIntro(p);
      setHud(p < 0.47 ? 'pueblo' : p < 0.7 ? 'comarca' : 'region');
      for (const s of steps) {
        const a = +s.dataset.from, b = +s.dataset.to;
        const k = (p - a) / (b - a);
        const fadeIn = clamp01(k / 0.18), fadeOut = b > 1 ? 1 : clamp01((1 - k) / 0.18);
        const o = k < 0 || k > 1 ? 0 : Math.min(fadeIn, fadeOut);
        s.style.opacity = o.toFixed(3);
        s.style.transform = `translateY(${(1 - fadeIn) * 30 - (1 - fadeOut) * 30}px)`;
        s.style.visibility = o < 0.01 ? 'hidden' : 'visible';
        if (o > 0.6 && s.classList.contains('final') && !counted.has(s)) {
          counted.add(s);
          countUp(s);
        }
      }
    },
  });

  // manifiesto palabra a palabra
  const st = $('[data-words]');
  const walk = (node) => {
    for (const ch of [...node.childNodes]) {
      if (ch.nodeType === 3) {
        const frag = document.createDocumentFragment();
        ch.textContent.split(/(\s+)/).forEach((w) => {
          if (!w) return;
          if (/^\s+$/.test(w)) frag.append(w);
          else { const s = document.createElement('span'); s.className = 'w'; s.textContent = w; frag.append(s); }
        });
        ch.replaceWith(frag);
      } else if (ch.nodeType === 1) walk(ch);
    }
  };
  walk(st);
  const words = $$('.w', st);
  ScrollTrigger.create({
    trigger: st,
    start: 'top 80%',
    end: 'bottom 45%',
    scrub: true,
    onUpdate: (self) => {
      const n = self.progress * words.length * 1.1;
      words.forEach((w, i) => { w.style.opacity = (0.16 + 0.84 * clamp01(n - i)).toFixed(2); });
    },
  });

  // capas en horizontal (escritorio)
  const mm = gsap.matchMedia();
  mm.add('(min-width: 761px)', () => {
    const track = $('#track');
    gsap.to(track, {
      x: () => -(track.scrollWidth - innerWidth),
      ease: 'none',
      scrollTrigger: { trigger: '#mundo', start: 'top top', end: 'bottom bottom', scrub: 1, invalidateOnRefresh: true },
    });
  });

  // hoja de ruta
  gsap.to('#ph-prog', { scaleX: 0.25, ease: 'none', scrollTrigger: { trigger: '#phases', start: 'top 75%', end: 'top 35%', scrub: true } });
  gsap.from('.phase', { y: 40, opacity: 0, duration: 1, stagger: 0.12, ease: 'power3.out', scrollTrigger: { trigger: '#phases', start: 'top 80%' } });

  // revelados suaves (desde estado visible si no hay JS)
  for (const el of $$('.origin .txt > *, .play header > *, .councils .head > *, .benefits > div, .tier, .join > div > *, .passport')) {
    gsap.from(el, { y: 36, opacity: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%' } });
  }
  gsap.from('.card', { y: 50, opacity: 0, duration: 1, stagger: 0.07, ease: 'power3.out', scrollTrigger: { trigger: '.cards', start: 'top 80%' } });

  // modo del mundo y visibilidad del lienzo
  ScrollTrigger.create({
    trigger: '#los388',
    start: 'top 70%',
    end: 'bottom 30%',
    onToggle: (self) => {
      world?.setMode(self.isActive ? 'map' : 'intro');
      if (!self.isActive) closeSheet(false);
    },
  });
  const transparent = ['#inicio', '#vuelo', '#manifiesto', '#los388'].map((s) => $(s));
  const vis = new Map();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) vis.set(e.target, e.isIntersecting);
    const any = [...vis.values()].some(Boolean);
    world?.setVisible(any);
    canvas.style.visibility = any ? 'visible' : 'hidden';
    $('#wlabels').style.visibility = any ? 'visible' : 'hidden';
  }, { rootMargin: '10% 0px' });
  transparent.forEach((el) => io.observe(el));

  // HUD de sección
  const secs = [
    ['#inicio', 'Pueblo 001/388'], ['#vuelo', 'El vuelo'], ['#manifiesto', 'Manifiesto'], ['#origen', 'Origen'],
    ['#mundo', 'El mundo'], ['#juego', 'Cómo se juega'], ['#los388', 'Los 388'], ['#ruta', 'Hoja de ruta'],
    ['#ayuntamientos', 'Ayuntamientos'], ['#unete', 'Únete'],
  ];
  for (const [sel, label] of secs) {
    ScrollTrigger.create({ trigger: sel, start: 'top 50%', end: 'bottom 50%', onToggle: (s) => { if (s.isActive) $('#hud-sec').textContent = label; } });
  }
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (s) => { $('#hud-bar').style.transform = `scaleX(${s.progress})`; } });
  const navLinks = $$('.nav ul a');
  for (const a of navLinks) {
    const target = $(a.getAttribute('href'));
    if (target) ScrollTrigger.create({ trigger: target, start: 'top 50%', end: 'bottom 50%', onToggle: (s) => a.classList.toggle('on', s.isActive) });
  }
  // la interfaz HUD inferior sobra encima de secciones de cal
  for (const sel of ['#los388']) {
    ScrollTrigger.create({ trigger: sel, start: 'top bottom-=40', end: 'bottom bottom-=40', onToggle: (s) => { $('.hud').style.opacity = s.isActive ? 0 : 1; $('.hud-r').style.opacity = s.isActive ? 0 : 1; } });
  }
  for (const sel of ['#origen', '#ruta', '#ayuntamientos']) {
    ScrollTrigger.create({ trigger: sel, start: 'top bottom-=40', end: 'bottom bottom-=40', onToggle: (s) => { $('.hud').style.opacity = s.isActive ? 0 : 1; $('.hud-r').style.opacity = s.isActive ? 0 : 1; } });
    ScrollTrigger.create({ trigger: sel, start: 'top 40px', end: 'bottom 40px', onToggle: (s) => $('.nav').classList.toggle('light', s.isActive) });
  }
}

function countUp(scope) {
  for (const el of $$('[data-count]', scope)) {
    const to = +el.dataset.count;
    const o = { v: 0 };
    gsap.to(o, { v: to, duration: reduced ? 0 : 1.6, ease: 'power3.out', onUpdate: () => { el.textContent = fmt.format(Math.round(o.v)); } });
  }
}

// ---------------- plano de Guareña (sección origen) ----------------
async function drawPlano() {
  const cv = $('#plano');
  const g = cv.getContext('2d');
  let data;
  try { data = await (await fetch('data/guarena.json')).json(); } catch { return; }
  const css = getComputedStyle(document.documentElement);
  const anil = css.getPropertyValue('--anil').trim();
  const sodio = css.getPropertyValue('--sodio').trim();
  const W = cv.width, S = W / 2300; // 2,3 km de lado
  g.clearRect(0, 0, W, W);
  const u = data.unit;
  const draw = (flat, fill) => {
    g.beginPath();
    for (let i = 0; i < flat.length; i += 2) {
      const x = W / 2 + flat[i] * u * S + 60 * S;
      const y = W / 2 - flat[i + 1] * u * S - 40 * S;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  for (const [f, , flat] of data.parts) draw(flat, f >= 3 ? anil : f === 2 ? `${anil}d0` : `${anil}a0`);
  // Santa María y plaza
  const sm = data.parts.find(([, uc, flat]) => {
    if (!data.uses[uc].includes('publicServices')) return false;
    let x = 0, y = 0; for (let i = 0; i < flat.length; i += 2) { x += flat[i]; y += flat[i + 1]; }
    x = (x / (flat.length / 2)) * u; y = (y / (flat.length / 2)) * u;
    return Math.hypot(x + 126.1, y - 97) < 6;
  });
  if (sm) draw(sm[2], sodio);
  g.strokeStyle = sodio;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(W / 2 + 60 * S, W / 2 - 40 * S, 16, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = anil;
  g.font = '500 15px "Geist Mono", monospace';
  g.fillText('PLAZA DE ESPAÑA', W / 2 + 60 * S + 22, W / 2 - 40 * S + 5);
  g.fillText('N ↑', W - 54, 34);
}

// ---------------- mapa de los 388: interfaz ----------------
let munis = [];
let selected = -1;
let votes = {}; // id -> nº
let myVote = null;
const tip = $('#tip');
const sheet = $('#sheet');
const HOME = '06060';
const RAMPS = {
  pop: ['linear-gradient(90deg,#141b38,#7a7790)', 'menos de 100 hab.', '150.000 hab.'],
  loss: ['linear-gradient(90deg,#b5381e,#2a2633 50%,#3f9a72)', 'pierde 45 %', 'gana 30 %'],
  alt: ['linear-gradient(90deg,#1e3a22,#8e8b84)', '150 m', '1.100 m'],
  votes: ['linear-gradient(90deg,#141b38,#ff9a3c)', 'sin votos', 'más votado'],
};

function muniFacts(m) {
  const ch = m.p0 ? ((m.p - m.p0) / m.p0) * 100 : 0;
  return {
    pop: m.p ? fmt.format(m.p) : '—',
    chg: m.p0 ? `${pct.format(ch).replace('-', '−')} %` : '—',
    alt: m.e != null ? `${fmt.format(m.e)} m` : '—',
    area: m.a ? `${fmt.format(Math.round(m.a))} km²` : '—',
    prov: m.pr === 'BA' ? 'Badajoz' : 'Cáceres',
    dem: m.d ? m.d.charAt(0).toLowerCase() + m.d.slice(1) : null,
  };
}

function onHover(i, ptr, move) {
  if (i < 0 || !munis[i]) { tip.style.opacity = 0; return; }
  const m = munis[i];
  if (!move) {
    const f = muniFacts(m);
    tip.innerHTML = `<h4>${m.n}</h4><div class="row"><span>${m.id} · ${f.prov}</span><b>${m.id === HOME ? 'Despierto' : 'Gemelo automático'}</b></div><div class="row"><span>Habitantes</span><b>${f.pop}</b></div><div class="row"><span>Desde 2001</span><b>${f.chg}</b></div><div class="row"><span>Altitud</span><b>${f.alt}</b></div>${votes[m.id] ? `<div class="row"><span>Votos</span><b>${votes[m.id]}</b></div>` : ''}`;
  }
  tip.style.opacity = 1;
  const r = canvas.getBoundingClientRect();
  const x = Math.min(innerWidth - 240, ptr.x + r.left + 18), y = Math.min(innerHeight - 170, ptr.y + r.top + 18);
  tip.style.transform = `translate(${x}px, ${y}px)`;
}

function selectMuni(i, { fly = false } = {}) {
  if (i < 0 || !munis[i]) return;
  selected = i;
  world?.select(i);
  if (fly) world?.flyTo(i);
  const m = munis[i];
  const f = muniFacts(m);
  const home = m.id === HOME;
  $('#s-name').textContent = m.n;
  $('#s-meta').textContent = `${m.id} · ${f.prov}${f.dem ? ' · ' + f.dem : ''}${m.mc ? ' · ' + m.mc : ''}`;
  $('#s-pop').textContent = f.pop;
  $('#s-chg').textContent = f.chg;
  $('#s-alt').textContent = f.alt;
  $('#s-area').textContent = f.area;
  const stt = $('#s-status');
  stt.classList.toggle('on', home);
  stt.querySelector('span').textContent = home ? 'Despierto · primer pueblo' : 'Levantado en automático · por despertar';
  const acts = $('#s-actions');
  acts.innerHTML = '';
  if (home) {
    $('#s-note').textContent = 'Guareña es el primer pueblo del mundo de 388 Pueblos: Santa María (BIC, iniciada en 1557), la casa del poeta Luis Chamizo y el yacimiento tartésico de Casas del Turuñuelo.';
    acts.innerHTML = '<a class="btn primary" href="guarena.html?jugar">Jugar en Guareña <span class="arr" aria-hidden="true">→</span></a><a class="btn" href="guarena.html">Ver su gemelo</a>';
  } else {
    const n = votes[m.id] || 0;
    const mine = myVote === m.id;
    $('#s-note').textContent = `Ya tiene su gemelo automático con los edificios del Catastro: puedes entrar a verlo. Despertarlo (plaza, iglesia y calles al detalle, misiones y fiestas) depende de que su ayuntamiento se sume. ${n ? `Ya lo piden ${n} ${n === 1 ? 'persona' : 'personas'}.` : 'Aún nadie lo ha pedido.'}`;
    const b = document.createElement('button');
    b.className = 'btn primary';
    b.type = 'button';
    b.textContent = mine ? 'Tu voto es para este pueblo' : `Despertar ${m.n}`;
    b.disabled = mine;
    b.addEventListener('click', () => castVote(m.id));
    const j = document.createElement('a');
    j.className = 'btn';
    j.href = '#unete';
    j.textContent = 'Es mi pueblo';
    j.addEventListener('click', () => { $('#f-town').value = m.n; updatePassport(); });
    const v = document.createElement('a');
    v.className = 'btn';
    v.href = `pueblo.html#${m.id}`;
    v.innerHTML = 'Entrar en su gemelo <span class="arr" aria-hidden="true">→</span>';
    acts.append(v, b, j);
  }
  sheet.hidden = false;
  gsap.fromTo(sheet, { x: 24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: 'power3.out' });
}
function closeSheet(resetCam = true) {
  sheet.hidden = true;
  selected = -1;
  world?.select(-1);
  if (resetCam) world?.overview();
}

function setMode(mode) {
  for (const b of $$('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  world?.setDataMode(mode);
  const [ramp, a, b] = RAMPS[mode];
  $('#ramp').style.background = ramp;
  $('#lg-a').textContent = a;
  $('#lg-b').textContent = b;
}
function setFilter(kind) {
  for (const b of $$('[data-filter]')) b.setAttribute('aria-pressed', String(b.dataset.filter === kind));
  const fn = {
    all: null,
    1000: (m) => (m.p || 0) < 1000,
    500: (m) => (m.p || 0) < 500,
    loss: (m) => m.p0 && m.p < m.p0,
  }[kind];
  world?.setFilter(fn);
  const n = fn ? munis.filter(fn).length : munis.length;
  $('#f-count').textContent = `${fmt.format(n)} ${n === 1 ? 'pueblo destacado' : 'pueblos destacados'}${kind === 'loss' ? ' · han perdido población desde 2001' : ''}`;
}

function initMapUI() {
  // búsqueda
  const q = $('#q'), sugg = $('#sugg');
  let act = -1, list = [];
  const render = () => {
    sugg.innerHTML = list.map((m, k) => `<li><button type="button" role="option" data-i="${m._i}" class="${k === act ? 'act' : ''}">${m.n}<span>${m.pr} · ${m.p ? fmt.format(m.p) : ''}</span></button></li>`).join('');
    sugg.hidden = !list.length;
  };
  q.addEventListener('input', () => {
    const v = norm(q.value.trim());
    act = -1;
    list = v ? munis.filter((m) => norm(m.n).includes(v)).sort((a, b) => norm(a.n).indexOf(v) - norm(b.n).indexOf(v)).slice(0, 8) : [];
    render();
  });
  q.addEventListener('keydown', (e) => {
    if (!list.length) return;
    if (e.key === 'ArrowDown') { act = (act + 1) % list.length; render(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { act = (act - 1 + list.length) % list.length; render(); e.preventDefault(); }
    if (e.key === 'Enter') { const m = list[Math.max(0, act)]; pick(m._i); e.preventDefault(); }
    if (e.key === 'Escape') { list = []; render(); }
  });
  sugg.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) pick(+b.dataset.i); });
  const pick = (i) => { list = []; render(); q.value = munis[i].n; selectMuni(i, { fly: true }); };

  // pueblo al azar: ruleta de nombres
  $('#rnd').addEventListener('click', () => {
    const target = Math.floor(Math.random() * munis.length);
    let k = 0;
    const spins = 16;
    const spin = () => {
      const i = k < spins ? Math.floor(Math.random() * munis.length) : target;
      q.value = munis[i].n;
      world?.select(i);
      if (k++ < spins) setTimeout(spin, 40 + k * k * 1.6);
      else selectMuni(target, { fly: true });
    };
    spin();
  });
  $('#home').addEventListener('click', () => { const i = munis.findIndex((m) => m.id === HOME); q.value = 'Guareña'; selectMuni(i, { fly: true }); });
  $('#all').addEventListener('click', () => { closeSheet(true); q.value = ''; });
  $('#sheet-x').addEventListener('click', () => closeSheet(true));
  for (const b of $$('[data-mode]')) b.addEventListener('click', () => setMode(b.dataset.mode));
  for (const b of $$('[data-filter]')) b.addEventListener('click', () => setFilter(b.dataset.filter));
  setMode('pop');
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(true); });
}

// ---------------- votos (base de datos del artifact, con respaldo local) ----------------
let db = null, uid = null;
const LS = '388p:voto';
function renderVotes() {
  const total = Object.values(votes).reduce((a, b) => a + b, 0);
  $('#c-votes').textContent = fmt.format(total);
  const top = Object.entries(votes).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const rank = $('#rank');
  rank.innerHTML = top.length
    ? top.map(([id, n]) => { const m = munis.find((x) => x.id === id); return `<li><span>${m ? m.n : id}</span><span>${n} ${n === 1 ? 'voto' : 'votos'}</span></li>`; }).join('')
    : '<li><span class="muted">Aún no hay votos. El primero puede ser el tuyo.</span></li>';
  world?.setVotes(votes);
  if (selected >= 0) selectMuni(selected);
}
async function castVote(id) {
  const prev = myVote;
  myVote = id;
  try { localStorage.setItem(LS, id); } catch {}
  if (db && uid) {
    try {
      await db.doc(`votos/${uid}`).set({ pueblo: id, t: Date.now() });
      return; // la suscripción actualizará el recuento
    } catch (err) {
      console.warn('voto no guardado en la base compartida', err?.code);
    }
  }
  if (SERVER) {
    try {
      await apiPost('/votos', { device: deviceId(), pueblo: id });
      votes = await apiGet('/votos');
      renderVotes();
      return;
    } catch (err) {
      console.warn('voto no guardado en el servidor', err?.message);
    }
  }
  // respaldo local: solo cuenta en este navegador
  if (prev && votes[prev]) votes[prev]--;
  votes[id] = (votes[id] || 0) + 1;
  if (prev && votes[prev] === 0) delete votes[prev];
  renderVotes();
}
async function initData() {
  try { myVote = localStorage.getItem(LS); } catch {}
  if (myVote && !db) { votes[myVote] = 1; renderVotes(); }
  const c = window.claude;
  if (!c?.use) {
    if (SERVER) {
      const load = async () => { try { votes = await apiGet('/votos'); renderVotes(); } catch {} };
      load();
      setInterval(load, 20000);
    }
    return;
  }
  try {
    const [d, u] = await Promise.all([c.use('db'), c.use('user')]);
    if (!d) return;
    db = d;
    uid = u ? await u.id() : null;
    db.collection('votos').limit(1000).onSnapshot((snap) => {
      const v = {};
      for (const doc of snap.docs) {
        const p = doc.data()?.pueblo;
        if (typeof p === 'string' && /^\d{5}$/.test(p)) v[p] = (v[p] || 0) + 1;
        if (doc.id === uid) myVote = p;
      }
      votes = v;
      renderVotes();
    }, () => {});
  } catch (err) {
    console.warn('db no disponible', err);
  }
}

// ---------------- presencia en la sala general y pasaporte ----------------
async function initLive() {
  const r = await readPassport();
  if (!r) return;
  $('#pp-st').textContent = `${r.count}/388`;
  if (r.count && window.claude?.use) $('#pp-no').textContent = 'Nº fundador';
}

// ---------------- nombres en movimiento ----------------
function initNames() {
  const rows = $('#rows');
  const sorted = [...munis].sort((a, b) => a.n.localeCompare(b.n, 'es'));
  $('#names-list').innerHTML = sorted.map((m) => `<li>${m.n} (${m.pr === 'BA' ? 'Badajoz' : 'Cáceres'})</li>`).join('');
  const R = 4;
  const chunks = Array.from({ length: R }, (_, r) => sorted.filter((_, i) => i % R === r));
  const els = chunks.map((chunk) => {
    const row = document.createElement('div');
    row.className = 'row';
    const html = chunk.map((m) => `<button type="button" data-i="${m._i}" class="${m.id === HOME ? 'home' : ''}" tabindex="-1">${m.n}</button>`).join('');
    row.innerHTML = html + html;
    rows.append(row);
    return { row, x: -Math.random() * 2000, w: 0 };
  });
  const measure = () => els.forEach((e) => { e.w = e.row.scrollWidth / 2; });
  measure();
  addEventListener('resize', measure);
  document.fonts?.ready.then(measure);
  rows.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    const i = +b.dataset.i;
    scrollToEl($('#los388'), { onComplete: () => selectMuni(i, { fly: true }) });
    if (!lenis) setTimeout(() => selectMuni(i, { fly: true }), 600);
  });
  let visible = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(rows);
  gsap.ticker.add((time, dt) => {
    if (!visible || reduced) return;
    const vel = lenis ? lenis.velocity : 0;
    els.forEach((e, k) => {
      const dir = k % 2 ? 1 : -1;
      e.x += dir * (0.04 + Math.min(2, Math.abs(vel) * 0.02)) * dt;
      if (e.x < -e.w) e.x += e.w;
      if (e.x > 0) e.x -= e.w;
      e.row.style.transform = `translate3d(${e.x}px,0,0)`;
    });
  });
}

// ---------------- tarjetas con inclinación ----------------
function initCards() {
  if (reduced || matchMedia('(hover: none)').matches) return;
  for (const c of $$('.card, .passport')) {
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      c.style.transform = `rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateZ(0)`;
    });
    c.addEventListener('pointerleave', () => { c.style.transform = ''; });
  }
}

// ---------------- lista de espera y pasaporte ----------------
let role = 'Jugador';
function setRole(r) {
  role = r;
  for (const b of $$('#roles [data-role]')) b.setAttribute('aria-pressed', String(b.dataset.role === r));
}
function updatePassport() {
  const alias = $('#f-alias').value.trim();
  const town = $('#f-town').value.trim();
  const m = munis.find((x) => norm(x.n) === norm(town));
  $('#pp-who').textContent = alias || 'Tu nombre';
  $('#pp-town').textContent = m ? m.n : town || 'Tu pueblo';
  $('#pp-ine').textContent = m ? m.id : '—';
  $('#pp-ll').textContent = m ? `${m.ll[0].toFixed(3)}°N ${Math.abs(m.ll[1]).toFixed(3)}°W` : '—';
}
function initForm() {
  $('#towns').innerHTML = [...munis].sort((a, b) => a.n.localeCompare(b.n, 'es')).map((m) => `<option value="${m.n}"></option>`).join('');
  for (const b of $$('#roles [data-role]')) b.addEventListener('click', () => setRole(b.dataset.role));
  $('#f-alias').addEventListener('input', updatePassport);
  $('#f-town').addEventListener('input', updatePassport);
  const msg = $('#f-msg');
  $('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'formmsg';
    const email = $('#f-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = 'Escribe un email válido para poder avisarte.'; msg.classList.add('err'); $('#f-email').focus(); return; }
    if (!$('#f-age').checked) { msg.textContent = 'Marca la casilla de edad. Si tienes menos de 14 años, pide a un adulto que te apunte.'; msg.classList.add('err'); return; }
    if (!$('#f-ok').checked) { msg.textContent = 'Necesitamos tu permiso para guardar el email.'; msg.classList.add('err'); return; }
    const town = munis.find((x) => norm(x.n) === norm($('#f-town').value.trim()));
    const entry = { alias: $('#f-alias').value.trim().slice(0, 40), email, pueblo: town ? town.id : null, perfil: role, t: Date.now() };
    if (db && uid) {
      try {
        await db.doc(`lista/${uid}`).set(entry);
        msg.textContent = `Apuntado. Te avisaremos cuando abra la beta${town ? ` y cuando ${town.n} despierte` : ''}.`;
        msg.classList.add('ok');
        $('#pp-no').textContent = 'Nº fundador';
        return;
      } catch (err) {
        console.warn('registro no guardado', err?.code);
      }
    }
    if (SERVER) {
      try {
        await apiPost('/lista', { ...entry, edad14: true, acepto: true });
        msg.textContent = `Apuntado. Te avisaremos cuando abra la beta${town ? ` y cuando ${town.n} despierte` : ''}.`;
        msg.classList.add('ok');
        $('#pp-no').textContent = 'Nº fundador';
        return;
      } catch (err) {
        msg.textContent = err.status === 429 ? 'Demasiados intentos seguidos. Prueba de nuevo en un minuto.' : 'No hemos podido guardar tu inscripción. Revisa el email y vuelve a intentarlo.';
        msg.classList.add('err');
        return;
      }
    }
    msg.textContent = 'Esta vista previa todavía no puede guardar inscripciones. Tu pasaporte queda listo para cuando abramos la lista.';
    msg.classList.add('err');
  });
}

// ---------------- arranque ----------------
let uiReady = false;
function initUI() {
  if (uiReady) return;
  uiReady = true;
  munis = (world?.munis || []).map((m, i) => Object.assign(m, { _i: i }));
  initScroll();
  initCards();
  drawPlano();
  if (munis.length) {
    initMapUI();
    initNames();
    initForm();
    initData();
    initLive();
  } else {
    // sin 3D: cargamos los datos para el resto de la página
    fetch('data/municipios.json').then((r) => r.json()).then((d) => {
      munis = d.m.map((m, i) => Object.assign(m, { _i: i }));
      initMapUI();
      initNames();
      initForm();
      initData();
    }).catch(() => {});
  }
}

boot();
