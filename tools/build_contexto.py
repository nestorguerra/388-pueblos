"""Neighbouring provinces outlines (faint context lines) in the same local frame as municipios.json.

usage: python3 build_contexto.py <provinces.topo.json> <out.json>
"""
import json
import sys

sys.path.insert(0, sys.path[0])
from utm import utm  # noqa: E402
from build_municipios_lib import simplify  # noqa: E402

CX, CY, Q = 751384.4, 4305144.6, 25.0
NEIGH = {"37": "Salamanca", "05": "Ávila", "45": "Toledo", "13": "Ciudad Real", "14": "Córdoba", "41": "Sevilla", "21": "Huelva", "06": "Badajoz", "10": "Cáceres"}
topo = json.load(open(sys.argv[1]))
sx, sy = topo["transform"]["scale"]
tx, ty = topo["transform"]["translate"]

def arc_pts(i):
    a = topo["arcs"][i if i >= 0 else ~i]
    x = y = 0
    pts = []
    for dx, dy in a:
        x += dx
        y += dy
        ux, uy = utm(y * sy + ty, x * sx + tx)
        pts.append((ux - CX, uy - CY))
    return pts if i >= 0 else pts[::-1]

out = []
for g in topo["objects"]["provinces"]["geometries"]:
    pid = str(g["id"])
    if pid not in NEIGH:
        continue
    polys = g["arcs"] if g["type"] == "MultiPolygon" else [g["arcs"]]
    rings = []
    for poly in polys:
        ring = []
        for a in poly[0]:
            seg = arc_pts(a)
            ring += seg if not ring else seg[1:]
        ring = simplify(ring, 400.0)
        if len(ring) > 3:
            rings.append([v for x, y in ring for v in (round(x / Q), round(y / Q))])
    out.append({"id": pid, "n": NEIGH[pid], "r": rings})
json.dump({"q": Q, "p": out}, open(sys.argv[2], "w"), ensure_ascii=False, separators=(",", ":"))
print(len(out), sum(len(r) // 2 for p in out for r in p["r"]))
