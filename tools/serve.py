"""Servidor local de desarrollo para 388 Pueblos.

Sirve la carpeta web/ y envuelve index.html (escrito como fragmento, igual que se publica
como Artifact) en el mismo esqueleto HTML que añade la plataforma al publicar.

uso: python3 tools/serve.py [puerto]
"""
import http.server
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web")
SKELETON_HEAD = (
    "<!doctype html><html lang=\"es\"><head><meta charset=utf8>"
    "<meta name=viewport content=\"width=device-width,initial-scale=1,viewport-fit=cover\">"
    "<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);"
    "padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}"
    "img{max-width:100%}[hidden]{display:none!important}</style></head><body>"
)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?")[0].split("#")[0]
        if path in ("/", "/index.html"):
            with open(os.path.join(ROOT, "index.html"), "rb") as f:
                body = SKELETON_HEAD.encode() + f.read() + b"</body></html>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8388
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
