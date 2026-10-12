# 388 Pueblos

**El mundo online, abierto y gratuito, de los 388 pueblos de Extremadura.** Cada municipio, construido con datos reales
para conocerlo, jugar y encontrarse con otras personas. Empezamos por Guareña (Badajoz).

Un proyecto de Ana Pérez Toledo, de código abierto: el código con licencia MIT y los pueblos y contenidos con
CC BY-SA 4.0 ([LICENCIAS.md](LICENCIAS.md)).

- **Gratis para siempre:** entrar en los 388 pueblos y estar con otras personas es y será gratuito. Muchas actividades
  y juegos también.
- **Freemium, sin muros:** dentro de cada pueblo puede haber servicios y algunos juegos de pago, junto a otros muchos
  gratuitos.
- **Abierto:** cualquiera puede mejorar el proyecto y escribir el contenido de su propio pueblo
  ([CONTRIBUTING.md](CONTRIBUTING.md)).
- **Estado:** beta en pruebas con lista de espera. Quien se apunta entra al momento en el juego de Guareña.

## Qué hay

- **Los 388 municipios en 3D**, levantados de forma automática con los edificios del Catastro (826.000 piezas
  edificadas), con su página (`pueblo.html#<código INE>`) y un mapa vivo para votar qué pueblo despierta después.
- **Guareña, pueblo 001**, con contenido verificado y la entrada al juego: la cámara del gemelo baja hasta la foto del
  dron del juego (https://nestorguerra.github.io/guarena/) y se funde con él, sin salir de la página.
- **Lista de espera** («apúntate y entra»), votos y pasaporte de sellos por pueblo visitado.

```
web/                      La web, sin paso de compilación
├── index.html            Portada (escrita como fragmento: así se publica también como Artifact de claude.ai)
├── guarena.html          Pueblo 001: Guareña
├── pueblo.html           Cualquiera de los 388: pueblo.html#06001, #10037…
├── privacidad.html       Política de privacidad
├── js/world.js           Motor 3D compartido (pueblo, iglesias, suelo, olivares, cigüeñas, cielo, mapa)
├── js/landing-world.js   Vuelo de cámara de la plaza a los 388
├── js/main.js            Portada: scroll, mapa interactivo, votos, lista de espera
├── js/town-page.js       Página de pueblo: nidos, lugares, luz, pasaporte y entrada al juego
├── js/jugar.js           Descenso de la cámara hasta el juego de Guareña (iframe + mensajes)
├── js/lista.js           Lista de espera: «apúntate y entra»
├── js/backend.js         Dónde se guardan los datos (Google Sheets o servidor propio)
├── js/contenido.js       Contenido de la comunidad por pueblo (data/contenido/<INE>.json)
├── js/config.js          Ajustes de despliegue (URL de la hoja, contacto)
└── data/                 municipios.json, guarena.json, contexto.json, pueblos/<INE>.json, contenido/
server/servidor.py        Servidor propio (solo biblioteca estándar): web + API + SQLite
server/pagina.py          Convierte las páginas en documentos completos (servidor y web estática)
tools/build_web.py        Empaqueta la web estática para el CDN (dist/web)
tools/sheets/Codigo.gs    Lista de espera y votos en Google Sheets
tools/logo.py             Logo «388», favicon, iconos e imagen para redes
tools/*.py                Generación de los datos de los 388 pueblos
render.yaml               Despliegue en Render
```

## Ver la web en local

```bash
python3 server/servidor.py --port 8388
```

Y abrir http://localhost:8388. Para probar la web estática tal como se publica:

```bash
python3 tools/build_web.py --api http://localhost:8388/api && python3 -m http.server 8390 --directory dist/web
```

Para probar la entrada al juego con el juego en local: `guarena.html?juego=http://127.0.0.1:8918/index.html` (solo se
acepta en localhost).

## Despliegue

`render.yaml` crea dos servicios en Render:

1. **`pueblos388`, la web estática** en el CDN de Render: gratis, sin esperas y con caché larga (los JS y CSS llevan la
   huella de su contenido en la URL).
2. **`388-pueblos`, el servidor propio**, con la API de votos y lista de espera. En el plan gratuito se duerme tras
   unos minutos sin visitas (la web lo despierta al cargar) y su base de datos es temporal.

### Lista de espera y votos en Google Sheets

Para que la lista de espera no se pierda, se guarda en una hoja de cálculo:

1. Crea una hoja nueva en Google Drive. Extensiones → Apps Script, pega `tools/sheets/Codigo.gs` y guarda.
2. Implementar → Nueva implementación → Aplicación web. Ejecutar como: yo. Acceso: cualquier usuario. Autoriza.
3. Copia la URL que termina en `/exec` en `SHEETS_URL`, en `web/js/config.js`, y despliega.

La hoja crea sola las pestañas «Lista» (una fila por email) y «Votos» (una por dispositivo). Desde la web solo se
puede escribir y leer el recuento de votos: los emails nunca salen de la hoja.

### API del servidor propio

| Ruta | Qué hace |
|---|---|
| `/api/votos` | GET recuento por pueblo · POST `{device, pueblo}` (un voto por dispositivo) |
| `/api/lista` | POST alta en la lista de espera (exige edad ≥ 14 y consentimiento). No se puede leer por la API |
| `/api/pasaporte` | Sellos por dispositivo (la web ya los guarda en el propio dispositivo) |
| `/api/online` | Estado del servicio |

Exportar la lista: `python3 server/servidor.py --export-lista --db <ruta>`.

## Datos

| Dato | Fuente | Licencia |
|---|---|---|
| Edificios con número de plantas | Dirección General del Catastro (INSPIRE) | Reutilización libre citando la fuente |
| Límites municipales | IGN, vía `es-atlas` | CC BY 4.0 |
| Población 2001–2025, altitud, superficie | INE (Padrón) vía Wikidata | CC0 |
| Iglesias y hitos | OpenStreetMap | ODbL, © colaboradores de OpenStreetMap |

Regenerar los datos: `tools/parse_catastro.py` (Guareña), `tools/build_municipios.py`, `tools/build_contexto.py`,
`tools/fetch_catastro.py` y `tools/build_pueblos.py` (los 388). Ver la cabecera de cada script.

- Los códigos de municipio del Catastro no coinciden con los del INE en unos 200 casos; el emparejamiento se hace por
  nombre (`tools/ine2catastro.json`).
- Cada modelo se centra en la iglesia principal según OpenStreetMap o, si no la hay, en el núcleo edificado más denso.
- Las torres y espadañas son genéricas: indican dónde está cada iglesia, no cómo es. Guareña v0.1 es volumetría
  automática (LOD1); no es cartografía oficial.

## Diseño

Un único mundo WebGL en el que el scroll mueve la cámara, de la Plaza de España de Guareña a las 388 luces de
Extremadura (referente: Igloo Inc, Awwwards Site of the Year 2024). Noche de cielo estrellado, luz de farola de sodio
como acento, cal y zócalo de añil en las secciones claras. Archivo extendida, Instrument Serif en cursiva y Geist Mono
para los datos. El logo es el número: «388».
