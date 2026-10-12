// Descargas robustas: tiempo límite y reintentos con espera creciente (redes móviles que se cortan, un CDN lento).
// Un 404 no se reintenta: el archivo no existe.
export async function getJSON(url, { timeout = 20000, retries = 2 } = {}) {
  for (let i = 0; ; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
      return await r.json();
    } catch (err) {
      if (i >= retries || err.status === 404) throw err;
      await new Promise((res) => setTimeout(res, 700 * 2 ** i));
    } finally {
      clearTimeout(t);
    }
  }
}

// Lanza la página de destino por adelantado mientras dura una animación de entrada (Chrome y Edge: la página está
// lista al llegar). En los demás navegadores, al menos se adelanta la descarga de sus datos.
export function prerender(href, dataUrl) {
  try {
    const abs = new URL(href, location.href).href;
    if (HTMLScriptElement.supports?.('speculationrules')) {
      const s = document.createElement('script');
      s.type = 'speculationrules';
      s.textContent = JSON.stringify({ prerender: [{ source: 'list', urls: [abs] }] });
      document.head.append(s);
    }
    if (dataUrl) {
      const l = document.createElement('link');
      l.rel = 'prefetch';
      l.as = 'fetch';
      l.crossOrigin = 'anonymous';
      l.href = dataUrl;
      document.head.append(l);
    }
  } catch { /* es solo una ayuda */ }
}

// En una página lanzada por adelantado, lo que se ve o se guarda espera a que la persona llegue de verdad
export function whenShown(fn) {
  if (document.prerendering) document.addEventListener('prerenderingchange', () => fn(true), { once: true });
  else fn(false);
}
