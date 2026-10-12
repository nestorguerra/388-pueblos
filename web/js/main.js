// 388 Pueblos — landing: scroll, interfaz y mapa de los 388.
import { createLandingWorld } from './landing-world.js';
import { readPassport } from './pasaporte.js';
import { SHARED, loadVotes, sendVote, wake, loadSignupCounts } from './backend.js';
import { META_DESPERTAR, DISCORD_URL } from './config.js';
import { t, addTexts, lang, page, locale } from './i18n.js';
import { initRedes } from './redes.js';
import { markListed, saveSignup, queueSignup } from './lista.js';
import { getJSON, prerender } from './red.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const fmt = new Intl.NumberFormat(locale);
const pct = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1, signDisplay: 'exceptZero' });

// textos de la portada en español e inglés (los de varias páginas están en i18n.js)
addTexts({
  es: {
    'm.levantando': 'Levantando el pueblo…', 'm.sin3d': 'Tu navegador no muestra 3D: verás la versión ligera', 'm.listo': 'Listo',
    'hud.comarca': '<span><b>Vegas Altas</b> del Guadiana</span><span>Escala 1:500.000</span><span>Badajoz</span>',
    'hud.region': '<span><b>Extremadura</b></span><span>41.634 km²</span><span>388 municipios</span><span>1.051.638 hab.</span>',
    'hud.pueblo': '<span><b>06060</b> Guareña</span><span>38.859°N 6.103°W</span><span>285 msnm</span><span>UTM 29N</span>',
    'sec.inicio': 'Pueblo 001/388', 'sec.vuelo': 'El vuelo', 'sec.manifiesto': 'Manifiesto', 'sec.origen': 'Origen', 'sec.mundo': 'El mundo',
    'sec.juego': 'Cómo se juega', 'sec.los388': 'Los 388', 'sec.ruta': 'Hoja de ruta', 'sec.diario': 'Diario de obra',
    'sec.ayuntamientos': 'Ayuntamientos', 'sec.comunidad': 'Comunidad', 'sec.unete': 'Únete',
    'r.pop': ['menos de 100 hab.', '150.000 hab.'], 'r.loss': ['pierde 45 %', 'gana 30 %'], 'r.alt': ['150 m', '1.100 m'], 'r.votes': ['sin votos', 'más votado'],
    'tip.despierto': 'Despierto', 'tip.auto': 'Gemelo automático', 'tip.hab': 'Habitantes', 'tip.desde': 'Desde 2001', 'tip.alt': 'Altitud', 'tip.votos': 'Votos',
    'st.home': 'Despierto · primer pueblo', 'st.auto': 'Levantado en automático · por despertar',
    'note.home': 'Guareña es el primer pueblo del mundo de 388 Pueblos: Santa María (BIC, iniciada en 1557), la casa del poeta Luis Chamizo y el yacimiento tartésico de Casas del Turuñuelo.',
    'note.auto': ({ n }) => `Ya tiene su gemelo automático con los edificios del Catastro: puedes entrar a verlo. Despertarlo (plaza, iglesia y calles al detalle, misiones y fiestas) depende de que su ayuntamiento se sume. ${n ? `Ya lo piden ${n} ${n === 1 ? 'persona' : 'personas'}.` : 'Aún nadie lo ha pedido.'}`,
    'a.jugar': 'Jugar en Guareña', 'a.gemelo': 'Ver su gemelo', 'a.tuvoto': 'Tu voto es para este pueblo', 'a.despertar': ({ name }) => `Despertar ${name}`, 'a.entrar': 'Entrar en su gemelo',
    'f.count': ({ n, loss }) => `${n} ${n === 1 ? 'pueblo destacado' : 'pueblos destacados'}${loss ? ' · han perdido población desde 2001' : ''}`,
    'v.votos': ({ n }) => `${n} ${n === 1 ? 'voto' : 'votos'}`, 'v.vacio': 'Aún no hay votos. El primero puede ser el tuyo.',
    'd.error': 'Ahora mismo no podemos cargar el diario. Puedes verlo en GitHub.',
    'pp.fundador': 'Nº fundador', 'pp.nombre': 'Tu nombre', 'pp.pueblo': 'Tu pueblo',
    'fm.email': 'Escribe un email válido para poder avisarte.', 'fm.edad': 'Marca la casilla de edad. Si tienes menos de 14 años, pide a un adulto que te apunte.',
    'fm.ok': 'Necesitamos tu permiso para guardar el email.', 'fm.guardando': 'Guardando…',
    'fm.apuntado': ({ name }) => `Apuntado. Te avisaremos de cada novedad${name ? ` y de cuando ${name} despierte` : ''}.`,
    'fm.entrar': 'Entrar ya en Guareña →', 'fm.cola': 'Te hemos apuntado en este dispositivo y lo enviaremos en cuanto haya conexión.',
    'fm.429': 'Demasiados intentos seguidos. Prueba de nuevo en un minuto.', 'fm.400': 'Revisa el email: no parece válido.',
    'fm.error': 'No hemos podido guardar tu inscripción. Vuelve a intentarlo en un momento.', 'fm.preview': 'Esta vista previa no puede guardar inscripciones.',
  },
  en: {
    'm.levantando': 'Raising the town…', 'm.sin3d': 'Your browser cannot show 3D: you will see the light version', 'm.listo': 'Ready',
    'hud.comarca': '<span><b>Vegas Altas</b> del Guadiana</span><span>Scale 1:500,000</span><span>Badajoz</span>',
    'hud.region': '<span><b>Extremadura</b></span><span>41,634 km²</span><span>388 municipalities</span><span>1,051,638 people</span>',
    'hud.pueblo': '<span><b>06060</b> Guareña</span><span>38.859°N 6.103°W</span><span>285 m above sea level</span><span>UTM 29N</span>',
    'sec.inicio': 'Town 001/388', 'sec.vuelo': 'The flight', 'sec.manifiesto': 'Manifesto', 'sec.origen': 'Origin', 'sec.mundo': 'The world',
    'sec.juego': 'How you play', 'sec.los388': 'The 388', 'sec.ruta': 'Roadmap', 'sec.diario': 'Work diary',
    'sec.ayuntamientos': 'Town councils', 'sec.comunidad': 'Community', 'sec.unete': 'Join',
    'r.pop': ['under 100 people', '150,000 people'], 'r.loss': ['loses 45 %', 'gains 30 %'], 'r.alt': ['150 m', '1,100 m'], 'r.votes': ['no votes', 'most voted'],
    'tip.despierto': 'Awake', 'tip.auto': 'Automatic twin', 'tip.hab': 'Population', 'tip.desde': 'Since 2001', 'tip.alt': 'Altitude', 'tip.votos': 'Votes',
    'st.home': 'Awake · first town', 'st.auto': 'Raised automatically · waiting to wake up',
    'note.home': 'Guareña is the first town in the 388 Pueblos world: Santa María church (a listed monument begun in 1557), the house of the poet Luis Chamizo and the Tartessian site of Casas del Turuñuelo.',
    'note.auto': ({ n }) => `It already has its automatic twin built from Catastro (Spain's land registry) buildings: you can go in and see it. Waking it up (square, church and streets in detail, quests and festivities) depends on its town council joining. ${n ? `${n} ${n === 1 ? 'person has' : 'people have'} asked for it.` : 'Nobody has asked for it yet.'}`,
    'a.jugar': 'Play in Guareña', 'a.gemelo': 'See its twin', 'a.tuvoto': 'Your vote goes to this town', 'a.despertar': ({ name }) => `Wake up ${name}`, 'a.entrar': 'Enter its twin',
    'f.count': ({ n, loss }) => `${n} ${n === 1 ? 'town highlighted' : 'towns highlighted'}${loss ? ' · lost population since 2001' : ''}`,
    'v.votos': ({ n }) => `${n} ${n === 1 ? 'vote' : 'votes'}`, 'v.vacio': 'No votes yet. The first one could be yours.',
    'd.error': 'We cannot load the diary right now. You can see it on GitHub.',
    'pp.fundador': 'Founder no.', 'pp.nombre': 'Your name', 'pp.pueblo': 'Your town',
    'fm.email': 'Enter a valid email so we can let you know.', 'fm.edad': 'Tick the age box. If you are under 14, ask an adult to sign you up.',
    'fm.ok': 'We need your permission to keep your email.', 'fm.guardando': 'Saving…',
    'fm.apuntado': ({ name }) => `You are on the list. We will tell you about every update${name ? ` and when ${name} wakes up` : ''}.`,
    'fm.entrar': 'Go into Guareña now →', 'fm.cola': 'We have signed you up on this device and will send it as soon as there is a connection.',
    'fm.429': 'Too many attempts in a row. Try again in a minute.', 'fm.400': 'Check your email: it does not look valid.',
    'fm.error': 'We could not save your sign-up. Please try again in a moment.', 'fm.preview': 'This preview cannot save sign-ups.',
  },
});
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
// En Guareña no hay telón: la cámara baja hasta el encuadre con el que arranca su página y le pasa ese último fotograma
// (sessionStorage '388:relevo'). La página lo enseña al instante, lo sigue acercando mientras levanta su maqueta y se
// funde con ella en el mismo encuadre: un solo zoom de la portada al pueblo, y de ahí al juego. Los demás pueblos, que
// acaban sobre el mapa y no en su encuadre, siguen con su telón y su nombre.
const RELEVO = '388:relevo';
function enterTown(href, name, idx) {
  // mientras dura el descenso, el navegador ya va levantando la página del pueblo (llega lista)
  prerender(href, /^(pueblo|town)\.html#/.test(href) ? `data/pueblos/${href.split('#')[1]}.json` : null);
  const guarena = href.startsWith('guarena.html');
  let ov = null, gone = false;
  if (!guarena) {
    ov = document.createElement('div');
    ov.className = 'dive-ov';
    ov.innerHTML = '<div><b></b><span class="mono"></span></div>';
    ov.querySelector('b').textContent = name;
    ov.querySelector('span').textContent = t('m.levantando');
    document.body.append(ov);
  }
  document.documentElement.classList.add('diving');
  lenis?.stop();
  tip.style.opacity = 0;
  const go = async () => {
    if (gone) return;
    gone = true;
    if (guarena) {
      try { const s = await world.snapshot(); if (s) sessionStorage.setItem(RELEVO, JSON.stringify({ ...s, t: Date.now() })); } catch { /* sin relevo: la página tiene su propia imagen */ }
      location.href = href;
      return;
    }
    ov.classList.add('on');
    setTimeout(() => { location.href = href; }, 520);
  };
  // un clic durante el descenso (o Esc) salta directamente al pueblo
  (ov || document).addEventListener(ov ? 'click' : 'pointerdown', go, { once: true });
  addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { removeEventListener('keydown', esc); go(); } });
  if (!world.dive(idx, go)) go();
}
// ir a un pueblo: si el mundo está a la vista, con el descenso de cámara; si no, navegación normal
function follow(href) {
  const id = href.startsWith('guarena.html') ? '06060' : href.split('#')[1];
  const idx = world ? world.munis.findIndex((m) => m.id === id) : -1;
  if (!world || reduced || world.diving || idx < 0 || canvas.style.visibility === 'hidden') { location.href = href; return; }
  enterTown(href, world.munis[idx].n, idx);
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="guarena.html"], a[href^="pueblo.html#"], a[href^="town.html#"]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || world?.diving) return;
  const href = a.getAttribute('href');
  // (jugar: directamente, sin formulario por medio; la lista de espera tiene su sitio en la portada)
  if (!world || reduced || canvas.style.visibility === 'hidden') return;
  e.preventDefault();
  follow(href);
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
    ld.status.textContent = t('m.sin3d');
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
  ld.status.textContent = t('m.listo');
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
    const H = { pueblo: t('hud.pueblo'), comarca: t('hud.comarca'), region: t('hud.region') };
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
    ...['inicio', 'vuelo', 'manifiesto', 'origen', 'mundo', 'juego', 'los388', 'ruta', 'diario', 'ayuntamientos', 'comunidad', 'unete'].map((k) => [`#${k}`, t(`sec.${k}`)]),
  ];
  for (const [sel, label] of secs) {
    ScrollTrigger.create({ trigger: sel, start: 'top 50%', end: 'bottom 50%', onToggle: (s) => { if (s.isActive) $('#hud-sec').textContent = label; } });
  }
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (s) => { $('#hud-bar').style.transform = `scaleX(${s.progress})`; } });
  const navLinks = $$('.nav ul a[href^="#"]'); // (solo las secciones de esta página; «EN» lleva a otra)
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
  try { data = await getJSON('data/guarena.json'); } catch { return; }
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
  pop: ['linear-gradient(90deg,#141b38,#7a7790)', ...t('r.pop')],
  loss: ['linear-gradient(90deg,#b5381e,#2a2633 50%,#3f9a72)', ...t('r.loss')],
  alt: ['linear-gradient(90deg,#1e3a22,#8e8b84)', ...t('r.alt')],
  votes: ['linear-gradient(90deg,#141b38,#ff9a3c)', ...t('r.votes')],
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
    tip.innerHTML = `<h4>${m.n}</h4><div class="row"><span>${m.id} · ${f.prov}</span><b>${t(m.id === HOME ? 'tip.despierto' : 'tip.auto')}</b></div><div class="row"><span>${t('tip.hab')}</span><b>${f.pop}</b></div><div class="row"><span>${t('tip.desde')}</span><b>${f.chg}</b></div><div class="row"><span>${t('tip.alt')}</span><b>${f.alt}</b></div>${votes[m.id] ? `<div class="row"><span>${t('tip.votos')}</span><b>${votes[m.id]}</b></div>` : ''}`;
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
  stt.querySelector('span').textContent = t(home ? 'st.home' : 'st.auto');
  renderQueue(m);
  const acts = $('#s-actions');
  acts.innerHTML = '';
  if (home) {
    $('#s-note').textContent = t('note.home');
    acts.innerHTML = `<a class="btn primary" href="${page('guarena.html?jugar')}">${t('a.jugar')} <span class="arr" aria-hidden="true">→</span></a><a class="btn" href="${page('guarena.html')}">${t('a.gemelo')}</a>`;
  } else {
    const n = votes[m.id] || 0;
    const mine = myVote === m.id;
    $('#s-note').textContent = t('note.auto', { n });
    const b = document.createElement('button');
    b.className = 'btn primary';
    b.type = 'button';
    b.textContent = mine ? t('a.tuvoto') : t('a.despertar', { name: m.n });
    b.disabled = mine;
    b.addEventListener('click', () => castVote(m.id));
    const j = document.createElement('a');
    j.className = 'btn';
    j.href = '#unete';
    j.textContent = t('cola.apuntate', { name: m.n });
    j.addEventListener('click', () => { $('#f-town').value = m.n; updatePassport(); });
    const v = document.createElement('a');
    v.className = 'btn';
    v.href = page(`pueblo.html#${m.id}`);
    v.innerHTML = `${t('a.entrar')} <span class="arr" aria-hidden="true">→</span>`;
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
  $('#f-count').textContent = t('f.count', { n: fmt.format(n), loss: kind === 'loss' });
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
    ? top.map(([id, n]) => { const m = munis.find((x) => x.id === id); return `<li><span>${m ? m.n : id}</span><span>${t('v.votos', { n })}</span></li>`; }).join('')
    : `<li><span class="muted">${t('v.vacio')}</span></li>`;
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
  if (SHARED) {
    try {
      await sendVote(id);
      votes = (await loadVotes()) || votes;
      renderVotes();
      return;
    } catch (err) {
      console.warn('voto no guardado', err?.message);
    }
  }
  // respaldo local: solo cuenta en este navegador
  if (prev && votes[prev]) votes[prev]--;
  votes[id] = (votes[id] || 0) + 1;
  if (prev && votes[prev] === 0) delete votes[prev];
  renderVotes();
}
// ---------------- colas por pueblo: vecinos apuntados hacia los que despiertan un pueblo ----------------
let counts = null; // {pueblos: {INE: n}, total}
async function loadCounts() {
  try { counts = await loadSignupCounts(); } catch { counts = null; }
  renderCounts();
}
function bar(n) { return `<div class="qbar" aria-hidden="true"><i style="width:${Math.min(100, (n / META_DESPERTAR) * 100).toFixed(1)}%"></i></div>`; }
function renderQueue(m) {
  const box = $('#s-queue');
  if (!box) return;
  if (!counts || !m) { box.hidden = true; return; }
  const n = counts.pueblos[m.id] || 0;
  box.hidden = false;
  box.innerHTML = m.id === HOME
    ? `<div class="qt"><b>${t('cola.despierto', { n })}</b></div>`
    : `<div class="qt"><b>${t('cola.apuntados', { n })}</b><span>${t('cola.faltan', { n, meta: META_DESPERTAR })}</span></div>${bar(n)}`;
}
function renderCounts() {
  const box = $('#queues');
  if (!counts) { if (box) box.hidden = true; return; }
  $('#c-list').textContent = fmt.format(counts.total);
  $('#c-list').parentElement.hidden = false;
  if (box) {
    box.hidden = false;
    $('#q-total').textContent = t('cola.total', { n: counts.total });
    const top = Object.entries(counts.pueblos).sort((a, b) => b[1] - a[1]).slice(0, 5);
    $('#q-top').innerHTML = top.length
      ? top.map(([id, n]) => {
        const m = munis.find((x) => x.id === id);
        return `<li><div class="row"><span>${m ? m.n : id}</span><span>${n}/${META_DESPERTAR}</span></div>${bar(n)}</li>`;
      }).join('')
      : `<li class="hint">${t('cola.vacia')}</li>`;
  }
  if (selected >= 0) renderQueue(munis[selected]);
}

