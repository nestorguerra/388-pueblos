"""Genera el sistema de logo de 388 Pueblos en SVG (web/assets/logo/).

Concepto: un "388" dibujado en trazo grueso y redondeado. Una cigüeña está posada en lo alto del primer 8,
como en los campanarios extremeños, y un hueco del último 8 está encendido con luz de farola:
388 pueblos, el primero ya despierto.

uso: python3 tools/logo.py
"""
import math
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "assets", "logo")
os.makedirs(OUT, exist_ok=True)

NOCHE = "#0c1122"
CAL = "#eef0ec"
SODIO = "#ffa94d"
ANIL = "#34489c"
PICO = "#e2502a"
NIDO = "#6b4a2b"
SW = 14  # grosor del trazo de las cifras
FONTS = "@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1&amp;family=Geist+Mono:wght@500&amp;display=swap');"


def pt(cx, cy, r, deg):
    a = math.radians(deg)
    return round(cx + r * math.cos(a), 2), round(cy + r * math.sin(a), 2)


def three(cx):
    x0, y0 = pt(cx, 42, 22, 200)
    x2, y2 = pt(cx, 92, 28, 160)
    return f"M{x0} {y0} A22 22 0 1 1 {cx} 64 A28 28 0 1 1 {x2} {y2}"


def eight(cx, ink, lit=False):
    s = f'<circle cx="{cx}" cy="43" r="21" fill="none" stroke="{ink}" stroke-width="{SW}"/>'
    s += f'<circle cx="{cx}" cy="92" r="28" fill="none" stroke="{ink}" stroke-width="{SW}"/>'
    if lit:
        s += f'<circle cx="{cx}" cy="43" r="17" fill="url(#luz)"/><circle cx="{cx}" cy="43" r="12.5" fill="{SODIO}"/>'
    return s


def stork(x, y, ink, body, k=1.45):
    """Cigüeña de pie sobre un nido; (x, y) es el centro del nido; k, escala."""
    return f"""
  <g transform="translate({x} {y}) scale({k}) translate({-x} {-y})">
    <path d="M{x-17} {y} q17 9 34 0 l-2 -6 q-15 6 -30 0 z" fill="{NIDO}"/>
    <path d="M{x-15} {y-3} l-4 -3 M{x+15} {y-3} l4 -3 M{x-6} {y-1} l-3 -4 M{x+8} {y-1} l2 -5" stroke="{NIDO}" stroke-width="2" stroke-linecap="round"/>
    <path d="M{x-3} {y-6} l1 -14" stroke="{PICO}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M{x+1} {y-20} l4 6 l-4 3" fill="none" stroke="{PICO}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse cx="{x-2}" cy="{y-25}" rx="14" ry="7.5" transform="rotate(-18 {x-2} {y-25})" fill="{body}" stroke="{ink}" stroke-width="2.2"/>
    <path d="M{x-15} {y-21} q6 -9 15 -12 q-3 9 -11 15 z" fill="{ink}"/>
    <path d="M{x+9} {y-30} q4 -10 1 -20" fill="none" stroke="{ink}" stroke-width="7.5" stroke-linecap="round"/>
    <path d="M{x+9} {y-30} q4 -10 1 -20" fill="none" stroke="{body}" stroke-width="3.4" stroke-linecap="round"/>
    <circle cx="{x+10}" cy="{y-52}" r="4.6" fill="{body}" stroke="{ink}" stroke-width="2.2"/>
    <path d="M{x+13} {y-51} l15 5" stroke="{PICO}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="{x+11}" cy="{y-53}" r="1" fill="{ink}"/>
  </g>"""


def numerals(ink, body, ox=0):
    c3, c8a, c8b = 30 + ox, 108 + ox, 186 + ox
    return (f'<path d="{three(c3)}" fill="none" stroke="{ink}" stroke-width="{SW}" stroke-linecap="round"/>'
            + eight(c8a, ink) + eight(c8b, ink, lit=True) + stork(c8a, 15, ink, body))


def defs():
    return f"""<defs><radialGradient id="luz"><stop offset="0" stop-color="{SODIO}" stop-opacity=".9"/><stop offset="1" stop-color="{SODIO}" stop-opacity="0"/></radialGradient>
  <style>{FONTS}</style></defs>"""


def horizontal(bg, ink, body, sub, name):
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="-30 -80 610 250" width="610" height="250" role="img" aria-label="388 Pueblos">
  <title>388 Pueblos</title>
  {defs()}
  {f'<rect x="-30" y="-80" width="610" height="250" fill="{bg}"/>' if bg else ''}
  {numerals(ink, body)}
  <text x="236" y="117" font-family="'Instrument Serif', Georgia, serif" font-style="italic" font-size="92" fill="{ink}" letter-spacing="-1.5">pueblos</text>
  <text x="300" y="158" font-family="'Geist Mono', ui-monospace, Menlo, monospace" font-size="12.5" letter-spacing="3.2" fill="{sub}">DE EXTREMADURA</text>
