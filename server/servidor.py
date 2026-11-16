"""Servidor propio de 388 Pueblos: web estática + multijugador (WebSocket) + base de datos (SQLite).

Solo usa la biblioteca estándar de Python 3.9+. Abierto a cualquiera, sin cuentas:
- /ws?room=pueblo-<INE>   presencia en tiempo real por pueblo (posición, frases y emojis predefinidos).
- /ws?room=juego-<INE>    el multijugador del juego de ese pueblo (Guareña, juego-06060): cada uno manda su estado y el
                          servidor lo reenvía a los demás (ver «el juego», abajo; docs/multijugador.md en «388 Foto»).
- /api/juego?pueblo=<INE> quién hay en el juego ahora: nombre, calle, sitio y qué hace.
- /api/online             personas conectadas ahora, en total y por pueblo.
- /api/votos              GET recuento por pueblo · POST {device, pueblo} (un voto por dispositivo).
- /api/pasaporte          GET ?device= · POST {device, pueblo} (un sello por pueblo visitado).
- /api/lista              POST {email, alias, pueblo, perfil, origen, edad14, acepto} (nunca se puede leer por la API).
- /api/lista/recuento     GET apuntados por pueblo y total (solo números).
- /api/vecinos            POST lo que dice un vecino del juego de Guareña, con GPT (ver «los vecinos con GPT», abajo).
Todo lo demás sirve la carpeta web/ (con ETag y caché). Los HTML reciben window.P388 para que las páginas usen este
servidor. La API acepta peticiones de otros orígenes (la web estática en su CDN).

uso: python3 server/servidor.py [--port 8388] [--db 388pueblos.sqlite3]
Exportar la lista de espera: python3 server/servidor.py --export-lista
"""
import argparse
import asyncio
import base64
import hashlib
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import struct
import time
import urllib.parse

from pagina import documento

ROOT = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web"))
GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
INE_RE = re.compile(r"^\d{5}$")
ROOM_RE = re.compile(r"^(pueblo|juego)-\d{5}$")
ALIAS_RE = re.compile(r"^[A-Za-zÁÉÍÓÚÑáéíóúñü]{2,12} \d{2}$")
EMAIL_RE = re.compile(r"^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$")
DEVICE_RE = re.compile(r"^[A-Za-z0-9_-]{12,64}$")
MAX_WS = 4096
MAX_BODY = 4096
MAX_BODY_VECINOS = 16384

