"""Servidor propio de 388 Pueblos: web estática + multijugador (WebSocket) + base de datos (SQLite).

Solo usa la biblioteca estándar de Python 3.9+. Abierto a cualquiera, sin cuentas:
- /ws?room=pueblo-<INE>   presencia en tiempo real por pueblo (posición, frases y emojis predefinidos).
- /ws?room=juego-<INE>    el multijugador del juego de ese pueblo (Guareña, juego-06060): cada uno manda su estado y el
                          servidor lo reenvía a los demás (ver «el juego», abajo; docs/multijugador.md en «388 Foto»).
- /api/juego?pueblo=<INE> quién hay en el juego ahora: nombre, calle, sitio y qué hace, y cuántos vecinos hay en la calle;
                          con &con=<código>, dónde está quien tiene ese código para quedar (el enlace «a mi lado»).
- /api/online             personas conectadas ahora, en total y por pueblo.
- /api/yo                 la IP que este servidor ve para quien pregunta y de qué cabecera la saca (para comprobar,
                          tras publicar, que no se puede falsificar: ver ip_cliente).
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
import html
import io
import json
import mimetypes
import os
import re
import hmac
import secrets
import sqlite3
import struct
import time
import urllib.parse
import urllib.request
import zipfile

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
MAX_BODY_OPINION = 2500000  # (la captura y el audio de una opinión del juego, en base64)
MAX_WS_IP = 20  # conexiones a la vez desde una misma IP (una clase entera en la wifi del colegio cabe; una inundación, no)
LENTO = 512 * 1024  # bytes pendientes de mandar a alguien: con más, es que no lee, y se le cierra para que no frene a nadie
IP_RE = re.compile(r"^[0-9A-Fa-f:.]{3,45}$")


def ip_cliente(headers, peer):
    """La IP de quien llama, y de dónde se ha sacado. En Render hay delante Cloudflare, que pone CF-Connecting-IP y
    True-Client-IP con la IP que ve (quien llama no puede cambiarlas: Cloudflare las escribe encima). X-Forwarded-For, en
    cambio, la puede empezar el propio que llama (el proxy de Render añade, no reemplaza): con ella cualquiera se saltaba
    los topes por IP. Solo se usa si no hay las otras (en local no hay ninguna: la de la conexión)."""
    for k in ("cf-connecting-ip", "true-client-ip"):
        v = headers.get(k, "").strip()
        if IP_RE.match(v):
            return v, k
    v = headers.get("x-forwarded-for", "").split(",")[0].strip()
    if IP_RE.match(v):
        return v, "x-forwarded-for"
    return peer, "conexion"

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
room_orden = {}  # room de juego -> cuántos han entrado desde que se abrió (el orden de llegada decide quién mueve a los vecinos)
room_coches = {}  # room de juego -> {coche: [x, y, z, rumbo]}: los coches que alguien ha dejado en otro sitio
callados = {}  # aparato (o ip) -> hasta cuándo (time.time()) no se reenvía lo que dice: le han denunciado
conex_ip = {}  # ip -> cuántas conexiones tiene abiertas ahora (MAX_WS_IP)


class Client:
    def __init__(self, writer, room, ip="?"):
        self.writer = writer
        self.room = room
        self.ip = ip  # (a quién se calla si le denuncian: su aparato o, si no lo dice, su IP)
        self.id = secrets.token_hex(6)
        self.presence = {}
        self.pj = None  # (en el juego: su personaje del editor, o nada si lleva la chica de serie)
        self.orden = 0
        self.denuncias = set()  # (quién le ha denunciado)
        self.cita = None  # (su código para quedar: quien abre su enlace aparece a su lado; no se manda a nadie)
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
    # (fase 2: el coche que conduce o en el que va, con quién va, a quién sigue para los vecinos, dónde está en palabras
    # y cuántos vecinos hay en la calle)
    if isinstance(d.get("co"), str) and (d["co"] == "" or NODO_RE.match(d["co"])):
        out["co"] = d["co"]
    for k in ("cp", "h"):
        if isinstance(d.get(k), str) and (d[k] == "" or ID_RE.match(d[k])):
            out[k] = d[k]
    if isinstance(d.get("w"), str):
        out["w"] = clean_dicho(d["w"])[:80]
    if isinstance(d.get("nv"), int) and not isinstance(d.get("nv"), bool) and 0 <= d["nv"] <= 20000:
        out["nv"] = d["nv"]
    return out


NODO_RE = re.compile(r"^[A-Za-z0-9_.\-]{1,48}$")
CITA_RE = re.compile(r"^[a-z0-9]{8,16}$")
ID_RE = re.compile(r"^[0-9a-f]{12}$")
CLAVE_RE = re.compile(r"^[a-z][a-z0-9_]{0,31}$")


def clean_pj(d):
    """El personaje del editor de alguien (src/personaje.js en «388 Foto»): solo números acotados y nombres de prendas."""
    if not isinstance(d, dict):
        return None
    num = lambda v, lo, hi: isinstance(v, (int, float)) and not isinstance(v, bool) and lo <= v <= hi
    out = {}
    for k, tope in (("fenotipo", 24), ("deslizadores", 96)):
        v = d.get(k)
        if isinstance(v, dict):
            out[k] = {a: round(float(b), 3) for a, b in list(v.items())[:tope] if isinstance(a, str) and CLAVE_RE.match(a) and num(b, -3, 3)}
    for k in ("tono", "vello"):
        v = d.get(k)
        if isinstance(v, list) and len(v) == 3 and all(num(x, 0, 1) for x in v):
            out[k] = [round(float(x), 3) for x in v]
    if isinstance(d.get("ojos"), str) and CLAVE_RE.match(d["ojos"]):
        out["ojos"] = d["ojos"]
    if isinstance(d.get("ropa"), dict):
        out["ropa"] = {t: d["ropa"][t] for t in ("conjunto", "calzado", "pelo")
                       if t in d["ropa"] and (d["ropa"][t] is None or (isinstance(d["ropa"][t], str) and CLAVE_RE.match(d["ropa"][t])))}
    return out or None


def clean_gv(g):
    """Los vecinos que mueve el juego de alguien, para los de su alrededor: [id, cuerpo, x, y, z (cm), rumbo (centésimas de
    radián), clip, señales] por vecino, como mucho 64."""
    if not isinstance(g, list):
        return None
    TOPES = ((0, 10 ** 9), (0, 999), (-600000, 600000), (-600000, 600000), (-600000, 600000), (-700, 700), (0, 63), (0, 255))
    out = []
    for v in g[:64]:
        if isinstance(v, list) and len(v) == 8 and all(isinstance(x, int) and not isinstance(x, bool) and lo <= x <= hi for x, (lo, hi) in zip(v, TOPES)):
            out.append(v)
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


def escribir(c, data):
    """Manda sin esperar a que llegue: antes se esperaba a cada uno por turno y alguien con mala conexión (o que no lee)
    frenaba a toda su sala. Si se le acumula demasiado sin mandar, se le cierra (su bucle lo saca de la sala)."""
    try:
        if c.writer.is_closing():
            return
        c.writer.write(data)
        if c.writer.transport.get_write_buffer_size() > LENTO:
            print(f"cerrada una conexión lenta en {c.room} ({c.presence.get('n', c.id)})", flush=True)
            c.writer.close()
    except (ConnectionError, RuntimeError, AttributeError):
        pass


async def send(c, obj):
    escribir(c, frame(json.dumps(obj, separators=(",", ":"), ensure_ascii=False)))


async def broadcast(room, obj, skip=None):
    data = frame(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))  # (una vez para todos, no una por cada uno)
    for c in list(rooms.get(room, {}).values()):
        if c is not skip:
            escribir(c, data)


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


async def handle_ws(reader, writer, headers, query, ip="?"):
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
    if conex_ip.get(ip, 0) >= MAX_WS_IP:
        writer.write(b"HTTP/1.1 429 Too Many Requests\r\nContent-Length: 0\r\n\r\n")
        await writer.drain()
        return
    accept = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
    writer.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                  f"Sec-WebSocket-Accept: {accept}\r\n\r\n").encode())
    await writer.drain()
    # (a quién se calla si le denuncian: su aparato, si lo dice —lo que guarda el juego en el navegador—, o si no su IP)
    dev = (query.get("d") or [""])[0]
    c = Client(writer, room, ("d:" + dev) if DEVICE_RE.match(dev) else ip)
    if juego and not rooms.get(room):
        room_t0[room] = int(time.time() * 1000)
        room_orden[room] = 0
        room_coches[room] = {}
    rooms.setdefault(room, {})[c.id] = c
    conex_ip[ip] = conex_ip.get(ip, 0) + 1
    if juego:
        room_orden[room] = room_orden.get(room, 0) + 1
        c.orden = room_orden[room]
        await send(c, {"t": "sala", "yo": c.id, "o": c.orden,
                       "otros": [{"id": o.id, "p": o.presence, "o": o.orden, **({"pj": o.pj} if o.pj else {})} for o in rooms[room].values() if o is not c],
                       "coches": room_coches.get(room, {}), "t0": room_t0.get(room), "ahora": int(time.time() * 1000)})
        await broadcast(room, {"t": "entra", "id": c.id, "o": c.orden}, skip=c)
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
                hasta = callados.get(c.ip, 0)
                if x and hasta > time.time():
                    await send(c, {"t": "callado", "s": int(hasta - time.time())})
                elif x and ahora - c.dicho >= 1.5:
                    c.dicho = ahora
                    a = msg.get("a") if isinstance(msg.get("a"), str) and ID_RE.match(msg.get("a") or "") else None
                    await broadcast(room, {"t": "di", "id": c.id, "x": x, **({"a": a} if a else {})})
            elif juego and t == "pj":
                c.pj = clean_pj(msg.get("f"))
                await broadcast(room, {"t": "pj", "id": c.id, "f": c.pj}, skip=c)
            elif juego and t == "cd":
                # (un coche que alguien deja en otro sitio: quien entre después lo verá ahí)
                o, xyz = msg.get("o"), [msg.get(k) for k in ("x", "y", "z", "r")]
                if isinstance(o, str) and NODO_RE.match(o) and all(isinstance(v, (int, float)) and not isinstance(v, bool) and -6000 <= v <= 6000 for v in xyz):
                    cs = room_coches.setdefault(room, {})
                    if o in cs or len(cs) < 300:
                        cs[o] = [round(float(v), 2) for v in xyz]
                        await broadcast(room, {"t": "cd", "id": c.id, "o": o, "x": cs[o][0], "y": cs[o][1], "z": cs[o][2], "r": cs[o][3]}, skip=c)
            elif juego and t == "gv":
                g = clean_gv(msg.get("g"))
                if g is not None:
                    await broadcast(room, {"t": "gv", "id": c.id, "g": g}, skip=c)
            elif juego and t == "go":
                # (lo que quiere hacer alguien con un vecino que mueve el juego de otro —hablarle, que le acompañe…—: solo a ese)
                o = rooms.get(room, {}).get(msg.get("a")) if isinstance(msg.get("a"), str) else None
                num = lambda v, lo, hi: isinstance(v, (int, float)) and not isinstance(v, bool) and lo <= v <= hi
                if o and o is not c and num(msg.get("i"), 0, 10 ** 9) and num(msg.get("o"), 0, 15) and num(msg.get("x"), -6000, 6000) and num(msg.get("z"), -6000, 6000):
                    await send(o, {"t": "go", "id": c.id, "i": int(msg["i"]), "o": int(msg["o"]), "x": round(float(msg["x"]), 2), "z": round(float(msg["z"]), 2)})
            elif juego and t == "cita":
                # (mi código para quedar: se guarda aquí y no se reenvía)
                c.cita = msg.get("c") if isinstance(msg.get("c"), str) and CITA_RE.match(msg.get("c")) else None
            elif juego and t in ("busco", "llego"):
                # (quien ha abierto el enlace de alguien: «busco», ¿está?; «llego», ya estoy a su lado: se le avisa)
                cod = msg.get("c") if isinstance(msg.get("c"), str) and CITA_RE.match(msg.get("c")) else None
                o = next((x for x in rooms.get(room, {}).values() if cod and x.cita == cod and x is not c), None)
                if o and t == "busco":
                    await send(c, {"t": "cita", "c": cod, "id": o.id})
                elif o and t == "llego":
                    await send(o, {"t": "llega", "id": c.id})
            elif juego and t == "den":
                # (una denuncia: con la de otro más —o con una sola si solo están los dos—, se le deja sin hablar 15 minutos)
                o = rooms.get(room, {}).get(msg.get("a")) if isinstance(msg.get("a"), str) else None
                if o and o is not c and c.id not in o.denuncias:
                    o.denuncias.add(c.id)
                    await send(c, {"t": "denunciado", "a": o.id})
                    falta = 1 if len(rooms.get(room, {})) <= 2 else 2
                    if len(o.denuncias) >= falta and callados.get(o.ip, 0) <= time.time():
                        callados[o.ip] = time.time() + 900
                        print(f"denuncia en {room}: {o.presence.get('n', o.id)} sin hablar 15 min ({len(o.denuncias)} denuncias)", flush=True)
                        await send(o, {"t": "callado", "s": 900})
    except (asyncio.IncompleteReadError, asyncio.TimeoutError, ConnectionError):
        pass
    finally:
        rooms.get(room, {}).pop(c.id, None)
        if conex_ip.get(ip, 0) <= 1:
            conex_ip.pop(ip, None)
        else:
            conex_ip[ip] -= 1
        p = c.presence
        if juego and p.get("m") == 7 and p.get("co") and all(k in p for k in ("x", "y", "z", "r")):
            # (se ha ido conduciendo: el coche se queda donde estaba, con el suelo y el rumbo del coche aparcado)
            cd = [p["x"], round(p["y"] - 0.42, 2), p["z"], round(p["r"] - 90, 1)]
            room_coches.setdefault(room, {})[p["co"]] = cd
            await broadcast(room, {"t": "cd", "id": c.id, "o": p["co"], "x": cd[0], "y": cd[1], "z": cd[2], "r": cd[3]})
        if not rooms.get(room):
            rooms.pop(room, None)
            room_t0.pop(room, None)
            room_orden.pop(room, None)
            room_coches.pop(room, None)
        await broadcast(room, {"t": "sale" if juego else "bye", "id": c.id})
        for k in [k for k, v in callados.items() if v < time.time()]:
            callados.pop(k, None)


# ---------------- API ----------------
writes = {}  # ip -> [timestamps]


def rate_ok(ip, limit=30, window=60):
    now = time.time()
    if len(writes) > 5000:  # (que no crezca sin fin: fuera las IP que llevan un rato sin escribir)
        for k in [k for k, v in writes.items() if not v or now - v[-1] >= window]:
            writes.pop(k, None)
    q = [t for t in writes.get(ip, []) if now - t < window]
    if len(q) >= limit:
        writes[ip] = q
        return False
    q.append(now)
    writes[ip] = q
    return True


def api(method, path, query, body, ip, fuente="conexion"):
    if path == "/api/yo":
        return 200, {"ip": ip, "de": fuente}
    if path == "/api/online":
        return 200, {"total": sum(len(r) for k, r in rooms.items() if k.startswith("pueblo-")),
                     "pueblos": {k[7:]: len(v) for k, v in rooms.items() if k.startswith("pueblo-")},
                     "juego": {k[6:]: len(v) for k, v in rooms.items() if k.startswith("juego-")}}
    if path == "/api/juego" and method == "GET":
        pueblo = (query.get("pueblo") or [""])[0]
        if not INE_RE.match(pueblo):
            return 400, {"error": "pueblo no válido"}
        sala = rooms.get("juego-" + pueblo, {})
        con = (query.get("con") or [""])[0]
        if con:
            # (el enlace para quedar: dónde está quien tiene ese código, para salir a su lado; sin él, nada)
            o = next((c for c in sala.values() if CITA_RE.match(con) and c.cita == con), None)
            p = o.presence if o else {}
            return 200, {"con": {k: p[k] for k in ("n", "x", "y", "z", "r", "m") if k in p} if o and "x" in p else None}
        gente = [{k: c.presence[k] for k in ("n", "k", "l", "m", "w") if k in c.presence} for c in sala.values()]
        nv = [c.presence["nv"] for c in sala.values() if "nv" in c.presence]
        return 200, {"humanos": len(sala), "gente": gente, "vecinos": max(nv) if nv else None, "t0": room_t0.get("juego-" + pueblo)}
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
# lo que hace), corta, y con topes: 12 charlas por minuto y 150 al día por cada IP (la de ip_cliente: la que no se puede
# falsificar), y 4.000 al día en total (OPENAI_TOPE_DIA). Solo desde las páginas del juego: el navegador siempre dice de
# qué página viene (Origin) y aquí se pide que sea una de ellas, igual entera (antes valía cualquiera que empezase igual, y
# sin Origin —un programa cualquiera— también).
# OPENAI_MODELO (gpt-5.6-luna) y OPENAI_ESFUERZO (high) los cambian; OPENAI_URL, para las pruebas.
VEC_HACE = ["nada", "saludar", "acompanar", "irse", "sentarse"]
VEC_TIPOS = {"mayor", "adulto", "joven", "nino"}
vec_ip, vec_dia = {}, {"dia": "", "n": 0}
VEC_ORIGENES = ("https://nestorguerra.github.io", "https://pueblos388.onrender.com")
VEC_LOCALES = ("http://127.0.0.1", "http://localhost")  # (en local, con cualquier puerto)


def vec_origen_ok(o):
    return o in VEC_ORIGENES or any(o == l or (o.startswith(l + ":") and o[len(l) + 1:].isdigit()) for l in VEC_LOCALES)


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
    if not vec_origen_ok(origen):
        return 403, {"error": "origen no permitido"}
    clave = os.environ.get("OPENAI_API_KEY", "").strip()
    if not clave:
        return 503, {"error": "sin clave"}
    now = time.time(); hoy = time.strftime("%Y-%m-%d")
    if vec_dia["dia"] != hoy:
        vec_dia.update(dia=hoy, n=0); vec_ip.clear()
    q = vec_ip.setdefault(ip, {"min": [], "dia": 0})
    q["min"] = [t for t in q["min"] if now - t < 60]
    try:
        tope_dia = int(os.environ.get("OPENAI_TOPE_DIA", "4000"))
    except ValueError:
        tope_dia = 4000
    if len(q["min"]) >= 12 or q["dia"] >= 150 or vec_dia["n"] >= tope_dia:
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


# La opinión de quien prueba el juego (src/opinion.js del juego, 21-11-2026): POST /api/opinion con el texto, la captura
# (JPEG en base64) y, si la hay, la voz. Solo desde las páginas del juego (Origin, como los vecinos). Aquí se pasa la voz
# a texto (OpenAI, con la clave de los vecinos; OPENAI_TRANSCRIPCION, el modelo) y todo se manda a un canal privado de
# Discord por su webhook (DISCORD_OPINIONES, que se pone en el panel de Render, nunca en el repositorio). No se guarda
# nada en este servidor: su base de datos se borra al dormirse. Topes: 6 por hora y 30 al día por IP (cuentan también los
# intentos fallidos; las IPv6, por su /64), 400 al día en total y 100 transcripciones al día; el audio, 1,2 MB como mucho.
# Antes de leer el cuerpo (hasta 2,5 MB) se miran el método, el origen, el buzón y el tope, y solo se leen cuatro a la vez
# y uno por IP: si no, cien conexiones lentas de 5 MB tumbaban el proceso, con el multijugador dentro (revisión, 21-11-2026).
op_ip, op_dia, op_subiendo = {}, {"dia": "", "n": 0, "voz": 0}, {}


def op_quien(ip):
    return ":".join(ip.split(":")[:4]) if ":" in ip else ip


def op_md(s):
    """sin formato ni enlaces de Discord"""
    return re.sub(r"([\\\[\]()*_~>#|`])", r"\\\1", s).replace("@", "@\u200b").replace("://", ":/\u200b/")


def op_destinos():
    """adónde se entregan: el correo (Resend: RESEND_API_KEY y OPINIONES_CORREO, la dirección que las recibe) y, si está,
    el canal de Discord (DISCORD_OPINIONES). Todo se pone en el panel de Render, nunca en el repositorio."""
    d = {}
    if os.environ.get("RESEND_API_KEY", "").strip() and "@" in os.environ.get("OPINIONES_CORREO", ""):
        d["correo"] = os.environ["OPINIONES_CORREO"].strip()
    w = os.environ.get("DISCORD_OPINIONES", "").strip()
    if w.startswith("https://") or w.startswith("http://127.0.0.1:"):  # (en local, para las pruebas)
        d["discord"] = w
    if op_bd_hay():
        d["base"] = True
    return d


# Guardadas, para verlas y descargarlas (22-11-2026; el usuario no quiso dar de alta un servicio de correo): en la base de
# datos Postgres de Render (DATABASE_URL; la gratuita da 1 GB, caduca a los 30 días y no tiene copias: hay que
# descargarlas) o, en las pruebas, en un archivo SQLite (OPINIONES_SQLITE). Se ven en una página privada,
# /api/opiniones?clave=…, con la clave de OPINIONES_CLAVE (la genera Render; está en su panel), y se bajan en un .zip.
OP_TOPE_BASE = 850 * 1024 * 1024
OP_TOPE_ZIP = 30 * 1024 * 1024  # (el .zip se arma en memoria: por partes de 30 MB, o el proceso se queda sin ella)
op_bd_hecha = []


def op_bd_hay():
    u = os.environ.get("DATABASE_URL", "").strip()
    if u.startswith(("postgres://", "postgresql://")):
        try:
            import pg8000.dbapi  # noqa: F401
            return True
        except ImportError:
            return False
    return bool(os.environ.get("OPINIONES_SQLITE", "").strip())


def op_bd():
    """(conexión, marca de parámetro, si es Postgres), con la tabla hecha"""
    u = os.environ.get("DATABASE_URL", "").strip()
    if u.startswith(("postgres://", "postgresql://")):
        import pg8000.dbapi
        s = urllib.parse.urlsplit(u)
        c = pg8000.dbapi.connect(user=urllib.parse.unquote(s.username or ""), password=urllib.parse.unquote(s.password or ""), host=s.hostname,
                                 port=s.port or 5432, database=s.path.lstrip("/"), timeout=15)
        m, pg = "%s", True
    else:
        c = sqlite3.connect(os.environ["OPINIONES_SQLITE"].strip(), timeout=15); m, pg = "?", False
    if op_bd_hecha:
        return c, m, pg
    cur = c.cursor()
    cur.execute("CREATE TABLE IF NOT EXISTS opiniones (id " + ("SERIAL PRIMARY KEY" if pg else "INTEGER PRIMARY KEY AUTOINCREMENT") + ", cuando TEXT, nombre TEXT, "
                "texto TEXT, dicho TEXT, nota TEXT, sitio TEXT, tecnico TEXT, captura " + ("BYTEA" if pg else "BLOB") + ", audio " + ("BYTEA" if pg else "BLOB") + ", audio_tipo TEXT)")
    c.commit(); op_bd_hecha.append(1)
    return c, m, pg


def op_guardar(d, dicho, nota, captura, audio, tipo_audio):
    c, m, _ = op_bd()
    try:
        cur = c.cursor()
        cur.execute("SELECT COALESCE(SUM(COALESCE(LENGTH(captura), 0) + COALESCE(LENGTH(audio), 0)), 0) FROM opiniones")
        if int(cur.fetchone()[0] or 0) > OP_TOPE_BASE:
            raise RuntimeError("la base de opiniones está llena")
        cur.execute(f"INSERT INTO opiniones (cuando, nombre, texto, dicho, nota, sitio, tecnico, captura, audio, audio_tipo) VALUES ({', '.join([m] * 10)})",
                    (time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()), d["nombre"], d["texto"], dicho, nota,
                     f"{d['escena'] or 'juego'} · x {d['x']}, z {d['z']} · {d['hora']}", f"{d['pantalla']} · {d['gpu']} · {d['navegador']}",
                     captura or None, audio or None, tipo_audio.split(";")[0] if audio else ""))
        c.commit()
    finally:
        c.close()


op_malas = {}


def op_admin(method, path, query, ip):
    """la página privada y sus descargas: (estado, cuerpo, tipo). Con la clave mal, 403 (y tras 10 fallos en una hora, 429)"""
    texto = lambda s, st=200: (st, s.encode("utf-8"), "text/plain; charset=utf-8")
    clave = os.environ.get("OPINIONES_CLAVE", "").strip(); dada = (query.get("clave") or [""])[0]
    now = time.time(); k = op_quien(ip); malas = [x for x in op_malas.get(k, []) if now - x < 3600]
    if len(op_malas) > 2000:  # (que no crezca sin fin)
        for q_ in [q_ for q_, v_ in op_malas.items() if not v_ or now - v_[-1] > 3600]:
            op_malas.pop(q_, None)
    if len(malas) >= 10:
        return texto("Demasiados intentos. Prueba dentro de una hora.", 429)
    # (la clave que genera Render es base64 y puede llevar «+», que en una dirección se lee como espacio)
    if len(clave) < 16 or not any(secrets.compare_digest(x.encode(), clave.encode()) for x in (dada, dada.replace(" ", "+"))):
        op_malas[k] = malas + [now]
        return texto("Hace falta la clave.", 403)
    if not op_bd_hay():
        return texto("La base de datos de las opiniones no está montada todavía.", 503)
    try:
        return op_admin_con(method, path, query, clave, texto)
    except Exception as e:
        print(f"opiniones: la página privada falló ({type(e).__name__}: {str(e)[:120]})", flush=True)
        return texto("La base de datos de las opiniones no responde ahora. Prueba en un momento.", 503)


def op_admin_con(method, path, query, clave, texto, base="/api/opiniones", aut=None):
    """la lista, las capturas, las voces, el .zip y el borrado, bajo «base» (/api/opiniones, con la clave en la dirección;
    /feedbacks, con la galleta de haber entrado: aut vacío)"""
    def num(k_, por):
        v = (query.get(k_) or [""])[0]
        return int(v) if v.isdecimal() and len(v) <= 9 else por
    c, m, _ = op_bd(); qc = urllib.parse.quote(clave, safe="")
    aut = f"clave={qc}" if aut is None else aut; A = ("&" + aut) if aut else ""; A0 = ("?" + aut) if aut else ""
    sub = path[len(base):].rstrip("/")
    try:
        cur = c.cursor()
        if method == "POST":
            if sub != "/borrar":
                return texto("No está.", 404)
            cur.execute(f"DELETE FROM opiniones WHERE id = {m}", (num("id", 0),)); c.commit()
            return 200, (f'<!doctype html><meta charset=utf-8><meta http-equiv=refresh content="0;url={base}{A0}">Borrada.').encode("utf-8"), "text/html; charset=utf-8"
        if sub in ("/captura", "/voz"):
            col = "captura" if sub == "/captura" else "audio"
            cur.execute(f"SELECT {col}, audio_tipo FROM opiniones WHERE id = {m}", (num("id", 0),)); f = cur.fetchone()
            if not f or not f[0]:
                return texto("No está.", 404)
            return 200, bytes(f[0]), "image/jpeg" if col == "captura" else (f[1] or "audio/webm")
        antes = num("antes", 0); n = max(1, min(num("n", 25), 50))
        cur.execute("SELECT COUNT(*) FROM opiniones"); total = int(cur.fetchone()[0])
        if sub == "/descarga.zip":
            cur.execute("SELECT id, cuando, nombre, texto, dicho, nota, sitio, tecnico, COALESCE(LENGTH(captura), 0) + COALESCE(LENGTH(audio), 0), audio_tipo FROM opiniones"
                        + (f" WHERE id < {m}" if antes else "") + f" ORDER BY id DESC LIMIT {n}", (antes,) if antes else ())
            filas = cur.fetchall(); b = io.BytesIO(); lista = []; pesa = 0
            with zipfile.ZipFile(b, "w", zipfile.ZIP_STORED) as z:
                for i, cuando, nombre, tx, dicho, nota, sitio, tecnico, tam, tipo in filas:
                    if lista and pesa + int(tam or 0) > OP_TOPE_ZIP:
                        break
                    pesa += int(tam or 0)
                    cur.execute(f"SELECT captura, audio FROM opiniones WHERE id = {m}", (i,)); cap, au = cur.fetchone()
                    ext = "mp4" if "mp4" in (tipo or "") else "ogg" if "ogg" in (tipo or "") else "webm"
                    e = {"id": i, "cuando": cuando, "nombre": nombre, "texto": tx, "dicho": dicho, "nota": nota, "sitio": sitio, "tecnico": tecnico,
                         "captura": f"capturas/{i}.jpg" if cap else "", "voz": f"voces/{i}.{ext}" if au else ""}
                    lista.append(e)
                    if cap:
                        z.writestr(e["captura"], bytes(cap))
                    if au:
                        z.writestr(e["voz"], bytes(au))
                    cap = au = None
                if lista and len(lista) < len(filas):
                    z.writestr("FALTAN.txt", f"Este archivo llega hasta la opinión #{lista[-1]['id']}. Para las anteriores, abre la página con &antes={lista[-1]['id']} y descarga otra vez.")
                z.writestr("opiniones.json", json.dumps(lista, ensure_ascii=False, indent=1))
                z.writestr("opiniones.txt", "\n\n".join(f"#{e['id']} · {e['cuando']} · {e['nombre'] or 'alguien'}\n{e['sitio']}\nESCRITO: {e['texto']}\nDICHO: {e['dicho']} {e['nota']}\n{e['tecnico']}" for e in lista))
            return 200, b.getvalue(), "application/zip"
        if sub != "":
            return texto("No está.", 404)
        cur.execute("SELECT id, cuando, nombre, texto, dicho, nota, sitio, tecnico, captura IS NOT NULL, audio IS NOT NULL FROM opiniones"
                    + (f" WHERE id < {m}" if antes else "") + f" ORDER BY id DESC LIMIT {n}", (antes,) if antes else ())
        filas = cur.fetchall(); h = html.escape; trozos = []
        for i, cuando, nombre, tx, dicho, nota, sitio, tecnico, hay_cap, hay_au in filas:
            trozos.append(f'<article><h2>#{i} · {h(nombre or "alguien")} <small>{h(cuando or "")}</small></h2><p class="s">{h(sitio or "")}</p>'
                          + (f'<a href="{base}/captura?id={i}{A}" target="_blank"><img loading="lazy" src="{base}/captura?id={i}{A}" alt="Captura de la opinión {i}"></a>' if hay_cap else "")
                          + (f'<p><b>Escrito:</b> {h(tx)}</p>' if tx else "") + (f'<p><b>Dicho:</b> {h(dicho)}</p>' if dicho else "") + (f'<p class="s">{h(nota)}</p>' if nota else "")
                          + (f'<audio controls preload="none" src="{base}/voz?id={i}{A}"></audio>' if hay_au else "") + f'<p class="s">{h(tecnico or "")}</p><form method="post" action="{base}/borrar?id={i}{A}" onsubmit="return confirm(\'¿Borrar la opinión #{i}? No se puede deshacer.\')"><button>Borrar</button></form></article>')
        ultimo = filas[-1][0] if filas else 0
        pie = (f'<p><a class="b" href="{base}?antes={ultimo}{A}">Más antiguas →</a></p>' if len(filas) == n and ultimo > 1 else "")
        pag = ("<!doctype html><html lang=es><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><meta name=robots content=noindex>"
               "<title>Opiniones · 388 Pueblos</title><style>body{margin:0;background:#14161f;color:#f4efe6;font:15px/1.5 system-ui,sans-serif}main{max-width:760px;margin:auto;padding:20px 16px 60px}"
               "h1{font:600 26px Georgia,serif;margin:8px 0}h2{font:600 17px system-ui;margin:0 0 4px}small,.s{color:#b9b3a6;font-size:13px;font-weight:400}article{border:1px solid #2c2f3c;border-radius:14px;padding:14px;margin:14px 0;background:#191c27}"
               "img{display:block;max-width:100%;border-radius:10px;margin:8px 0}audio{width:100%;margin-top:6px}p{margin:6px 0;overflow-wrap:anywhere}.b{display:inline-block;background:#f5a742;color:#1a1408;text-decoration:none;font-weight:600;border-radius:999px;padding:9px 15px;margin:6px 8px 6px 0}button{background:none;border:1px solid #5a3a3a;color:#ff9a8f;border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer;margin-top:8px}</style>"
               f"<main><h1>Opiniones de la beta</h1><p class=s>{total} guardadas. Se ven las {len(filas)} más recientes{' anteriores a la #' + str(antes) if antes else ''}. "
               "La base de datos gratuita caduca a los 30 días de crearse: descárgalas de vez en cuando.</p>"
               f'<p><a class="b" href="{base}/descarga.zip?n={n}{A}' + (f"&antes={antes}" if antes else "") + f'">Descargar estas {len(filas)} (.zip)</a>'
               + ('<a class="b" href="/feedbacks/salir" style="background:none;border:1px solid #f5a742;color:#f5a742">Salir</a>' if base == "/feedbacks" else "") + '</p>'
               + "".join(trozos) + (pie or "") + ("<p class=s>Todavía no ha llegado ninguna.</p>" if not total else "") + "</main></html>")
        return 200, pag.encode("utf-8"), "text/html; charset=utf-8"
    finally:
        c.close()


# ---- /feedbacks: la misma página privada, en la web (pueblos388.onrender.com/feedbacks la trae de aquí, render.yaml),
# entrando con la clave en un formulario (OPINIONES_CLAVE) y no en la dirección: queda una galleta firmada con la clave
# (HttpOnly, Secure, SameSite=Lax: un formulario de otro sitio no puede borrar nada), de 30 días. 22-11-2026, el usuario:
# «monta el buzón de opiniones en una web externa dentro del dominio que se llama feedbacks».
FB_GALLETA = "fb388"
FB_ESTILO = ("<style>body{margin:0;background:#14161f;color:#f4efe6;font:15px/1.5 system-ui,sans-serif}main{max-width:420px;margin:12vh auto;padding:20px 16px}"
             "h1{font:600 26px Georgia,serif;margin:8px 0}.s{color:#b9b3a6;font-size:13px}input{width:100%;box-sizing:border-box;font:inherit;padding:11px 14px;border-radius:12px;"
             "border:1px solid #2c2f3c;background:#191c27;color:#f4efe6;margin:10px 0}button,.b{display:inline-block;background:#f5a742;color:#1a1408;border:0;text-decoration:none;"
             "font:600 15px system-ui;border-radius:999px;padding:10px 18px;cursor:pointer}.e{color:#ff9a8f}</style>")


def fb_firma(clave):
    return hmac.new(clave.encode(), b"feedbacks-388", hashlib.sha256).hexdigest()


def fb_galleta(headers):
    for parte in headers.get("cookie", "").split(";"):
        k, _, v = parte.strip().partition("=")
        if k == FB_GALLETA:
            return v
    return ""


def fb_pagina(cuerpo, st=200):
    return st, ("<!doctype html><html lang=es><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><meta name=robots content=noindex>"
                "<title>Feedbacks · 388 Pueblos</title>" + FB_ESTILO + "<main>" + cuerpo + "</main></html>").encode("utf-8"), "text/html; charset=utf-8", ""


def fb_entrar(error=""):
    return fb_pagina("<h1>Opiniones de la beta</h1><p class=s>Lo que mandan quienes prueban el juego (la tecla O): captura, texto y voz.</p>"
                     + (f"<p class=e>{html.escape(error)}</p>" if error else "")
                     + "<form method=post action='/feedbacks/entrar'><input type=password name=clave autocomplete=current-password placeholder='Clave' required autofocus>"
                     "<button>Entrar</button></form><p class=s>La clave es OPINIONES_CLAVE, en el panel de Render (servicio 388-pueblos, Environment).</p>", 403 if error else 200)


def op_feedbacks(method, path, query, body, ip, headers):
    """(estado, cuerpo, tipo, cabeceras de más)"""
    texto = lambda s, st=200: (st, s.encode("utf-8"), "text/plain; charset=utf-8")
    clave = os.environ.get("OPINIONES_CLAVE", "").strip()
    sub = path[len("/feedbacks"):].rstrip("/")
    seguro = "; Secure" if os.environ.get("RENDER") else ""   # (en local, sin https)
    if sub == "/entrar" and method == "POST":
        now = time.time(); k = op_quien(ip); malas = [x for x in op_malas.get(k, []) if now - x < 3600]
        if len(malas) >= 10:
            return fb_entrar("Demasiados intentos. Prueba dentro de una hora.")
        dada = (urllib.parse.parse_qs(body.decode("utf-8", "replace")).get("clave") or [""])[0].strip()
        if len(clave) < 16:
            return fb_entrar("El buzón no tiene clave todavía (OPINIONES_CLAVE, en el panel de Render).")
        if not secrets.compare_digest(dada.encode(), clave.encode()):
            op_malas[k] = malas + [now]
            return fb_entrar("Esa clave no es.")
        return 303, b"", "text/plain", f"Location: /feedbacks\r\nSet-Cookie: {FB_GALLETA}={fb_firma(clave)}; Path=/feedbacks; Max-Age=2592000; HttpOnly{seguro}; SameSite=Lax\r\n"
    if sub == "/salir":
        return 303, b"", "text/plain", f"Location: /feedbacks\r\nSet-Cookie: {FB_GALLETA}=; Path=/feedbacks; Max-Age=0; HttpOnly{seguro}; SameSite=Lax\r\n"
    if len(clave) < 16 or not secrets.compare_digest(fb_galleta(headers).encode(), fb_firma(clave).encode()):
        return fb_entrar() if sub == "" and method in ("GET", "HEAD") else (*texto("Hace falta entrar: /feedbacks", 403), "")
    if not op_bd_hay():
        return fb_pagina("<h1>Opiniones de la beta</h1><p>La base de datos de las opiniones no está montada todavía: hay que crearla en Render "
                         "(la base gratuita «opiniones388» del render.yaml) y darle su dirección al servidor (DATABASE_URL).</p>"
                         "<p><a class=b href='/feedbacks/salir'>Salir</a></p>", 503)
    try:
        return (*op_admin_con(method, "/feedbacks" + sub, query, clave, texto, base="/feedbacks", aut=""), "")
    except Exception as e:
        print(f"opiniones: /feedbacks falló ({type(e).__name__}: {str(e)[:120]})", flush=True)
        return (*texto("La base de datos de las opiniones no responde ahora. Prueba en un momento.", 503), "")


def op_correo(para, d, dicho, nota, captura, audio, tipo_audio):
    """un correo por opinión (Resend), con la captura y la voz adjuntas; d, los datos sin el escapado de Discord"""
    cuerpo = [f"Opinión de {d['nombre'] or 'alguien'}", f"Dónde: {d['escena'] or 'juego'} · x {d['x']}, z {d['z']} · {d['hora']}", ""]
    if d["texto"]:
        cuerpo += ["ESCRITO:", d["texto"], ""]
    if dicho:
        cuerpo += ["DICHO (transcrito):", dicho, ""]
    if nota:
        cuerpo += [nota, ""]
    cuerpo += [f"{d['pantalla']} · {d['gpu']} · {d['navegador']}"]
    adjuntos = []
    if captura:
        adjuntos.append({"filename": "captura.jpg", "content": base64.b64encode(captura).decode()})
    if audio:
        ext = "mp4" if "mp4" in tipo_audio else "ogg" if "ogg" in tipo_audio else "webm"
        adjuntos.append({"filename": f"voz.{ext}", "content": base64.b64encode(audio).decode()})
    resumen = re.sub(r"\s+", " ", d["texto"] or dicho or "con voz")[:60]
    msg = {"from": os.environ.get("OPINIONES_REMITE", "388 Pueblos <onboarding@resend.dev>"), "to": [para],
           "subject": f"[388 opinión] {d['nombre'] or 'alguien'}: {resumen}", "text": "\n".join(cuerpo), "attachments": adjuntos}
    req = urllib.request.Request(os.environ.get("RESEND_URL", "https://api.resend.com/emails"), data=json.dumps(msg).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {os.environ['RESEND_API_KEY'].strip()}",
                                          "User-Agent": "388Pueblos/1"}, method="POST")
    with urllib.request.urlopen(req, timeout=25) as r:
        r.read()


def opinion_antes(method, ip, origen):
    """lo que se puede decidir con las cabeceras, antes de leer el cuerpo: (estado, respuesta) o None si puede seguir"""
    if method != "POST":
        return 405, {"error": "solo POST"}
    if not vec_origen_ok(origen):
        return 403, {"error": "origen no permitido"}
    if not op_destinos():
        return 503, {"error": "el buzón de opiniones no está montado todavía"}
    now = time.time(); hoy = time.strftime("%Y-%m-%d"); k = op_quien(ip)
    if op_dia["dia"] != hoy:
        op_dia.update(dia=hoy, n=0, voz=0); op_ip.clear()
    q = op_ip.setdefault(k, {"hora": [], "dia": 0})
    q["hora"] = [t for t in q["hora"] if now - t < 3600]
    if len(q["hora"]) >= 6 or q["dia"] >= 30 or op_dia["n"] >= 400:
        return 429, {"error": "has mandado muchas opiniones seguidas; prueba dentro de un rato"}
    if len(op_subiendo) >= 4 or k in op_subiendo:
        return 429, {"error": "el buzón está ocupado; prueba en unos segundos"}
    q["hora"].append(now); q["dia"] += 1; op_dia["n"] += 1
    return None


def op_multiparte(campos, archivos):
    """(cuerpo, tipo) de un formulario multipart: campos {nombre: texto} y archivos [(nombre, archivo, tipo, bytes)]"""
    borde = "----388pueblos" + secrets.token_hex(12); trozos = []
    for k, v in campos.items():
        trozos.append(f'--{borde}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n'.encode() + str(v).encode("utf-8") + b"\r\n")
    for k, nombre, tipo, datos in archivos:
        trozos.append(f'--{borde}\r\nContent-Disposition: form-data; name="{k}"; filename="{nombre}"\r\nContent-Type: {tipo}\r\n\r\n'.encode() + datos + b"\r\n")
    return b"".join(trozos) + f"--{borde}--\r\n".encode(), f"multipart/form-data; boundary={borde}"


def op_transcribir(clave, audio, tipo):
    ext = "mp4" if "mp4" in tipo else "ogg" if "ogg" in tipo else "webm"
    cuerpo, ctipo = op_multiparte({"model": os.environ.get("OPENAI_TRANSCRIPCION", "whisper-1"), "language": "es", "response_format": "json"},
                                  [("file", f"voz.{ext}", tipo.split(";")[0] or "audio/webm", audio)])
    req = urllib.request.Request(os.environ.get("OPENAI_URL_AUDIO", "https://api.openai.com/v1/audio/transcriptions"), data=cuerpo,
                                 headers={"Content-Type": ctipo, "Authorization": f"Bearer {clave}"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return str(json.loads(r.read().decode("utf-8")).get("text", "")).strip()


def op_enviar(destinos, crudo, d, captura, audio, tipo_audio):
    """la transcripción (si hay voz y clave) y la entrega: por correo (crudo, los datos tal cual) y al canal de Discord
    (d, escapados); vale con que llegue por uno. Devuelve el texto transcrito"""
    dicho, nota = "", ""
    if audio:
        clave = os.environ.get("OPENAI_API_KEY", "").strip()
        if clave and op_dia["voz"] >= 100:
            nota = "(tope diario de transcripciones: va solo el audio)"
        elif clave:
            op_dia["voz"] += 1
            try:
                dicho = op_transcribir(clave, audio, tipo_audio)
            except Exception as e:  # (sin transcripción, el audio va igual)
                nota = f"(no se pudo transcribir: {type(e).__name__})"
        else:
            nota = "(sin clave para transcribir)"
    hechas, fallo = 0, None
    if "base" in destinos:
        try:
            op_guardar(crudo, dicho, nota, captura, audio, tipo_audio); hechas += 1
        except Exception as e:
            fallo = e; print(f"opinion: no se guardó ({type(e).__name__}: {str(e)[:120]})", flush=True)
    if "correo" in destinos:
        try:
            op_correo(destinos["correo"], crudo, dicho, nota, captura, audio, tipo_audio); hechas += 1
        except Exception as e:
            fallo = e; print(f"opinion: el correo no salió ({type(e).__name__}: {str(e)[:120]})", flush=True)
    if "discord" in destinos:
        try:
            lineas = [f"**Opinión de {d['nombre'] or 'alguien'}** · {d['escena'] or 'juego'} · x {d['x']}, z {d['z']} · {d['hora']}"]
            pie = f"-# {d['pantalla']} · {d['gpu']} · {d['navegador']}"[:240]
            if d["texto"]:
                lineas.append("**Escrito:** " + d["texto"][:900])
            if dicho:
                lineas.append("**Dicho:** " + op_md(dicho)[:max(200, 1900 - len(pie) - sum(len(l) + 1 for l in lineas))])
            if nota:
                lineas.append(nota)
            lineas.append(pie)
            archivos = []
            if captura:
                archivos.append((f"files[{len(archivos)}]", "captura.jpg", "image/jpeg", captura))
            if audio:
                ext = "mp4" if "mp4" in tipo_audio else "ogg" if "ogg" in tipo_audio else "webm"
                archivos.append((f"files[{len(archivos)}]", f"voz.{ext}", tipo_audio.split(";")[0] or "audio/webm", audio))
            cuerpo, ctipo = op_multiparte({"payload_json": json.dumps({"content": "\n".join(lineas)[:1990], "allowed_mentions": {"parse": []}, "flags": 4}, ensure_ascii=False)}, archivos)
            req = urllib.request.Request(destinos["discord"], data=cuerpo, headers={"Content-Type": ctipo, "User-Agent": "388Pueblos (https://pueblos388.onrender.com, 1)"}, method="POST")
            with urllib.request.urlopen(req, timeout=20) as r:
                r.read()
            hechas += 1
        except Exception as e:
            fallo = e; print(f"opinion: Discord no lo recibió ({type(e).__name__}: {str(e)[:120]})", flush=True)
    if not hechas:
        raise fallo or RuntimeError("sin destino")
    return dicho


async def opinion(body):
    destinos = op_destinos()
    try:
        d = json.loads(body.decode("utf-8") or "{}"); assert isinstance(d, dict)
        captura = base64.b64decode(d.get("captura") or "", validate=True); audio = base64.b64decode(d.get("audio") or "", validate=True)
    except Exception:
        return 400, {"error": "datos no válidos"}
    if captura and (captura[:2] != b"\xff\xd8" or len(captura) > 1500000):
        return 400, {"error": "captura no válida"}
    tipo_audio = vec_texto(d.get("audio_tipo"), 60).lower()
    if audio and (len(audio) > 1200000 or not re.fullmatch(r"audio/(webm|mp4|ogg)(;\s*codecs=[\w.,\- ]+)?", tipo_audio)):
        return 400, {"error": "audio no válido"}
    limpio = {"texto": vec_texto(d.get("texto"), 1500), "nombre": vec_texto(d.get("nombre"), 40), "escena": vec_texto(d.get("escena"), 30),
              "hora": vec_texto(d.get("hora"), 60), "pantalla": vec_texto(d.get("pantalla"), 20), "gpu": vec_texto(d.get("gpu"), 20),
              "navegador": vec_texto(d.get("navegador"), 160)}
    for k in ("x", "z"):
        limpio[k] = round(float(d[k]), 1) if isinstance(d.get(k), (int, float)) and abs(d[k]) < 1e5 else "?"
    crudo = dict(limpio)
    for k in ("texto", "nombre", "escena", "hora", "pantalla", "gpu", "navegador"):  # (nada que Discord lea como mención, formato o enlace)
        limpio[k] = op_md(limpio[k])
    if not limpio["texto"] and not audio:
        return 400, {"error": "falta la opinión"}
    try:
        dicho = await asyncio.to_thread(op_enviar, destinos, crudo, limpio, captura, audio, tipo_audio)
    except Exception as e:
        print(f"opinion: no se pudo entregar ({type(e).__name__}: {str(e)[:120]})", flush=True)
        return 502, {"error": "no se ha podido entregar; prueba otra vez"}
    return 200, {"ok": True, "dicho": dicho[:300]}


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
            if len(headers) >= 100:  # (nadie de verdad manda tantas cabeceras)
                return
            k, _, v = h.decode("latin-1").partition(":")
            headers[k.strip().lower()] = v.strip()
        ip, fuente = ip_cliente(headers, ip)
        url = urllib.parse.urlsplit(target)
        query = urllib.parse.parse_qs(url.query)
        if url.path == "/ws" and headers.get("upgrade", "").lower() == "websocket":
            await handle_ws(reader, writer, headers, query, ip)
            return
        body = b""; fb_extra = ""
        n = int(headers.get("content-length", "0") or 0)
        if n > (MAX_BODY_OPINION if url.path == "/api/opinion" else MAX_BODY_VECINOS if url.path == "/api/vecinos" else MAX_BODY):
            status, payload, ctype = 413, b'{"error":"demasiado grande"}', "application/json"
        else:
            antes = None
            if url.path == "/api/opinion" and method != "OPTIONS":   # (lo que se sabe sin leer el cuerpo, antes de leerlo)
                antes = opinion_antes(method, ip, headers.get("origin", ""))
                if antes is None:
                    op_subiendo[op_quien(ip)] = 1
            try:
                if n and not antes:
                    body = await asyncio.wait_for(reader.readexactly(n), timeout=45 if url.path == "/api/opinion" else 20)
                if antes:
                    status, obj = antes
                elif url.path == "/api/opinion" and method != "OPTIONS":
                    status, obj = await opinion(body)
            finally:
                if url.path == "/api/opinion" and antes is None:
                    op_subiendo.pop(op_quien(ip), None)
            if url.path == "/api/opinion" and method != "OPTIONS":
                payload, ctype = json.dumps(obj, ensure_ascii=False).encode(), "application/json; charset=utf-8"
            elif url.path.startswith("/api/") and method == "OPTIONS":
                status, payload, ctype = 204, b"", "text/plain"
            elif url.path == "/api/vecinos":
                status, obj = await vecinos(method, body, ip, headers.get("origin", ""))
                payload, ctype = json.dumps(obj, ensure_ascii=False).encode(), "application/json; charset=utf-8"
            elif (url.path == "/feedbacks" or url.path.startswith("/feedbacks/")) and method in ("GET", "HEAD", "POST"):
                status, payload, ctype, fb_extra = await asyncio.to_thread(op_feedbacks, method, url.path, query, body, ip, headers)
            elif url.path.startswith("/api/opiniones") and method in ("GET", "HEAD", "POST"):
                status, payload, ctype = await asyncio.to_thread(op_admin, method, url.path, query, ip)
            elif url.path.startswith("/api/"):
                status, obj = api(method, url.path, query, body, ip, fuente)
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
        if url.path.startswith(("/api/opiniones", "/feedbacks")):  # (la página privada: sin CORS, sin marcos, sin nada de fuera, sin referente)
            extra = fb_extra + ("Cache-Control: no-store\r\nX-Frame-Options: DENY\r\nX-Robots-Tag: noindex\r\n"
                     "Content-Security-Policy: default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'\r\n")
        elif url.path.startswith("/api/"):
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
        reason = {200: "OK", 204: "No Content", 301: "Moved Permanently", 303: "See Other", 304: "Not Modified", 400: "Bad Request", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 413: "Payload Too Large", 429: "Too Many Requests", 502: "Bad Gateway", 503: "Service Unavailable"}.get(status, "OK")
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