</svg>"""
    open(os.path.join(OUT, name), "w").write(svg)


def stacked(bg, ink, body, sub, name):
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="-42 -82 300 320" width="300" height="320" role="img" aria-label="388 Pueblos">
  <title>388 Pueblos</title>
  {defs()}
  {f'<rect x="-42" y="-82" width="300" height="320" fill="{bg}"/>' if bg else ''}
  {numerals(ink, body)}
  <text x="108" y="196" text-anchor="middle" font-family="'Instrument Serif', Georgia, serif" font-style="italic" font-size="70" fill="{ink}">pueblos</text>
  <text x="108" y="220" text-anchor="middle" font-family="'Geist Mono', ui-monospace, Menlo, monospace" font-size="11" letter-spacing="3" fill="{sub}">DE EXTREMADURA</text>
</svg>"""
    open(os.path.join(OUT, name), "w").write(svg)


def icon(name, bg=NOCHE, ink=CAL, body=CAL, radius=44):
    # isotipo: el 8 encendido con su cigüeña, en un cuadrado redondeado
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="388 Pueblos">
  <title>388 Pueblos</title>
  {defs()}
  <rect width="200" height="200" rx="{radius}" fill="{bg}"/>
  <g transform="translate(100 102) scale(0.8) translate(-111 -33)">
    {eight(108, ink, lit=True)}
    {stork(108, 15, ink if ink != body else bg, body)}
  </g>
</svg>"""
    open(os.path.join(OUT, name), "w").write(svg)


def favicon(name):
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="{NOCHE}"/>
  <circle cx="32" cy="20.5" r="9.5" fill="{SODIO}" stroke="{CAL}" stroke-width="6.5"/>
  <circle cx="32" cy="43" r="12.5" fill="none" stroke="{CAL}" stroke-width="6.5"/></svg>"""
    open(os.path.join(OUT, name), "w").write(svg)


def azulejo(name):
    # alternativa: placa de azulejo con el número de la casa, como en las fachadas de los pueblos
    corners = "".join(
        f'<path d="M{x} {y} m{dx*14} 0 a14 14 0 0 1 {-dx*14} {dy*14}" fill="none" stroke="{ANIL}" stroke-width="3"/>'
        f'<circle cx="{x}" cy="{y}" r="4" fill="{ANIL}"/>'
        for x, y, dx, dy in ((22, 22, 1, 1), (278, 22, -1, 1), (22, 238, 1, -1), (278, 238, -1, -1))
    )
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 260" width="300" height="260" role="img" aria-label="388 Pueblos, azulejo">
  <title>388 Pueblos</title>
  {defs()}
  <rect x="2" y="2" width="296" height="256" rx="10" fill="#f6f4ec" stroke="{ANIL}" stroke-width="4"/>
  <rect x="12" y="12" width="276" height="236" rx="6" fill="none" stroke="{ANIL}" stroke-width="1.5"/>
  {corners}
  <g transform="translate(46 78) scale(0.9)">{numerals(ANIL, '#f6f4ec')}</g>
  <text x="150" y="222" text-anchor="middle" font-family="'Instrument Serif', Georgia, serif" font-style="italic" font-size="38" fill="{ANIL}">pueblos</text>
</svg>"""
    open(os.path.join(OUT, name), "w").write(svg)


def nav(ink, body, name):
    # versión recortada y sin subtítulo para cabeceras pequeñas
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -72 562 216" width="562" height="216" role="img" aria-label="388 Pueblos">
  <title>388 Pueblos</title>
  {defs()}
  {numerals(ink, body)}
  <text x="236" y="117" font-family="'Instrument Serif', Georgia, serif" font-style="italic" font-size="92" fill="{ink}" letter-spacing="-1.5">pueblos</text>
</svg>"""
    open(os.path.join(OUT, name), "w").write(svg)


nav(NOCHE, "#ffffff", "logo-388pueblos-nav-claro.svg")
nav(CAL, CAL, "logo-388pueblos-nav-oscuro.svg")
horizontal(None, NOCHE, "#ffffff", ANIL, "logo-388pueblos-claro.svg")
horizontal(None, CAL, CAL, "#9ba4c8", "logo-388pueblos-oscuro.svg")
horizontal(None, "#111111", "#ffffff", "#111111", "logo-388pueblos-negro.svg")
stacked(None, NOCHE, "#ffffff", ANIL, "logo-388pueblos-vertical-claro.svg")
stacked(NOCHE, CAL, CAL, "#9ba4c8", "logo-388pueblos-vertical-oscuro.svg")
icon("icono-388pueblos.svg")
favicon("favicon.svg")
azulejo("alternativa-azulejo.svg")
print(sorted(os.listdir(OUT)))