// ---------------- diario de obra: los últimos cambios de la web y del juego, de sus repositorios públicos ----------------
const REPOS = [['nestorguerra/388-pueblos', 'web'], ['nestorguerra/guarena-hq', 'juego']];
async function loadDiary() {
  const list = $('#diary');
  if (!list) return;
  let items = null;
  try { const c = JSON.parse(sessionStorage.getItem('388p:diario') || 'null'); if (c && Date.now() - c.t < 600000) items = c.items; } catch { /* ignore */ }
  if (!items) {
    try {
      const all = await Promise.all(REPOS.map(async ([repo, kind]) => {
        const r = await getJSON(`https://api.github.com/repos/${repo}/commits?per_page=8`, { retries: 1, timeout: 10000 });
        return r.map((c) => ({ kind, title: (c.commit.message || '').split('\n')[0].trim(), url: c.html_url, date: c.commit.author?.date || c.commit.committer?.date }));
      }));
      items = all.flat().filter((x) => x.title && !/^Merge /.test(x.title)).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
      try { sessionStorage.setItem('388p:diario', JSON.stringify({ t: Date.now(), items })); } catch { /* ignore */ }
    } catch {
      list.innerHTML = `<li class="muted">${t('d.error')}</li>`;
      return;
    }
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  list.replaceChildren(...items.map((x) => {
    const li = document.createElement('li');
    const d = new Date(x.date); const day = new Date(d); day.setHours(0, 0, 0, 0);
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.innerHTML = `<span class="tag ${x.kind}">${t(x.kind === 'juego' ? 'diario.juego' : 'diario.web')}</span>`;
    meta.append(t('diario.hace', { d: Math.max(0, Math.round((today - day) / 86400000)) }));
    const a = document.createElement('a');
    a.href = x.url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = x.title;
    li.append(meta, a);
    return li;
  }));
}
function initDiary() {
  const sec = $('#diario');
  if (!sec) return;
  const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); loadDiary(); } }, { rootMargin: '600px 0px' });
  io.observe(sec);
}

