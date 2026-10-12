"""Empaqueta web/ como web estática para un CDN (Render Static Site): dist/web/.

- Cada página se convierte en un documento HTML completo (server/pagina.py), con la URL de la API propia si se da.
- Los JS y CSS llevan ?v=<huella del contenido> en todas sus referencias (HTML e imports entre módulos), así el CDN
  y el navegador pueden guardarlos un año sin riesgo de servir versiones viejas tras un despliegue.
- Escribe robots.txt y sitemap.xml para la URL pública.

uso: python3 tools/build_web.py [--api https://…/api] [--site https://…]
"""
import argparse
import hashlib
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
sys.path.insert(0, os.path.join(ROOT, "server"))
from pagina import documento  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--api", default=os.environ.get("API_URL", ""))
ap.add_argument("--site", default=os.environ.get("SITE_URL", ""))
ap.add_argument("--out", default=os.path.join(ROOT, "dist", "web"))
args = ap.parse_args()

SRC = os.path.join(ROOT, "web")
OUT = args.out
shutil.rmtree(OUT, ignore_errors=True)
shutil.copytree(SRC, OUT)

# huella común de todo el código (si cambia cualquier JS o CSS, cambian todas las URLs versionadas)
h = hashlib.sha1()
for d in ("js", "css"):
    for name in sorted(os.listdir(os.path.join(SRC, d))):
        with open(os.path.join(SRC, d, name), "rb") as f:
            h.update(name.encode() + f.read())
V = h.hexdigest()[:10]

LOCAL_ASSET = re.compile(r'((?:src|href)=")((?:\./)?(?:js|css)/[\w.-]+\.(?:js|css))(")')
JS_IMPORT = re.compile(r"""((?:from|import)\s*\(?\s*['"])(\.\.?/[\w./-]+\.js)(['"])""")


def version_js(text):
    return JS_IMPORT.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={V}{m.group(3)}", text)


n_html = 0
for name in os.listdir(OUT):
    if not name.endswith(".html"):
        continue
    p = os.path.join(OUT, name)
    with open(p, "rb") as f:
        body = documento(f.read(), args.api or None).decode("utf-8")
    body = LOCAL_ASSET.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={V}{m.group(3)}", body)
    body = re.sub(r"(<script type=\"module\">)(.*?)(</script>)", lambda m: m.group(1) + version_js(m.group(2)) + m.group(3), body, flags=re.S)
    with open(p, "w", encoding="utf-8") as f:
        f.write(body)
    n_html += 1

for name in os.listdir(os.path.join(OUT, "js")):
    p = os.path.join(OUT, "js", name)
    with open(p, encoding="utf-8") as f:
        text = f.read()
    with open(p, "w", encoding="utf-8") as f:
        f.write(version_js(text))

site = args.site.rstrip("/")
with open(os.path.join(OUT, "robots.txt"), "w") as f:
    f.write("User-agent: *\nAllow: /\n" + (f"Sitemap: {site}/sitemap.xml\n" if site else ""))
if site:
    urls = ["/", "/guarena.html", "/privacidad.html"]
    with open(os.path.join(OUT, "sitemap.xml"), "w") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        f.writelines(f"  <url><loc>{site}{u}</loc></url>\n" for u in urls)
        f.write("</urlset>\n")
    # las etiquetas para redes sociales necesitan URLs absolutas
    for name in os.listdir(OUT):
        if name.endswith(".html"):
            p = os.path.join(OUT, name)
            with open(p, encoding="utf-8") as f:
                body = f.read()
            body = body.replace('content="assets/logo/og-388pueblos.png"', f'content="{site}/assets/logo/og-388pueblos.png"')
            canon = f"{site}/" if name == "index.html" else f"{site}/{name}"
            if name != "pueblo.html":
                body = body.replace("</head>", f'<link rel="canonical" href="{canon}"><meta property="og:url" content="{canon}"></head>', 1)
            with open(p, "w", encoding="utf-8") as f:
                f.write(body)

print(f"dist/web listo · versión {V} · {n_html} páginas · API {args.api or '—'} · sitio {site or '—'}")
