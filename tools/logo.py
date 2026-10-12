"""Genera el logo de 388 Pueblos (web/assets/logo/): solo el número, «388».

Las tres cifras se dibujan con el mismo trazo grueso y redondeado: cada 8 son dos anillos apilados (el de arriba
más pequeño) y el 3 es ese mismo 8 abierto por la izquierda. No depende de ninguna fuente: son trazos SVG.
También genera el favicon, los iconos PNG (Apple, Android, manifiesto) y la imagen para compartir en redes.

uso: python3 tools/logo.py
"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "assets", "logo")
os.makedirs(OUT, exist_ok=True)

NOCHE = "#0c1122"
CAL = "#eef0ec"
SODIO = "#ffa94d"

SW = 16          # grosor del trazo
R1, R2 = 20, 27  # anillo de arriba y de abajo
Y1 = 12 + SW / 2 + R1          # centro del anillo de arriba
Y2 = Y1 + R1 + R2              # centro del de abajo (los anillos se tocan en la cintura)
W = 2 * R2 + SW                # ancho de una cifra
GAP = 9                        # aire entre cifras
H = Y2 + R2 + SW / 2 + 12      # alto total con margen
VW = 3 * W + 2 * GAP + 24      # ancho total con margen


def pt(cx, cy, r, deg):
    a = math.radians(deg)
    return round(cx + r * math.cos(a), 2), round(cy + r * math.sin(a), 2)


def centers():
    x0 = 12 + W / 2
    return [x0 + i * (W + GAP) for i in range(3)]


def three_path(cx):
    # el 3: el 8 abierto por la izquierda (arriba empieza a las 8 en punto, abajo acaba a las 4)
    x0, y0 = pt(cx, Y1, R1, 205)
    x2, y2 = pt(cx, Y2, R2, 155)
    return f"M{x0} {y0} A{R1} {R1} 0 1 1 {cx} {Y1 + R1} A{R2} {R2} 0 1 1 {x2} {y2}"


def mark(ink):
    c3, c8a, c8b = centers()
    s = f'<path d="{three_path(c3)}" fill="none" stroke="{ink}" stroke-width="{SW}" stroke-linecap="round"/>'
    for cx in (c8a, c8b):
        s += f'<circle cx="{cx}" cy="{Y1}" r="{R1}" fill="none" stroke="{ink}" stroke-width="{SW}"/>'
        s += f'<circle cx="{cx}" cy="{Y2}" r="{R2}" fill="none" stroke="{ink}" stroke-width="{SW}"/>'
    return s


def logo(name, ink, bg=None):
    rect = f'<rect width="{VW}" height="{H}" fill="{bg}"/>' if bg else ""
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VW:g} {H:g}" width="{VW:g}" height="{H:g}" role="img" aria-label="388 Pueblos">'
           f'<title>388 Pueblos</title>{rect}{mark(ink)}</svg>\n')
    open(os.path.join(OUT, name), "w").write(svg)


def favicon(name):
    # el 388 entero en un cuadrado redondeado (legible desde 32 px)
    k = 56 / VW
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="{NOCHE}"/>'
           f'<g transform="translate({32 - VW * k / 2:.2f} {32 - H * k / 2:.2f}) scale({k:.4f})">{mark(CAL)}</g></svg>\n')
    open(os.path.join(OUT, name), "w").write(svg)


# ---- versiones en PNG, dibujadas con PIL a 4x y reducidas (bordes suaves) ----
def draw_mark(d, ox, oy, k, ink):
    sw = SW * k
    def ring(cx, cy, r):
        d.ellipse([ox + (cx - r - SW / 2) * k, oy + (cy - r - SW / 2) * k, ox + (cx + r + SW / 2) * k, oy + (cy + r + SW / 2) * k], outline=ink, width=round(sw))
    def arc(cx, cy, r, a0, a1):
        d.arc([ox + (cx - r - SW / 2) * k, oy + (cy - r - SW / 2) * k, ox + (cx + r + SW / 2) * k, oy + (cy + r + SW / 2) * k], a0, a1, fill=ink, width=round(sw))
    def cap(cx, cy, r, deg):
        x, y = pt(cx, cy, r, deg)
        d.ellipse([ox + (x - SW / 2) * k, oy + (y - SW / 2) * k, ox + (x + SW / 2) * k, oy + (y + SW / 2) * k], fill=ink)
    c3, c8a, c8b = centers()
    arc(c3, Y1, R1, 205, 90 + 360 if 205 > 90 else 90)
    arc(c3, Y2, R2, 270, 155 + 360)
    cap(c3, Y1, R1, 205)
    cap(c3, Y2, R2, 155)
    for cx in (c8a, c8b):
        ring(cx, Y1, R1)
        ring(cx, Y2, R2)


def png_icon(name, size, pad=0.16, radius=0.22, bg=NOCHE, ink=CAL):
    S = size * 4
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if radius is None:
        d.rectangle([0, 0, S, S], fill=bg)
    else:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * radius), fill=bg)
    k = S * (1 - 2 * pad) / VW
    draw_mark(d, (S - VW * k) / 2, (S - H * k) / 2, k, ink)
    im.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name))


def font(paths, size):
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def og(name):
    # imagen para compartir (1200x630): el 388 grande y el nombre
    Wd, Hd = 1200, 630
    S = 2
    im = Image.new("RGB", (Wd * S, Hd * S), NOCHE)
    d = ImageDraw.Draw(im)
    for i in range(0, Hd * S, 2):  # un leve degradado de noche a anil hacia abajo
        t = i / (Hd * S)
        c = tuple(int(a + (b - a) * t * 0.55) for a, b in ((12, 22), (17, 33), (34, 70)))
        d.line([(0, i), (Wd * S, i)], fill=c, width=2)
    k = 330 * S / H
    draw_mark(d, 96 * S, (Hd * S - H * k) / 2 - 30 * S, k, CAL)
    serif = font(["/System/Library/Fonts/Supplemental/Georgia Italic.ttf", "/Library/Fonts/Georgia Italic.ttf"], 74 * S)
    mono = font(["/System/Library/Fonts/Menlo.ttc", "/System/Library/Fonts/Supplemental/Courier New.ttf"], 24 * S)
    x = 96 * S + VW * k + 50 * S
    d.text((x, 205 * S), "pueblos", font=serif, fill=CAL)
    d.text((x + 4 * S, 300 * S), "DE EXTREMADURA", font=mono, fill=SODIO)
    d.text((96 * S, 540 * S), "Un mundo online, abierto y gratuito, de los 388 municipios. Empezamos por Guareña.", font=font(["/System/Library/Fonts/Supplemental/Arial.ttf"], 26 * S), fill="#9ba4c8")
    im.resize((Wd, Hd), Image.LANCZOS).save(os.path.join(OUT, name), optimize=True)


logo("logo-388.svg", CAL)
logo("logo-388-noche.svg", NOCHE)
logo("logo-388-sodio.svg", SODIO)
logo("logo-388-fondo.svg", CAL, NOCHE)
favicon("favicon.svg")
png_icon("apple-touch-icon.png", 180, radius=None)
png_icon("icon-192.png", 192)
png_icon("icon-512.png", 512)
png_icon("icon-maskable-512.png", 512, pad=0.24, radius=None)
og("og-388pueblos.png")
print(sorted(os.listdir(OUT)))
