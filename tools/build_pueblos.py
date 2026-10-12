"""Volumetría automática (LOD1) del casco urbano de cada municipio a partir del Catastro INSPIRE.

uso: python3 -I build_pueblos.py <carpeta_zips> <municipios.json> <osm_place_of_worship.json> <carpeta_salida> [ine ...]

- Lee <ine>.zip (descargado con fetch_catastro.py) sin extraerlo a disco.
- Centra el modelo en el núcleo urbano: parte de la coordenada de Wikidata y se ajusta
  al punto de mayor densidad edificada cercano.
- Radio según población (400–1.500 m) y como mucho 9.000 piezas, las más cercanas al centro.
- Marca la iglesia principal y hasta dos secundarias con los lugares de culto de OpenStreetMap.
- Salida: <carpeta_salida>/<ine>.json con el mismo formato que guarena.json más
  {"zone", "center", "churches"} y un resumen en <carpeta_salida>/_resumen.json.
"""
import json
import math
import os
import re
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from utm import utm  # noqa: E402

zdir, muni_path, pow_path, outdir = sys.argv[1:5]
only = set(sys.argv[5:])
os.makedirs(outdir, exist_ok=True)
munis = json.load(open(muni_path))["m"]
pows = []
for e in json.load(open(pow_path))["elements"]:
    c = e.get("center") or ({"lat": e["lat"], "lon": e["lon"]} if "lat" in e else None)
    if c:
        pows.append((c["lat"], c["lon"], e.get("tags", {}).get("name") or ""))

RE_MEMBER = re.compile(r"<gml:featureMember>(.*?)</gml:featureMember>", re.S)
RE_ID = re.compile(r"<base:localId>([^<]+)</base:localId>")
RE_FLOORS = re.compile(r"<bu-ext2d:numberOfFloorsAboveGround>(\d+)</bu-ext2d:numberOfFloorsAboveGround>")
RE_EXT = re.compile(r"<gml:exterior>.*?<gml:posList[^>]*>([^<]+)</gml:posList>", re.S)
RE_USE = re.compile(r"<bu-ext2d:currentUse>([^<]+)</bu-ext2d:currentUse>")
RE_SRS = re.compile(r"EPSG::(258\d\d)")
IGLESIA = re.compile(r"iglesia|parroquia|parroquial|templo|santa mar[ií]a|asunci[oó]n|catedral|concatedral", re.I)
NO_MAIN = re.compile(r"ermita|capilla|convento|cementerio|monasterio|santuario|hospital|colegio|basílica", re.I)


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


def area(pts):
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return s / 2