// ---------------- comunidad en Discord ----------------
function initDiscord() {
  const b = $('#discord');
  if (!b || !DISCORD_URL) return;
  b.href = DISCORD_URL;
  b.target = '_blank';
  b.rel = 'noopener';
  b.removeAttribute('aria-disabled');
  b.innerHTML = `${t('discord.entrar')} <span aria-hidden="true">↗</span>`;
}

async function initData() {
  try { myVote = localStorage.getItem(LS); } catch {}
  if (myVote && !db) { votes[myVote] = 1; renderVotes(); }
  const c = window.claude;
  if (!c?.use) {
    if (SHARED) {
      loadCounts();
      wake();
      const load = async () => { try { votes = (await loadVotes()) || votes; renderVotes(); } catch {} };
      load();
      setInterval(() => { if (!document.hidden) load(); }, 30000);
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
  if (r.count && window.claude?.use) $('#pp-no').textContent = t('pp.fundador');
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
  $('#pp-who').textContent = alias || t('pp.nombre');
  $('#pp-town').textContent = m ? m.n : town || t('pp.pueblo');
  $('#pp-ine').textContent = m ? m.id : '—';
  $('#pp-ll').textContent = m ? `${m.ll[0].toFixed(3)}°N ${Math.abs(m.ll[1]).toFixed(3)}°W` : '—';
}
function initForm() {
  $('#towns').innerHTML = [...munis].sort((a, b) => a.n.localeCompare(b.n, 'es')).map((m) => `<option value="${m.n}"></option>`).join('');
  for (const b of $$('#roles [data-role]')) b.addEventListener('click', () => setRole(b.dataset.role));
  $('#f-alias').addEventListener('input', updatePassport);
  $('#f-town').addEventListener('input', updatePassport);
  // desde la página de ayuntamientos: ?perfil=Ayuntamiento deja elegido ese perfil
  const perfil = new URLSearchParams(location.search).get('perfil');
  if (perfil && $(`#roles [data-role="${CSS.escape(perfil)}"]`)) setRole(perfil);
  // desde la página de un pueblo («Apúntate por…»): ?pueblo=<INE> deja el pueblo elegido y baja a la lista
  const pre = new URLSearchParams(location.search).get('pueblo') || (perfil ? '' : null);
  const pm = pre && munis.find((x) => x.id === pre);
  if (pm) { $('#f-town').value = pm.n; updatePassport(); }
  if (pm || perfil) setTimeout(() => (lenis ? lenis.scrollTo('#unete', { offset: -40 }) : $('#unete').scrollIntoView()), 900);
  const msg = $('#f-msg');
  $('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'formmsg';
    const email = $('#f-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = t('fm.email'); msg.classList.add('err'); $('#f-email').focus(); return; }
    if (!$('#f-age').checked) { msg.textContent = t('fm.edad'); msg.classList.add('err'); return; }
    if (!$('#f-ok').checked) { msg.textContent = t('fm.ok'); msg.classList.add('err'); return; }
    const town = munis.find((x) => norm(x.n) === norm($('#f-town').value.trim()));
    const entry = { alias: $('#f-alias').value.trim().slice(0, 40), email, pueblo: town ? town.id : null, pueblo_texto: town ? '' : $('#f-town').value.trim().slice(0, 60), perfil: role, origen: 'formulario', edad14: true, acepto: true, web: $('#f-web').value };
    const btn = $('#form [type=submit]');
    btn.disabled = true;
    msg.textContent = t('fm.guardando');
    try {
      await saveSignup(entry);
      markListed();
      msg.innerHTML = '';
      if (town && counts) msg.append(`${t('cola.eres', { n: (counts.pueblos[town.id] || 0) + 1, name: town.n, meta: META_DESPERTAR })} `);
      else msg.append(`${t('fm.apuntado', { name: town?.n })} `);
      const go = document.createElement('a');
      go.href = page('guarena.html?jugar');
      go.textContent = t('fm.entrar');
      msg.append(go);
      if (DISCORD_URL) {
        const d = document.createElement('a');
        d.href = DISCORD_URL; d.target = '_blank'; d.rel = 'noopener';
        d.textContent = ` · ${t('discord.entrar')} ↗`;
        msg.append(d);
      }
      loadCounts();
      msg.classList.add('ok');
      $('#pp-no').textContent = t('pp.fundador');
    } catch (err) {
      if (!err.status && (SHARED || window.claude?.use)) {
        // sin conexión o el servidor despertando: se guarda aquí y se envía sola en cuanto se pueda
        queueSignup(entry);
        markListed();
        msg.textContent = t('fm.cola');
        msg.classList.add('ok');
        $('#pp-no').textContent = t('pp.fundador');
        return;
      }
      msg.textContent = t(err.status === 429 ? 'fm.429' : err.status === 400 ? 'fm.400' : SHARED || window.claude?.use ? 'fm.error' : 'fm.preview');
      msg.classList.add('err');
    } finally {
      btn.disabled = false;
    }
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
  initDiary();
  initDiscord();
  initRedes();
  if (munis.length) {
    initMapUI();
    initNames();
    initForm();
    initData();
    initLive();
  } else {
    // sin 3D: cargamos los datos para el resto de la página
    getJSON('data/municipios.json').then((d) => {
      munis = d.m.map((m, i) => Object.assign(m, { _i: i }));
      initMapUI();
      initNames();
      initForm();
      initData();
    }).catch(() => {});
  }
}

boot();
