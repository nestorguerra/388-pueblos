// Lista de espera de la beta. Estamos en pruebas: la primera vez que alguien quiere jugar se apunta con su email y
// entra al momento («apúntate y entra»). Lo usan la portada, Guareña y las páginas de los demás pueblos.
import { SHARED, sendSignup } from './backend.js';

const LS = '388p:lista';     // ya apuntado en este dispositivo
const PEND = '388p:lista-pendiente'; // inscripción que no pudo guardarse (se reintenta en la siguiente visita)
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export function isListed() {
  try { return !!localStorage.getItem(LS); } catch { return false; }
}
export function markListed() {
  try { localStorage.setItem(LS, String(Date.now())); } catch { /* ignore */ }
}

// Guarda una inscripción: base de datos del Artifact (en claude.ai), hoja de Google o servidor propio
export async function saveSignup(entry) {
  const c = window.claude;
  if (c?.use) {
    const [db, user] = await Promise.all([c.use('db'), c.use('user')]);
    const uid = user ? await user.id() : null;
    if (!db || !uid) throw new Error('sin base de datos');
    await db.doc(`lista/${uid}`).set({ alias: entry.alias || '', email: entry.email, pueblo: entry.pueblo || null, perfil: entry.perfil || 'Jugador', origen: entry.origen || null, t: Date.now() });
    return;
  }
  if (!SHARED) throw new Error('sin almacén');
  await sendSignup(entry);
}

// Reintento de una inscripción que se quedó sin guardar (sin conexión, servidor dormido…)
(async () => {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(PEND) || 'null'); } catch { /* ignore */ }
  if (!p || !p.email) return;
  try { await saveSignup(p); localStorage.removeItem(PEND); } catch { /* otra vez será */ }
})();

const CSS = `
.lgate { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; padding: 16px; background: rgba(4, 6, 14, 0.62); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); opacity: 0; transition: opacity 0.35s ease; }
.lgate.on { opacity: 1; }
.lgate .box { width: min(460px, 100%); max-height: calc(100dvh - 32px); overflow: auto; background: var(--noche-2, #0d1326); color: var(--cal, #eef0ec); border: 1px solid var(--linea, rgba(186,198,255,.16)); border-radius: 22px; padding: 1.5rem 1.4rem 1.3rem; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5); transform: translateY(12px) scale(0.98); transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1); font-family: var(--f-display, system-ui, sans-serif); }
.lgate.on .box { transform: none; }
.lgate .k { font-family: var(--f-mono, ui-monospace, monospace); font-size: 0.68rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--sodio, #ffa94d); display: flex; gap: 0.5rem; align-items: center; }
.lgate .k i { width: 7px; height: 7px; border-radius: 50%; background: var(--sodio, #ffa94d); box-shadow: 0 0 10px var(--sodio, #ffa94d); }
.lgate h2 { margin: 0.7rem 0 0.5rem; font-size: clamp(1.5rem, 5vw, 1.9rem); line-height: 1.02; letter-spacing: -0.025em; font-weight: 750; font-variation-settings: "wdth" 112; }
.lgate h2 em { font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-style: italic; color: var(--sodio-2, #ffcf91); }
.lgate p { margin: 0 0 1rem; color: var(--niebla, #9ba4c8); font-size: 0.95rem; line-height: 1.5; }
.lgate label.f { display: grid; gap: 0.35rem; margin-bottom: 0.75rem; font-family: var(--f-mono, monospace); font-size: 0.68rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--niebla, #9ba4c8); }
.lgate input[type=email], .lgate input[type=text] { font: 1rem/1.3 var(--f-display, system-ui, sans-serif); letter-spacing: 0; text-transform: none; color: var(--cal, #eef0ec); background: rgba(255, 255, 255, 0.05); border: 1px solid var(--linea, rgba(186,198,255,.16)); border-radius: 12px; padding: 0.75rem 0.85rem; outline: none; width: 100%; box-sizing: border-box; }
.lgate input:focus-visible { border-color: var(--sodio, #ffa94d); box-shadow: 0 0 0 3px rgba(255, 169, 77, 0.25); }
.lgate .c { display: flex; gap: 0.6rem; align-items: flex-start; margin: 0.35rem 0; font-size: 0.86rem; line-height: 1.4; color: var(--cal-2, #e2e5df); cursor: pointer; }
.lgate .c input { margin-top: 0.2rem; accent-color: var(--sodio, #ffa94d); width: 1rem; height: 1rem; flex: 0 0 auto; }
.lgate .c a { color: var(--sodio-2, #ffcf91); }
.lgate .row { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; margin-top: 1rem; }
.lgate .msg { min-height: 1.2em; margin: 0.6rem 0 0; font-size: 0.85rem; color: var(--niebla, #9ba4c8); }
.lgate .msg.err { color: #ff8a7a; }
.lgate .trap { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
.lgate .free { margin-top: 1rem; padding-top: 0.9rem; border-top: 1px solid var(--linea, rgba(186,198,255,.16)); font-family: var(--f-mono, monospace); font-size: 0.66rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--niebla-2, #6c7598); }
@media (prefers-reduced-motion: reduce) { .lgate, .lgate .box { transition: none; } }
`;

