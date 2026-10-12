"""Genera el dossier para ayuntamientos en PDF con Chrome sin ventana, a partir de web/dossier.html.

Hace falta la web servida en local (python3 server/servidor.py --port 8388) para que el dossier cargue sus datos.

uso:
  python3 tools/dossier_pdf.py                      → web/assets/dossier/388-pueblos-dossier-ayuntamientos.pdf
  python3 tools/dossier_pdf.py 06149 10148          → además, uno personalizado por cada código INE (en dist/dossier/)
  BASE=http://127.0.0.1:8388 CHROME=/ruta/a/chrome python3 tools/dossier_pdf.py
"""
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
BASE = os.environ.get("BASE", "http://127.0.0.1:8388").rstrip("/")
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")


def pdf(url, out):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if os.path.exists(out):
        os.remove(out)
    profile = tempfile.mkdtemp(prefix="dossier-chrome-")
    p = subprocess.Popen(
        [CHROME, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
         f"--user-data-dir={profile}", "--no-pdf-header-footer", "--virtual-time-budget=15000",
         "--run-all-compositor-stages-before-draw", f"--print-to-pdf={out}", url],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    # (Chrome a veces no se cierra solo tras imprimir: se espera a que el PDF deje de crecer y se cierra)
    last, t0 = -1, time.time()
    while time.time() - t0 < 120:
        time.sleep(1)
        if os.path.exists(out):
            size = os.path.getsize(out)
            if size > 0 and size == last:
                break
            last = size
        if p.poll() is not None and os.path.exists(out):
            break
    try:
        os.killpg(p.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    shutil.rmtree(profile, ignore_errors=True)
    if not os.path.exists(out) or os.path.getsize(out) == 0:
        sys.exit(f"No se pudo generar {out}")
    print(f"{out} · {os.path.getsize(out) // 1024} KB")


pdf(f"{BASE}/dossier.html", os.path.join(ROOT, "web", "assets", "dossier", "388-pueblos-dossier-ayuntamientos.pdf"))
for ine in sys.argv[1:]:
    pdf(f"{BASE}/dossier.html?ine={ine}", os.path.join(ROOT, "dist", "dossier", f"388-pueblos-dossier-{ine}.pdf"))