def inside(x, y, pts):
    c = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def process(m):
    ine = m["id"]
    zp = os.path.join(zdir, f"{ine}.zip")
    if not os.path.exists(zp):
        return None
    with zipfile.ZipFile(zp) as z:
        names = z.namelist()
        bp = next((n for n in names if n.endswith(".buildingpart.gml")), None)
        bb = next((n for n in names if n.endswith(".building.gml")), None)
        if not bp:
            return None
        part_txt = z.read(bp).decode("iso-8859-1")
        bld_txt = z.read(bb).decode("iso-8859-1") if bb else ""
    srs = RE_SRS.search(part_txt)
    zone = int(srs.group(1)[-2:]) if srs else 29
    uses = {}
    for mm in RE_MEMBER.finditer(bld_txt):
        body = mm.group(1)
        rid, use = RE_ID.search(body), RE_USE.search(body)
        if rid:
            uses[rid.group(1)] = use.group(1) if use else ""
    lat, lon = m["ll"]
    wx, wy = utm(lat, lon, zone)

    raw = []
    for mm in RE_MEMBER.finditer(part_txt):
        body = mm.group(1)
        lid, fl, ext = RE_ID.search(body), RE_FLOORS.search(body), RE_EXT.search(body)
        if not (lid and fl and ext):
            continue
        f = int(fl.group(1))
        if f <= 0:
            continue
        nums = list(map(float, ext.group(1).split()))
        pts = [(nums[i], nums[i + 1]) for i in range(0, len(nums) - 1, 2)]
        if len(pts) < 4:
            continue
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        raw.append((f, uses.get(lid.group(1).split("_")[0], ""), pts, cx, cy))
    if not raw:
        return {"ine": ine, "parts": 0}

    # centro: la iglesia principal más cercana a la coordenada oficial (marca el casco antiguo);
    # si no hay ninguna a menos de 900 m, la propia coordenada oficial
    bx, by = wx, wy
    best = None
    maxd = 900 if (m.get("p") or 0) < 10000 else 1600
    near_raw = [r for r in raw if abs(r[3] - wx) < 4000 and abs(r[4] - wy) < 4000]

    def footprint_at(px, py):
        # superficie de la pieza edificada que contiene el punto (o la de servicios públicos más cercana)
        hit, near = 0.0, (40.0, 0.0)
        for f, use, pts, cx, cy in near_raw:
            d = math.hypot(cx - px, cy - py)
            if d > 70:
                continue
            a = abs(area(pts))
            if inside(px, py, pts):
                hit = max(hit, a)
            elif "publicServices" in use and d < near[0]:
                near = (d, a)
        return hit or near[1]

    for plat, plon, name in pows:
        if abs(plat - lat) > 0.03 or abs(plon - lon) > 0.035:
            continue
        px, py = utm(plat, plon, zone)
        d = math.hypot(px - wx, py - wy)
        if d > maxd or not IGLESIA.search(name) or NO_MAIN.search(name):
            continue
        score = min(footprint_at(px, py), 4000) - 0.8 * d + (2500 if re.search(r"catedral", name, re.I) else 0)
        if best is None or score > best[0]:
            best = (score, px, py)
    if best is None:
        # segunda vuelta: iglesia hasta 3 km, siempre que tenga edificios alrededor
        for plat, plon, name in pows:
            if abs(plat - lat) > 0.04 or abs(plon - lon) > 0.05:
                continue
            px, py = utm(plat, plon, zone)
            d = math.hypot(px - wx, py - wy)
            if d > 3000 or not IGLESIA.search(name) or NO_MAIN.search(name):
                continue
            fp = footprint_at(px, py)
            if fp <= 0:
                continue
            score = min(fp, 4000) - 0.3 * d
            if best is None or score > best[0]:
                best = (score, px, py)
    if best:
        bx, by = best[1], best[2]
    else:
        # sin iglesia: núcleo edificado más denso del término
        cell = 120.0
        grid = {}
        for _, _, _, cx, cy in raw:
            k = (int(cx // cell), int(cy // cell))
            grid[k] = grid.get(k, 0) + 1
        if grid:
            k = max(grid, key=lambda k: sum(grid.get((k[0] + i, k[1] + j), 0) for i in (-1, 0, 1) for j in (-1, 0, 1)))
            cx0, cy0 = (k[0] + 0.5) * cell, (k[1] + 0.5) * cell
            near = [(cx, cy) for _, _, _, cx, cy in raw if math.hypot(cx - cx0, cy - cy0) < 200]
            bx = sum(p[0] for p in near) / len(near)
            by = sum(p[1] for p in near) / len(near)

    pop = m.get("p") or 200
    radius = max(400.0, min(1500.0, 380 + 5.5 * math.sqrt(pop)))
    sel = sorted((r for r in raw if math.hypot(r[3] - bx, r[4] - by) <= radius), key=lambda r: math.hypot(r[3] - bx, r[4] - by))[:9000]

    use_codes, parts, polys = {}, [], []
    for f, use, pts, cx, cy in sel:
        loc = [(x - bx, y - by) for x, y in pts]
        if loc[0] == loc[-1]:
            loc = loc[:-1]
        far = max(range(len(loc)), key=lambda i: math.hypot(loc[i][0] - loc[0][0], loc[i][1] - loc[0][1]))
        a_half = simplify(loc[: far + 1], 0.4)
        b_half = simplify(loc[far:] + [loc[0]], 0.4)
        loc = a_half[:-1] + b_half[:-1]
        if len(loc) < 3:
            continue
        a = area(loc)
        if abs(a) < 6:
            continue
        if a < 0:
            loc.reverse()
        code = use_codes.setdefault(use, len(use_codes))
        flat = []
        for x, y in loc:
            flat += [round(x * 2), round(y * 2)]
        parts.append([f, code, flat])
        polys.append((loc, abs(a), use))

    # iglesias desde OSM
    churches = []
    cands = []
    for plat, plon, name in pows:
        px, py = utm(plat, plon, zone)
        if abs(px - bx) > radius or abs(py - by) > radius:
            continue
        lx, ly = px - bx, py - by
        d = math.hypot(lx, ly)
        if d > radius:
            continue
        score = (-1000 if d < 1.0 else d) + (0 if IGLESIA.search(name) else 250) + (400 if NO_MAIN.search(name) else 0)
        cands.append((score, lx, ly, name, d))
    cands.sort()
    for score, lx, ly, name, d in cands:
        if any(math.hypot(lx - c["x"], ly - c["y"]) < 60 for c in churches):
            continue
        main = math.hypot(lx, ly) < 1.0 if best else (not churches and not NO_MAIN.search(name))
        if not churches or (IGLESIA.search(name) and not NO_MAIN.search(name) and len(churches) < 3):
            churches.append({"x": round(lx, 1), "y": round(ly, 1), "name": name or "Iglesia", "main": main})
        if len(churches) >= 3:
            break

    out = {
        "unit": 0.5,
        "uses": list(use_codes),
        "parts": parts,
        "zone": zone,
        "center": [round(bx, 1), round(by, 1)],
        "radius": round(radius),
        "churches": churches,
    }
    json.dump(out, open(os.path.join(outdir, f"{ine}.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    return {"ine": ine, "parts": len(parts), "churches": len(churches), "shift": round(math.hypot(bx - wx, by - wy)), "byChurch": bool(best), "r": round(radius)}


summary = {}
for m in munis:
    if only and m["id"] not in only:
        continue
    try:
        res = process(m)
    except Exception as e:  # noqa: BLE001
        res = {"ine": m["id"], "error": str(e)}
    if res:
        summary[m["id"]] = res
        print(m["id"], m["n"], res, flush=True)
prev = {}
sp = os.path.join(outdir, "_resumen.json")
if os.path.exists(sp):
    prev = json.load(open(sp))
prev.update(summary)
json.dump(prev, open(sp, "w"), ensure_ascii=False, indent=0)
