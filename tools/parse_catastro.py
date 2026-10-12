"""Parse Catastro INSPIRE BuildingPart GML -> compact JSON for Three.js.

usage: python3 -I parse_catastro.py <buildingpart.gml> <building.gml> <out.json> <cx> <cy> <radius>
Coordinates are EPSG:25829 (UTM 29N). Output is local metres relative to (cx, cy), x east, y north.
"""
import json
import math
import re
import sys

part_path, bld_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
cx, cy, radius = float(sys.argv[4]), float(sys.argv[5]), float(sys.argv[6])

text = open(part_path, encoding="iso-8859-1").read()
members = text.split("<gml:featureMember>")[1:]

# current use per building (refcat) from building.gml
uses = {}
btext = open(bld_path, encoding="iso-8859-1").read()
for m in btext.split("<gml:featureMember>")[1:]:
    rid = re.search(r"<base:localId>([^<]+)</base:localId>", m)
    use = re.search(r"<bu-ext2d:currentUse>([^<]+)</bu-ext2d:currentUse>", m)
    if rid:
        uses[rid.group(1)] = use.group(1) if use else ""

def ring_area(pts):
    a = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        a += x1 * y2 - x2 * y1
    return a / 2

def simplify(pts, tol):
    # Douglas-Peucker on an open polyline
    if len(pts) < 3:
        return pts
    x1, y1 = pts[0]
    x2, y2 = pts[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-9
    dmax, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        x, y = pts[i]
        d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / norm
        if d > dmax:
            dmax, idx = d, i
    if dmax > tol:
        return simplify(pts[: idx + 1], tol)[:-1] + simplify(pts[idx:], tol)
    return [pts[0], pts[-1]]

out = []
use_codes = {}
for m in members:
    lid = re.search(r"<base:localId>([^<]+)</base:localId>", m)
    floors = re.search(r"<bu-ext2d:numberOfFloorsAboveGround>(\d+)</bu-ext2d:numberOfFloorsAboveGround>", m)
    ext = re.search(r"<gml:exterior>.*?<gml:posList[^>]*>([^<]+)</gml:posList>", m, re.S)
    if not (lid and ext):
        continue
    nums = list(map(float, ext.group(1).split()))
    pts = [(nums[i] - cx, nums[i + 1] - cy) for i in range(0, len(nums), 2)]
    mx = sum(p[0] for p in pts) / len(pts)
    my = sum(p[1] for p in pts) / len(pts)
    if math.hypot(mx, my) > radius:
        continue
    f = int(floors.group(1)) if floors else 0
    if f <= 0:
        continue  # patios / below-ground parts
    if pts[0] == pts[-1]:
        pts = pts[:-1]
    # split the ring at the vertex farthest from the first one, simplify both halves
    far = max(range(len(pts)), key=lambda i: math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]))
    a_half = simplify(pts[: far + 1], 0.35)
    b_half = simplify(pts[far:] + [pts[0]], 0.35)
    pts = a_half[:-1] + b_half[:-1]
    if len(pts) < 3:
        continue
    a = ring_area(pts)
    if abs(a) < 6:
        continue
    if a < 0:
        pts.reverse()  # counter-clockwise
    refcat = lid.group(1).split("_")[0]
    use = uses.get(refcat, "")
    code = use_codes.setdefault(use, len(use_codes))
    flat = []
    for x, y in pts:
        flat += [round(x * 2), round(y * 2)]  # half-metre integers
    out.append([f, code, flat])

json.dump({"unit": 0.5, "uses": list(use_codes), "parts": out}, open(out_path, "w"), separators=(",", ":"))
print("parts", len(out), "uses", use_codes)
