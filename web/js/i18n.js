// Español e inglés. La lengua de cada página sale de <html lang>; las páginas en inglés viven en web/en/ y piden los
// datos y enlaces con ROOT («../») delante. t('clave', {variables}) devuelve el texto en la lengua de la página.
export const lang = (document.documentElement.lang || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
export const ROOT = lang === 'en' ? '../' : '';
export const locale = lang === 'en' ? 'en-GB' : 'es-ES';
export const fmt = new Intl.NumberFormat(locale);

// enlace a otra página en la misma lengua (las inglesas están en en/ con otros nombres)
const EN_PAGES = { 'index.html': 'index.html', 'guarena.html': 'guarena.html', 'pueblo.html': 'town.html', 'privacidad.html': 'privacy.html', 'ayuntamientos.html': '../ayuntamientos.html' };
export function page(href) {
  if (lang !== 'en') return href;
  const [file, rest = ''] = href.split(/(?=[?#])/);
  return (EN_PAGES[file] || `../${file}`) + rest;
}

const plural = (n, one, many) => (n === 1 ? one : many);

const T = {
  es: {
    'cola.apuntados': ({ n }) => `${n} ${plural(n, 'vecino apuntado', 'vecinos apuntados')}`,
    'cola.faltan': ({ n, meta }) => (n >= meta ? '¡Listo para despertar!' : `faltan ${meta - n} para despertar`),
    'cola.despierto': ({ n }) => `Despierto · ${n} ${plural(n, 'vecino', 'vecinos')} en la lista`,
    'cola.apuntate': ({ name }) => `Apúntate por ${name}`,
    'cola.total': ({ n }) => `${n} ${plural(n, 'persona', 'personas')} en la lista de espera`,
    'cola.vacia': 'Aún no hay nadie en la lista. El primero puede ser tu pueblo.',
    'cola.eres': ({ n, name, meta }) => (n >= meta
      ? `Eres el vecino nº ${n} de ${name} en la lista: ¡ya sois suficientes para pedir que despierte!`
      : `Eres el vecino nº ${n} de ${name} en la lista. Faltan ${meta - n} para que despierte: avisa a los tuyos.`),
    'discord.pronto': 'Abrimos el Discord muy pronto',
    'discord.entrar': 'Entrar en el Discord',
    'diario.web': 'Web',
    'diario.juego': 'Juego',
    'diario.ver': 'Ver todos los cambios',
    'diario.hace': ({ d }) => (d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`),
  },
  en: {
    'cola.apuntados': ({ n }) => `${n} ${plural(n, 'local signed up', 'locals signed up')}`,
    'cola.faltan': ({ n, meta }) => (n >= meta ? 'Ready to wake up!' : `${meta - n} more to wake it up`),
    'cola.despierto': ({ n }) => `Awake · ${n} ${plural(n, 'person', 'people')} on the list`,
    'cola.apuntate': ({ name }) => `Sign up for ${name}`,
    'cola.total': ({ n }) => `${n} ${plural(n, 'person', 'people')} on the waiting list`,
    'cola.vacia': 'Nobody on the list yet. Your town could be the first.',
    'cola.eres': ({ n, name, meta }) => (n >= meta
      ? `You are number ${n} from ${name} on the list: there are enough of you to ask for it to wake up!`
      : `You are number ${n} from ${name} on the list. ${meta - n} more needed to wake it up: tell your people.`),
    'discord.pronto': 'Our Discord opens very soon',
    'discord.entrar': 'Join the Discord',
    'diario.web': 'Web',
    'diario.juego': 'Game',
    'diario.ver': 'See every change',
    'diario.hace': ({ d }) => (d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`),
  },
};

export function t(key, vars = {}) {
  const s = T[lang][key] ?? T.es[key] ?? key;
  return typeof s === 'function' ? s(vars) : s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}
// para que cada módulo añada sus propios textos sin tocar este archivo
export function addTexts(dict) {
  for (const l of ['es', 'en']) Object.assign(T[l], dict[l] || {});
}