let open = null;
// Abre el formulario. Resuelve true si la persona se apunta (y puede entrar), false si lo cierra.
// opts.resolveTown(texto) → INE o null; opts.onEnter() se llama dentro del clic (para abrir otra pestaña).
export function gate(opts = {}) {
  if (isListed()) return Promise.resolve(true);
  if (open) return open;
  if (!document.getElementById('lgate-css')) {
    const st = document.createElement('style');
    st.id = 'lgate-css';
    st.textContent = CSS;
    document.head.append(st);
  }
  const prevFocus = document.activeElement;
  const ov = document.createElement('div');
  ov.className = 'lgate';
  ov.innerHTML = `
    <div class="box" role="dialog" aria-modal="true" aria-labelledby="lg-t" aria-describedby="lg-d">
      <span class="k"><i></i>Beta en pruebas · lista de espera</span>
      <h2 id="lg-t">Apúntate y entra en <em>Guareña</em></h2>
      <p id="lg-d">Estamos en pruebas con lista de espera. Déjanos tu email y entras ahora mismo; te avisaremos de las novedades y de cada pueblo que despierte.</p>
      <form novalidate>
        <label class="f">Email<input type="email" name="email" autocomplete="email" inputmode="email" required placeholder="tu@email.com"></label>
        <label class="f">Tu pueblo (opcional)<input type="text" name="pueblo" autocomplete="off" maxlength="60" placeholder="De dónde eres o de dónde te sientes"></label>
        <input class="trap" type="text" name="web" tabindex="-1" autocomplete="off" aria-hidden="true">
        <label class="c"><input type="checkbox" name="edad"> Tengo 14 años o más. Si tengo menos, me apunta mi madre, mi padre o mi tutor.</label>
        <label class="c"><input type="checkbox" name="ok"> He leído la <a href="privacidad.html" target="_blank" rel="noopener">política de privacidad</a> y acepto que guardéis mi email para avisarme del proyecto.</label>
        <div class="row"><button class="btn primary" type="submit">Entrar a jugar <span aria-hidden="true">→</span></button><button class="btn" type="button" data-x>Ahora no</button></div>
        <p class="msg" role="status" aria-live="polite"></p>
      </form>
      <div class="free">Entrar en los 388 pueblos es y será gratis</div>
    </div>`;
  document.body.append(ov);
  requestAnimationFrame(() => ov.classList.add('on'));
  const f = ov.querySelector('form');
  const msg = ov.querySelector('.msg');
  setTimeout(() => f.email.focus(), 60);

  open = new Promise((resolve) => {
    const close = (ok) => {
      removeEventListener('keydown', onKey, true);
      ov.classList.remove('on');
      setTimeout(() => ov.remove(), 350);
      open = null;
      try { prevFocus?.focus?.(); } catch { /* ignore */ }
      resolve(ok);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(false); }
      if (e.key === 'Tab') { // el foco no sale del diálogo
        const els = [...ov.querySelectorAll('input:not(.trap), button, a')];
        const i = els.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); els[els.length - 1].focus(); }
        else if (!e.shiftKey && i === els.length - 1) { e.preventDefault(); els[0].focus(); }
      }
    };
    addEventListener('keydown', onKey, true);
    ov.querySelector('[data-x]').addEventListener('click', () => close(false));
    ov.addEventListener('pointerdown', (e) => { if (e.target === ov) close(false); });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      msg.className = 'msg';
      const email = f.email.value.trim();
      if (!EMAIL.test(email)) { msg.textContent = 'Escribe un email válido.'; msg.classList.add('err'); f.email.focus(); return; }
      if (!f.edad.checked) { msg.textContent = 'Marca la casilla de edad. Si tienes menos de 14 años, pide a un adulto que te apunte.'; msg.classList.add('err'); return; }
      if (!f.ok.checked) { msg.textContent = 'Necesitamos tu permiso para guardar el email.'; msg.classList.add('err'); return; }
      const texto = f.pueblo.value.trim();
      const ine = opts.resolveTown ? opts.resolveTown(texto) : null;
      const entry = { email, alias: '', pueblo: ine, pueblo_texto: texto.slice(0, 60), perfil: 'Jugador', origen: 'jugar', edad14: true, acepto: true, web: f.web.value };
      markListed();
      // se entra ya; la inscripción se guarda por detrás y, si no puede, se reintenta en la próxima visita
      saveSignup(entry).catch(() => { try { localStorage.setItem(PEND, JSON.stringify(entry)); } catch { /* ignore */ } });
      if (opts.onEnter) opts.onEnter();
      close(true);
    });
  });
  return open;
}