ap = argparse.ArgumentParser()
ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8388")))
ap.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
ap.add_argument("--db", default=os.environ.get("DB_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "388pueblos.sqlite3")))
ap.add_argument("--export-lista", action="store_true")
ap.add_argument("--site", default=os.environ.get("SITE_URL", ""), help="si se da, las páginas redirigen a la web estática")
args = ap.parse_args()

db = sqlite3.connect(args.db)
db.executescript(
    """
    CREATE TABLE IF NOT EXISTS votos (device TEXT PRIMARY KEY, pueblo TEXT NOT NULL, t INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS pasaporte (device TEXT NOT NULL, pueblo TEXT NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (device, pueblo));
    CREATE TABLE IF NOT EXISTS lista (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, alias TEXT, pueblo TEXT, perfil TEXT, t INTEGER NOT NULL);
    """
)
try:
    db.execute("ALTER TABLE lista ADD COLUMN origen TEXT")
except sqlite3.OperationalError:
    pass
db.commit()

if args.export_lista:
    for row in db.execute("SELECT email, alias, pueblo, perfil, origen, datetime(t/1000, 'unixepoch') FROM lista ORDER BY t"):
        print(",".join("" if v is None else str(v) for v in row))
    raise SystemExit(0)

PUEBLOS = set()
try:
    with open(os.path.join(ROOT, "data", "municipios.json"), encoding="utf-8") as f:
        PUEBLOS = {m["id"] for m in json.load(f)["m"]}
except OSError:
    pass

# ---------------- salas ----------------
rooms = {}  # room -> {peer_id: Client}
room_t0 = {}  # room de juego -> cuándo entró el primero (ms): de ahí sacan todos la hora del juego


class Client:
    def __init__(self, writer, room):
        self.writer = writer
        self.room = room
        self.id = secrets.token_hex(6)
        self.presence = {}
        self.tokens = 40.0
        self.last = time.monotonic()
        self.dicho = 0.0

    def allow(self):
        now = time.monotonic()
        self.tokens = min(40.0, self.tokens + (now - self.last) * 20)
        self.last = now
        if self.tokens < 1:
            return False
        self.tokens -= 1
        return True


def clean_presence(d):
    """Solo campos conocidos y con valores acotados: nada de texto libre."""
    out = {}
    num = lambda v, lo, hi: isinstance(v, (int, float)) and not isinstance(v, bool) and lo <= v <= hi
    if num(d.get("x"), -6000, 6000):
        out["x"] = round(float(d["x"]), 1)
    if num(d.get("y"), -6000, 6000):
        out["y"] = round(float(d["y"]), 1)
    if num(d.get("h"), -20, 20):
        out["h"] = round(float(d["h"]), 2)
    if isinstance(d.get("n"), str) and ALIAS_RE.match(d["n"]):
        out["n"] = d["n"]
    for k, hi in (("c", 7), ("w", 1), ("on", 1), ("s", 5), ("e", 5)):
        if isinstance(d.get(k), int) and not isinstance(d.get(k), bool) and 0 <= d[k] <= hi:
            out[k] = d[k]
    for k in ("st", "et"):
        if num(d.get(k), 0, 1e14):
            out[k] = int(d[k])
    return out


def clean_juego(d):
    """El estado de alguien en el juego: solo campos conocidos y acotados (docs/multijugador.md en «388 Foto»)."""
    out = {}
    num = lambda v, lo, hi: isinstance(v, (int, float)) and not isinstance(v, bool) and lo <= v <= hi
    for k in ("x", "y", "z"):
        if num(d.get(k), -6000, 6000):
            out[k] = round(float(d[k]), 2)
    if num(d.get("r"), -720, 720):
        out["r"] = round(float(d["r"]), 1)
    if num(d.get("s"), 0, 4):
        out["s"] = round(float(d["s"]), 2)
    for k, lo, hi in (("a", 0, 31), ("m", 0, 15), ("k", -1, 999), ("l", -1, 99), ("c", 0, 7)):
        if isinstance(d.get(k), int) and not isinstance(d.get(k), bool) and lo <= d[k] <= hi:
            out[k] = d[k]
    if isinstance(d.get("n"), str) and ALIAS_RE.match(d["n"]):
        out["n"] = d["n"]
    return out


CTRL_RE = re.compile(r"[\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2066-\u2069]")


def clean_dicho(x):
    """Lo que alguien dice en el juego: texto corto, sin caracteres de control (se pinta como texto, nunca como HTML)."""
    if not isinstance(x, str):
        return ""
    return " ".join(CTRL_RE.sub(" ", x).split())[:140]


def frame(text):
    data = text.encode("utf-8")
    n = len(data)
    if n < 126:
        head = struct.pack("!BB", 0x81, n)
    elif n < 65536:
        head = struct.pack("!BBH", 0x81, 126, n)
    else:
        head = struct.pack("!BBQ", 0x81, 127, n)
    return head + data


async def send(c, obj):
    try:
        c.writer.write(frame(json.dumps(obj, separators=(",", ":"), ensure_ascii=False)))
        await c.writer.drain()
    except (ConnectionError, RuntimeError):
        pass


async def broadcast(room, obj, skip=None):
    for c in list(rooms.get(room, {}).values()):
        if c is not skip:
            await send(c, obj)


async def read_frame(reader):
    h = await reader.readexactly(2)
    fin_op, ln = h[0], h[1]
    op = fin_op & 0x0F
    masked = ln & 0x80
    ln &= 0x7F
    if ln == 126:
        ln = struct.unpack("!H", await reader.readexactly(2))[0]
    elif ln == 127:
        ln = struct.unpack("!Q", await reader.readexactly(8))[0]
    if ln > MAX_WS or not masked:
        raise ConnectionError("frame no válido")
    mask = await reader.readexactly(4)
    data = bytearray(await reader.readexactly(ln))
    for i in range(ln):
        data[i] ^= mask[i % 4]
    return op, bytes(data)


async def handle_ws(reader, writer, headers, query):
    room = (query.get("room") or [""])[0]
    key = headers.get("sec-websocket-key")
    juego = room.startswith("juego-")
    if not key or not ROOM_RE.match(room) or room.split("-", 1)[1] not in PUEBLOS:
        writer.write(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n")
        await writer.drain()
        return
    if len(rooms.get(room, {})) >= 64:
        writer.write(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\n\r\n")
        await writer.drain()
        return
    accept = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
    writer.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                  f"Sec-WebSocket-Accept: {accept}\r\n\r\n").encode())
    await writer.drain()
    c = Client(writer, room)
    if juego and not rooms.get(room):
        room_t0[room] = int(time.time() * 1000)
    rooms.setdefault(room, {})[c.id] = c
    if juego:
        await send(c, {"t": "sala", "yo": c.id, "otros": [{"id": o.id, "p": o.presence} for o in rooms[room].values() if o is not c],
                       "t0": room_t0.get(room), "ahora": int(time.time() * 1000)})
        await broadcast(room, {"t": "entra", "id": c.id}, skip=c)
    else:
        await send(c, {"t": "room", "me": c.id, "peers": [{"id": o.id, "p": o.presence} for o in rooms[room].values() if o is not c]})
        await broadcast(room, {"t": "join", "id": c.id}, skip=c)
    try:
        while True:
            # (en el juego, cada uno manda algo al menos cada 2 s: 20 s callado es que se ha ido —al cerrar la página, el aviso
            # de cierre no siempre pasa por el proxy de Render y se quedaba en el pueblo, quieto, hasta el minuto y medio—)
            op, data = await asyncio.wait_for(read_frame(reader), timeout=20 if juego else 90)
            if op == 0x8:
                break
            if op == 0x9:
                writer.write(struct.pack("!BB", 0x8A, len(data)) + data)
                await writer.drain()
                continue
            if op != 0x1 or not c.allow():
                continue
            try:
                msg = json.loads(data.decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                continue
            if not isinstance(msg, dict):
                continue
            t = msg.get("t")
            if not juego and t == "p":
                c.presence.update(clean_presence(msg))
                await broadcast(room, {"t": "p", "id": c.id, "p": c.presence}, skip=c)
            elif juego and t == "adios":
                break
            elif juego and t == "j":
                cambio = clean_juego(msg)
                c.presence.update(cambio)
                await broadcast(room, {"t": "j", "id": c.id, "p": cambio}, skip=c)
            elif juego and t == "g" and isinstance(msg.get("k"), int) and not isinstance(msg.get("k"), bool) and 0 <= msg["k"] <= 15:
                await broadcast(room, {"t": "g", "id": c.id, "k": msg["k"]}, skip=c)
            elif juego and t == "di":
                ahora = time.monotonic()
                x = clean_dicho(msg.get("x"))
                if x and ahora - c.dicho >= 1.5:
                    c.dicho = ahora
                    a = msg.get("a") if isinstance(msg.get("a"), str) and re.fullmatch(r"[0-9a-f]{12}", msg.get("a") or "") else None
                    await broadcast(room, {"t": "di", "id": c.id, "x": x, **({"a": a} if a else {})})
    except (asyncio.IncompleteReadError, asyncio.TimeoutError, ConnectionError):
        pass
    finally:
        rooms.get(room, {}).pop(c.id, None)
        if not rooms.get(room):
            rooms.pop(room, None)
            room_t0.pop(room, None)
        await broadcast(room, {"t": "sale" if juego else "bye", "id": c.id})


# ---------------- API ----------------
writes = {}  # ip -> [timestamps]


def rate_ok(ip, limit=30, window=60):
    now = time.time()
    q = [t for t in writes.get(ip, []) if now - t < window]
    if len(q) >= limit:
        writes[ip] = q
        return False
    q.append(now)
    writes[ip] = q
    return True


def api(method, path, query, body, ip):
    if path == "/api/online":
        return 200, {"total": sum(len(r) for k, r in rooms.items() if k.startswith("pueblo-")),
                     "pueblos": {k[7:]: len(v) for k, v in rooms.items() if k.startswith("pueblo-")},
                     "juego": {k[6:]: len(v) for k, v in rooms.items() if k.startswith("juego-")}}
    if path == "/api/juego" and method == "GET":
        pueblo = (query.get("pueblo") or [""])[0]
        if not INE_RE.match(pueblo):
            return 400, {"error": "pueblo no válido"}
        sala = rooms.get("juego-" + pueblo, {})
        gente = [{k: c.presence[k] for k in ("n", "k", "l", "m") if k in c.presence} for c in sala.values()]
        return 200, {"humanos": len(sala), "gente": gente, "t0": room_t0.get("juego-" + pueblo)}
    if path == "/api/lista/recuento" and method == "GET":
        pueblos = {p: n for p, n in db.execute("SELECT pueblo, COUNT(*) FROM lista WHERE pueblo IS NOT NULL GROUP BY pueblo")}
        return 200, {"pueblos": pueblos, "total": db.execute("SELECT COUNT(*) FROM lista").fetchone()[0]}
    if path == "/api/votos" and method == "GET":
        return 200, {p: n for p, n in db.execute("SELECT pueblo, COUNT(*) FROM votos GROUP BY pueblo")}
    if path == "/api/pasaporte" and method == "GET":
        dev = (query.get("device") or [""])[0]
        if not DEVICE_RE.match(dev):
            return 400, {"error": "dispositivo no válido"}
        return 200, {"sellos": {p: t for p, t in db.execute("SELECT pueblo, t FROM pasaporte WHERE device=?", (dev,))}}
    if method != "POST":
        return 404, {"error": "no existe"}
    if not rate_ok(ip):
        return 429, {"error": "demasiadas peticiones, prueba en un minuto"}
    try:
        d = json.loads(body.decode("utf-8") or "{}")
        assert isinstance(d, dict)
    except (ValueError, AssertionError, UnicodeDecodeError):
        return 400, {"error": "JSON no válido"}
    now = int(time.time() * 1000)
    if path == "/api/votos":
        dev, p = d.get("device", ""), d.get("pueblo", "")
        if not (isinstance(dev, str) and DEVICE_RE.match(dev) and isinstance(p, str) and p in PUEBLOS):
            return 400, {"error": "voto no válido"}
        db.execute("INSERT INTO votos(device, pueblo, t) VALUES(?,?,?) ON CONFLICT(device) DO UPDATE SET pueblo=excluded.pueblo, t=excluded.t", (dev, p, now))
        db.commit()
        return 200, {"ok": True}
    if path == "/api/pasaporte":
        dev, p = d.get("device", ""), d.get("pueblo", "")
        if not (isinstance(dev, str) and DEVICE_RE.match(dev) and isinstance(p, str) and p in PUEBLOS):
            return 400, {"error": "sello no válido"}
        db.execute("INSERT OR IGNORE INTO pasaporte(device, pueblo, t) VALUES(?,?,?)", (dev, p, now))
        db.commit()
        n = db.execute("SELECT COUNT(*) FROM pasaporte WHERE device=?", (dev,)).fetchone()[0]
        return 200, {"ok": True, "count": n}
    if path == "/api/lista":
        email = d.get("email", "")
        if not (isinstance(email, str) and EMAIL_RE.match(email.strip())):
            return 400, {"error": "email no válido"}
        if d.get("edad14") is not True or d.get("acepto") is not True:
            return 400, {"error": "falta la confirmación de edad o el consentimiento"}
        alias = str(d.get("alias", ""))[:40]
        pueblo = d.get("pueblo") if d.get("pueblo") in PUEBLOS else None
        perfil = d.get("perfil") if d.get("perfil") in ("Jugador", "Creador", "Desde fuera", "Ayuntamiento") else None
        if d.get("web"):  # (el campo trampa: solo lo rellenan los robots)
            return 200, {"ok": True}
        origen = d.get("origen") if d.get("origen") in ("jugar", "formulario") else None
        if not pueblo and isinstance(d.get("pueblo_texto"), str) and d["pueblo_texto"].strip():
            alias = (alias + " · " if alias else "") + d["pueblo_texto"].strip()[:60]
        db.execute("INSERT OR IGNORE INTO lista(email, alias, pueblo, perfil, t, origen) VALUES(?,?,?,?,?,?)", (email.strip().lower(), alias, pueblo, perfil, now, origen))
        db.commit()
        return 200, {"ok": True}
    return 404, {"error": "no existe"}


# ---------------- los vecinos con GPT ----------------
# Lo que dice un vecino del juego de Guareña (la web abierta del juego, nestorguerra.github.io/calle-malfeitos/?escena=guarena;
# src/ia.js allí), con GPT-5.6 Luna, para todos los jugadores sin que pongan nada. La clave de OpenAI va en la variable
# de entorno OPENAI_API_KEY de este servicio en Render (se pone en su panel, nunca en el código ni en la web, que
# cualquiera puede leer); sin ella responde 503 y el juego sigue con su IA del navegador.
# Para que no sirva de GPT gratis para otra cosa: las instrucciones las monta este servidor con los datos del vecino (el
# navegador no manda texto libre de sistema), la respuesta va en un esquema fijo (lo que dice, de 280 letras como mucho, y
# lo que hace), corta, y con topes: 12 charlas por minuto y 150 al día por cada IP, y 4.000 al día en total.
# OPENAI_MODELO (gpt-5.6-luna) y OPENAI_ESFUERZO (high) los cambian; OPENAI_URL, para las pruebas.
VEC_HACE = ["nada", "saludar", "acompanar", "irse", "sentarse"]
VEC_TIPOS = {"mayor", "adulto", "joven", "nino"}
vec_ip, vec_dia = {}, {"dia": "", "n": 0}
VEC_ORIGENES = ("https://nestorguerra.github.io", "https://pueblos388.onrender.com", "http://127.0.0.1", "http://localhost")


def vec_texto(v, n):
    return re.sub(r"[\x00-\x1f]", " ", str(v or ""))[:n].strip()


def vec_sistema(p, c):
    """las instrucciones del vecino, como las de src/ia.js del juego"""
    o = not p["hombre"]
    if p["tipo"] == "nino":
        quien = f"Eres {'una niña' if o else 'un niño'} de {p['edad']} años de Guareña; {p['oficio']}."
    else:
        quien = f"Eres {p['nombre']}, {'una vecina' if o else 'un vecino'} de Guareña de {p['edad']} años; {p['oficio']}."
    return (f"{quien} Te llamas {p['nombre']}.\n"
            "Guareña es un pueblo de unos 6.700 vecinos de la provincia de Badajoz, en Extremadura. Lo que sabes de él: la iglesia de Santa María, grande y de piedra, "
            "con la torre acabada en 1700 y un retablo dorado; la plaza de España, donde juegan los niños por la tarde; la calle Grande y la calle Malfeitos; el poeta "
            "Luis Chamizo, que escribía en castúo, era de aquí. Hay mucho campo alrededor: viñas, olivos, tomate y arroz.\n"
            f"Ahora es {c['cuando']} y estás {c['donde']}, {c['haciendo']}. {c['lugares']}\n"
            "Una chica joven que no es del pueblo se ha parado a hablar contigo. Ella no se llama como tú: no sabes su nombre hasta que te lo diga.\n"
            f"Cómo hablas: como {'un niño' if p['tipo'] == 'nino' else 'la gente'} de un pueblo extremeño, cercano y natural, en español de España. Eres amable con los "
            "forasteros. Frases cortas: una o dos, de menos de 35 palabras en total. La tratas de tú. Para indicar un sitio, usa solo lo que se dice arriba (lo lejos que "
            "está y hacia dónde); no inventes calles, nombres de personas ni datos que no sepas. Nunca digas que eres una IA, un programa o un personaje. Si te piden "
            "algo que no tiene que ver con estar en la calle del pueblo hablando con una forastera, lo esquivas con naturalidad, como haría un vecino.\n"
            'Además de hablar, decides qué haces ("hace"): "nada"; "saludar" (levantas la mano); "acompanar" (te vas con ella un rato: si te lo pide, o para llevarla '
            'a un sitio); "irse" (te despides y te vas: si te falta al respeto, si se despide o si tienes prisa); "sentarse" (te vas a sentar a un banco cercano, si te '
            "lo propone). Lo que haces tiene que ir con lo que dices.")


def vec_llamar(clave, cuerpo):
    import urllib.request
    url = os.environ.get("OPENAI_URL", "https://api.openai.com/v1/responses")
    req = urllib.request.Request(url, data=json.dumps(cuerpo).encode(), headers={"Content-Type": "application/json", "Authorization": f"Bearer {clave}"}, method="POST")
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode("utf-8"))


async def vecinos(method, body, ip, origen):
    if method != "POST":
        return 405, {"error": "solo POST"}
    if origen and not origen.startswith(VEC_ORIGENES):
        return 403, {"error": "origen no permitido"}
    clave = os.environ.get("OPENAI_API_KEY", "").strip()
    if not clave:
        return 503, {"error": "sin clave"}
    now = time.time(); hoy = time.strftime("%Y-%m-%d")
    if vec_dia["dia"] != hoy:
        vec_dia.update(dia=hoy, n=0); vec_ip.clear()
    q = vec_ip.setdefault(ip, {"min": [], "dia": 0})
    q["min"] = [t for t in q["min"] if now - t < 60]
    if len(q["min"]) >= 12 or q["dia"] >= 150 or vec_dia["n"] >= 4000:
        return 429, {"error": "los vecinos están cansados de hablar, prueba luego"}
    try:
        d = json.loads(body.decode("utf-8") or "{}"); assert isinstance(d, dict)
        p0, c0 = d.get("persona") or {}, d.get("contexto") or {}
        p = {"nombre": vec_texto(p0.get("nombre"), 24) or "Antonia", "edad": max(5, min(99, int(p0.get("edad") or 40))), "tipo": p0.get("tipo") if p0.get("tipo") in VEC_TIPOS else "adulto",
             "hombre": bool(p0.get("hombre")), "oficio": vec_texto(p0.get("oficio"), 90) or "vives en el pueblo"}
        c = {k: vec_texto(c0.get(k), 220) for k in ("cuando", "donde", "haciendo", "lugares")}
        mensaje = vec_texto(d.get("mensaje"), 300)
        assert mensaje
        historial = []
        for m in (d.get("historial") or [])[-12:]:
            if isinstance(m, dict) and m.get("role") in ("user", "assistant"):
                historial.append({"role": m["role"], "content": vec_texto(m.get("content"), 400)})
    except (ValueError, AssertionError, UnicodeDecodeError, TypeError):
        return 400, {"error": "charla no válida"}
    q["min"].append(now); q["dia"] += 1; vec_dia["n"] += 1
    esfuerzo = os.environ.get("OPENAI_ESFUERZO", "high")
    cuerpo = {"model": os.environ.get("OPENAI_MODELO", "gpt-5.6-luna"), "store": False, "reasoning": {"effort": esfuerzo},
              "max_output_tokens": 2500 if esfuerzo == "high" else 900,
              "input": [{"role": "system", "content": vec_sistema(p, c)}] + historial + [{"role": "user", "content": mensaje}],
              "text": {"format": {"type": "json_schema", "name": "respuesta_vecino", "strict": True,
                                  "schema": {"type": "object", "additionalProperties": False, "properties": {"dice": {"type": "string"}, "hace": {"type": "string", "enum": VEC_HACE}}, "required": ["dice", "hace"]}}}}
    try:
        r = await asyncio.to_thread(vec_llamar, clave, cuerpo)
        texto = r.get("output_text") or "".join(c_.get("text", "") for o_ in r.get("output", []) if o_.get("type") == "message" for c_ in o_.get("content", []) if c_.get("type") == "output_text")
        res = json.loads(texto)
        dice = vec_texto(res.get("dice"), 280) or "…"
        hace = res.get("hace") if res.get("hace") in VEC_HACE else "nada"
        return 200, {"dice": dice, "hace": hace}
    except Exception as e:  # (OpenAI caído, sin saldo, la clave anulada…: el juego sigue con su IA)
        print("vecinos: fallo de OpenAI:", type(e).__name__, str(e)[:200], flush=True)
        return 502, {"error": "los vecinos no contestan ahora"}


# ---------------- HTTP ----------------
# (los JS y CSS de aquí no llevan huella en la URL: se revalidan siempre con su ETag para no mezclar versiones;
# la web estática del CDN sí la lleva y los guarda un año)
CACHE = {".html": "no-cache", ".js": "no-cache", ".css": "no-cache", ".json": "public, max-age=3600, stale-while-revalidate=604800"}


def static(path):
    rel = urllib.parse.unquote(path.split("?")[0]).lstrip("/")
    if rel == "" or rel.endswith("/"):
        rel += "index.html"  # (la portada de cada carpeta: / y /en/)
    full = os.path.realpath(os.path.join(ROOT, rel))
    if not full.startswith(ROOT + os.sep) or not os.path.isfile(full):
        return 404, b"No encontrado", "text/plain; charset=utf-8", "no-store"
    with open(full, "rb") as f:
        body = f.read()
    ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
    if full.endswith(".html"):
        body = documento(body, "/api")
    if ctype.startswith("text/") or ctype in ("application/json", "application/javascript"):
        ctype += "; charset=utf-8"
    return 200, body, ctype, CACHE.get(os.path.splitext(full)[1], "public, max-age=604800")


async def handle(reader, writer):
    ip = (writer.get_extra_info("peername") or ("?",))[0]
    try:
        line = await asyncio.wait_for(reader.readline(), timeout=20)
        if not line:
            return
        method, target, _ = line.decode("latin-1").split(" ", 2)
        headers = {}
        while True:
            h = await asyncio.wait_for(reader.readline(), timeout=20)
            if h in (b"\r\n", b"\n", b""):
                break
            k, _, v = h.decode("latin-1").partition(":")
            headers[k.strip().lower()] = v.strip()
        ip = headers.get("x-forwarded-for", ip).split(",")[0].strip()
        url = urllib.parse.urlsplit(target)
        query = urllib.parse.parse_qs(url.query)
        if url.path == "/ws" and headers.get("upgrade", "").lower() == "websocket":
            await handle_ws(reader, writer, headers, query)
            return
        body = b""
        n = int(headers.get("content-length", "0") or 0)
        if n > (MAX_BODY_VECINOS if url.path == "/api/vecinos" else MAX_BODY):
            status, payload, ctype = 413, b'{"error":"demasiado grande"}', "application/json"
        else:
            if n:
                body = await reader.readexactly(n)
            if url.path.startswith("/api/") and method == "OPTIONS":
                status, payload, ctype = 204, b"", "text/plain"
            elif url.path == "/api/vecinos":
                status, obj = await vecinos(method, body, ip, headers.get("origin", ""))
                payload, ctype = json.dumps(obj, ensure_ascii=False).encode(), "application/json; charset=utf-8"
            elif url.path.startswith("/api/"):
                status, obj = api(method, url.path, query, body, ip)
                payload, ctype = json.dumps(obj, ensure_ascii=False).encode(), "application/json; charset=utf-8"
            elif method in ("GET", "HEAD") and args.site and (url.path.endswith("/") or url.path.endswith(".html")):
                # la web vive en el CDN: las páginas de aquí llevan allí (la API sigue aquí)
                status, payload, ctype = 301, b"", "text/plain"
                location = args.site.rstrip("/") + url.path + (("?" + url.query) if url.query else "")
            elif method in ("GET", "HEAD"):
                status, payload, ctype, cache = static(url.path)
            else:
                status, payload, ctype = 405, b"", "text/plain"
        extra = ""
        if url.path.startswith("/api/"):
            extra = ("Cache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\n"
                     "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\n"
                     "Access-Control-Max-Age: 86400\r\n")
        elif status == 200 and method in ("GET", "HEAD"):
            etag = '"' + hashlib.sha1(payload).hexdigest()[:20] + '"'
            if headers.get("if-none-match") == etag:
                status, payload = 304, b""
            extra = f"Cache-Control: {cache}\r\nETag: {etag}\r\n"
        elif status == 301:
            extra = f"Location: {location}\r\nCache-Control: public, max-age=3600\r\n"
        else:
            extra = "Cache-Control: no-store\r\n"
        reason = {200: "OK", 204: "No Content", 301: "Moved Permanently", 304: "Not Modified", 400: "Bad Request", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 413: "Payload Too Large", 429: "Too Many Requests", 502: "Bad Gateway", 503: "Service Unavailable"}.get(status, "OK")
        hdr = (f"HTTP/1.1 {status} {reason}\r\nContent-Type: {ctype}\r\nContent-Length: {len(payload)}\r\n{extra}"
               "X-Content-Type-Options: nosniff\r\nReferrer-Policy: strict-origin-when-cross-origin\r\nConnection: close\r\n\r\n").encode()
        writer.write(hdr + (b"" if method == "HEAD" else payload))
        await writer.drain()
    except (asyncio.TimeoutError, asyncio.IncompleteReadError, ConnectionError, ValueError):
        pass
    finally:
        try:
            writer.close()
        except RuntimeError:
            pass


async def main():
    server = await asyncio.start_server(handle, args.host, args.port)
    print(f"388 Pueblos en http://{args.host}:{args.port} · base de datos {args.db}", flush=True)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
