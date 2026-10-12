// Iconos de las redes de 388 Pueblos (TikTok, Instagram y Discord) en el pie de las páginas: <ul class="social"
// data-redes>. Los perfiles están en config.js; mientras uno no exista, su icono sale atenuado y dice «muy pronto».
import { TIKTOK_URL, INSTAGRAM_URL, DISCORD_URL } from './config.js';
import { t, addTexts } from './i18n.js';

addTexts({
  es: { 'redes.en': ({ name }) => `388 Pueblos en ${name}`, 'redes.pronto': ({ name }) => `${name} · muy pronto` },
  en: { 'redes.en': ({ name }) => `388 Pueblos on ${name}`, 'redes.pronto': ({ name }) => `${name} · coming soon` },
});

// (formas de Simple Icons, CC0; la de Instagram, dibujada aquí con el mismo trazo)
const REDES = [
  {
    id: 'tiktok', name: 'TikTok', url: TIKTOK_URL,
    d: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
  },
  {
    id: 'instagram', name: 'Instagram', url: INSTAGRAM_URL,
    d: 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm5.3-4.1a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z',
  },
  {
    id: 'discord', name: 'Discord', url: DISCORD_URL,
    d: 'M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.445.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.1 14.1 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.009c.12.099.246.198.373.292a.077.077 0 0 1-.007.128 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.029 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.029zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.332-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.332-.946 2.418-2.157 2.418z',
  },
];

const CSS = `
ul.social { display: flex; flex-wrap: wrap; gap: 0.6rem; list-style: none; margin: 0; padding: 0; }
.social a { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--linea, rgba(186, 198, 255, 0.16)); color: var(--cal, #eef0ec); transition: color 0.2s ease, border-color 0.2s ease, background-color 0.2s ease; }
.social a:hover, .social a:focus-visible { color: var(--noche, #070a14); background-color: var(--sodio, #ffa94d); border-color: var(--sodio, #ffa94d); }
.social a[aria-disabled="true"] { opacity: 0.72; cursor: default; }
.social a[aria-disabled="true"]:hover { color: var(--cal, #eef0ec); background-color: transparent; border-color: var(--linea, rgba(186, 198, 255, 0.16)); }
.social svg { width: 18px; height: 18px; fill: currentColor; }
`;

export function initRedes() {
  const lists = document.querySelectorAll('[data-redes]');
  if (!lists.length) return;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.append(st);
  for (const ul of lists) {
    ul.innerHTML = REDES.map(() => '<li><a><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path/></svg></a></li>').join('');
    ul.querySelectorAll('a').forEach((a, i) => {
      const r = REDES[i];
      a.querySelector('path').setAttribute('d', r.d);
      a.dataset.red = r.id;
      const label = t(r.url ? 'redes.en' : 'redes.pronto', { name: r.name });
      a.setAttribute('aria-label', label);
      a.title = label;
      if (r.url) {
        a.href = r.url;
        a.target = '_blank';
        a.rel = 'noopener me';
      } else {
        a.setAttribute('role', 'link');
        a.setAttribute('aria-disabled', 'true');
      }
    });
  }
}
