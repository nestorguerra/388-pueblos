"""Shared geometry helpers."""
import math


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
