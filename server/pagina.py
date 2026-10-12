"""Convierte las páginas de web/ en documentos HTML completos, igual en el servidor propio y en la web estática.

web/index.html está escrita como fragmento (así se publica también como Artifact de claude.ai): aquí recibe el
esqueleto del documento, con su <title>, sus <meta> y sus <link> iniciales subidos al <head>, donde los buscan los
buscadores y las redes sociales. Las demás páginas ya son documentos completos y solo reciben la configuración.
"""
import re

RESET = (
    b"<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);"
    b"padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}"
    b"img{max-width:100%}[hidden]{display:none!important}</style>"
)
HEAD_TAG = re.compile(rb'\s*(<title>.*?</title>|<meta\b[^>]*>|<link\b[^>]*>|<script type="(?:application/ld\+json|importmap)">.*?</script>)', re.S)


def config_script(api):
    return b'<script>window.P388={api:"' + api.encode() + b'"};</script>' if api else b""


def documento(fragment, api=None):
    """fragment: bytes de una página de web/. api: URL base de la API propia ("/api") o None."""
    inject = config_script(api)
    if fragment.lstrip()[:15].lower().startswith(b"<!doctype"):
        return fragment.replace(b"</head>", inject + b"</head>", 1) if inject else fragment
    head, pos = [], 0
    while True:
        m = HEAD_TAG.match(fragment, pos)
        if not m:
            break
        head.append(m.group(1))
        pos = m.end()
    return (
        b'<!doctype html><html lang="es"><head><meta charset="utf-8">'
        b'<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        + b"\n".join(head) + RESET + inject + b"</head><body>" + fragment[pos:] + b"</body></html>"
    )
