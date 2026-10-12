"""Descarga los ZIP de edificios INSPIRE del Catastro para cada municipio.

uso: python3 -I fetch_catastro.py <ine2url.json> <carpeta_salida> <cacert.pem>
ine2url.json: {"06060": "https://www.catastro.hacienda.gob.es/INSPIRE/Buildings/06/06060-GUAREÑA/A.ES.SDGC.BU.06060.zip", ...}
El emparejamiento INE -> Catastro se hace por nombre: los códigos del Catastro no siempre coinciden con los del INE.
"""
import concurrent.futures as cf
import json
import os
import ssl
import sys
import urllib.parse
import urllib.request

mapping = json.load(open(sys.argv[1]))
out = sys.argv[2]
ctx = ssl.create_default_context(cafile=sys.argv[3])


def fetch(item):
    ine, url = item
    dest = os.path.join(out, f"{ine}.zip")
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return ine, "cached"
    q = urllib.parse.quote(url, safe=":/")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(q, context=ctx, timeout=300) as r:
                data = r.read()
            with open(dest + ".part", "wb") as f:
                f.write(data)
            os.replace(dest + ".part", dest)
            return ine, len(data)
        except Exception as e:  # noqa: BLE001
            err = e
    return ine, f"FAIL {err}"


with cf.ThreadPoolExecutor(max_workers=6) as ex:
    done = 0
    for ine, res in ex.map(fetch, sorted(mapping.items())):
        done += 1
        if isinstance(res, str) and res.startswith("FAIL"):
            print(ine, res, flush=True)
        if done % 50 == 0:
            print("progreso", done, flush=True)
print("fin")
