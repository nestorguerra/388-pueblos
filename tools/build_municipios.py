"""Build compact municipalities dataset for Extremadura (388) in local UTM29 metres around Guareña.

usage: python3 build_municipios.py <municipalities.topo.json> <wikidata.json> <wd_comarca.json> <out.json>
"""
import collections
import json
import math
import sys

sys.path.insert(0, sys.path[0])
from utm import utm  # noqa: E402

topo_path, wd_path, wdc_path, out_path = sys.argv[1:5]
CX, CY = 751384.4, 4305144.6  # Plaza de España, Guareña (EPSG:25829)
Q = 25.0  # output quantum in metres
TOL = 120.0  # simplification tolerance in metres

topo = json.load(open(topo_path))
sx, sy = topo["transform"]["scale"]
tx, ty = topo["transform"]["translate"]

def decode_arc(arc):
    x = y = 0
    pts = []
    for dx, dy in arc:
        x += dx
        y += dy
        lon, lat = x * sx + tx, y * sy + ty
        ux, uy = utm(lat, lon)
        pts.append((ux - CX, uy - CY))
    return pts

def simplify(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        x1, y1 = pts[a]
        x2, y2 = pts[b]
        dx, dy = x2 - x1, y2 - y1
        n = math.hypot(dx, dy)
        dmax, idx = 0.0, -1
        for i in range(a + 1, b):
            x, y = pts[i]
            d = math.hypot(x - x1, y - y1) if n == 0 else abs(dy * x - dx * y + x2 * y1 - y2 * x1) / n
            if d > dmax:
                dmax, idx = d, i
        if idx >= 0 and dmax > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]

geoms = [g for g in topo["objects"]["municipalities"]["geometries"] if str(g.get("id", "")).startswith(("06", "10"))]
used = set()
for g in geoms:
    polys = g["arcs"] if g["type"] == "MultiPolygon" else [g["arcs"]]
    for poly in polys:
        for ring in poly:
            for a in ring:
                used.add(a if a >= 0 else ~a)
arcs = {i: simplify(decode_arc(topo["arcs"][i]), TOL) for i in used}

def ring_pts(ring):
    out = []
    for a in ring:
        seg = arcs[a] if a >= 0 else arcs[~a][::-1]
        out += seg if not out else seg[1:]
    return out

def area(pts):
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return s / 2

# Wikidata attributes
wd = collections.defaultdict(dict)
for r in json.load(open(wd_path))["results"]["bindings"]:
    k = r["ine"]["value"][:5]
    m = wd[k]
    m["name"] = r["itemLabel"]["value"]
    m["q"] = r["item"]["value"].rsplit("/", 1)[-1]
    if "coord" in r:
        lon, lat = map(float, r["coord"]["value"][6:-1].split())
        m["lat"], m["lon"] = lat, lon
    if "elev" in r:
        m["elev"] = round(float(r["elev"]["value"]))
    if "area" in r:
        a = float(r["area"]["value"])
        m["area"] = round(a / 1e6 if a > 50000 else a, 1)  # algunos valores vienen en m² (p. ej. Cáceres)
    if "demonym" in r:
        m.setdefault("dem", set()).add(r["demonym"]["value"])
    if "pop" in r and "popdate" in r:
        y = int(r["popdate"]["value"][:4])
        m.setdefault("pops", {})[y] = int(float(r["pop"]["value"]))
manc = collections.defaultdict(list)
for r in json.load(open(wdc_path))["results"]["bindings"]:
    if r.get("typeLabel", {}).get("value") == "mancomunidad":
        k = r["ine"]["value"][:5]
        v = r["valLabel"]["value"]
        if v not in manc[k]:
            manc[k].append(v)

out = []
for g in geoms:
    k = str(g["id"])
    polys = g["arcs"] if g["type"] == "MultiPolygon" else [g["arcs"]]
    rings = []
    for poly in polys:
        outer = ring_pts(poly[0])
        if len(outer) < 4:
            continue
        if area(outer) < 0:
            outer = outer[::-1]
        if abs(area(outer)) < (Q * Q * 4):
            continue
        flat = []
        for x, y in outer[:-1]:
            flat += [round(x / Q), round(y / Q)]
        rings.append(flat)
    m = wd.get(k, {})
    pops = dict(m.get("pops", {}))
    # drop obviously broken latest values (e.g. a Wikidata typo of "1")
    while len(pops) > 1:
        ys = sorted(pops)
        if pops[ys[-1]] < 0.5 * pops[ys[-2]]:
            del pops[ys[-1]]
        else:
            break
    latest_year = max(pops) if pops else None
    p_now = pops.get(latest_year) if pops else None
    p_2001 = pops.get(2001) or (pops[min(pops)] if pops else None)
    lat, lon = m.get("lat"), m.get("lon")
    ux, uy = utm(lat, lon)
    dem = sorted(m.get("dem", []), key=len)
    out.append({
        "id": k,
        "n": m.get("name") or g["properties"]["name"],
        "pr": "BA" if k.startswith("06") else "CC",
        "p": p_now,
        "py": latest_year,
        "p0": p_2001,
        "e": m.get("elev"),
        "a": m.get("area"),
        "d": dem[0] if dem else None,
        "mc": manc.get(k, [None])[0],
        "q": m.get("q"),
        "c": [round((ux - CX) / Q), round((uy - CY) / Q)],
        "ll": [round(lat, 4), round(lon, 4)],
        "r": rings,
    })

out.sort(key=lambda o: o["n"])
json.dump({"q": Q, "origin": "UTM29 EPSG:25829 (751384.4, 4305144.6) Plaza de España, Guareña", "m": out}, open(out_path, "w"), ensure_ascii=False, separators=(",", ":"))
tot = sum(o["p"] or 0 for o in out)
tot0 = sum(o["p0"] or 0 for o in out)
print("municipios", len(out), "pop", tot, "pop2001", tot0)
print("<500", sum(1 for o in out if (o["p"] or 0) < 500), "<1000", sum(1 for o in out if (o["p"] or 0) < 1000), "<2000", sum(1 for o in out if (o["p"] or 0) < 2000))
print("lost since 2001", sum(1 for o in out if o["p"] and o["p0"] and o["p"] < o["p0"]))
print("BA", sum(1 for o in out if o["pr"] == "BA"), "CC", sum(1 for o in out if o["pr"] == "CC"))
print("pts", sum(len(r) // 2 for o in out for r in o["r"]))
