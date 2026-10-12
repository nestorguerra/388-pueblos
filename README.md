# 388 Pueblos

Gemelo digital y mundo online de los 388 municipios de Extremadura. Un proyecto de Ana Pérez Toledo, desde Guareña (Badajoz).

Esta carpeta contiene la **fase 1** pedida (investigación, referentes de diseño y landing con Guareña como pueblo 001) y el arranque del mundo:

- **Los 388 municipios levantados en 3D** de forma automática (nivel 0) con los edificios del Catastro: 826.000 piezas edificadas en total.
- **Una página por pueblo** (`pueblo.html#<código INE>`) y una dedicada para Guareña, con su contenido verificado.
- **Capa social en tiempo real:** paseo con avatar, presencia de otras personas conectadas al mismo pueblo, frases y emojis predefinidos (sin chat libre), vecinos NPC y un pasaporte persistente con un sello por pueblo visitado.

## Qué hay aquí

```
388-pueblos/
├── docs/
│   ├── 01-investigacion-proyecto.md   Investigación estratégica (con fuentes): datos, financiación,
│   │                                  pros, riesgos, visión, misión, KPI, modelo de negocio, costes
│   └── 02-referentes-diseno.md        Webs premiadas 2023–2026 y plano de la landing (en inglés)
├── web/                               La web, sin paso de compilación
│   ├── index.html                     Landing (escrita como fragmento: así se publica como Artifact)
│   ├── guarena.html                   Pueblo 001: Guareña, con contenido verificado
│   ├── pueblo.html                    Cualquiera de los 388: pueblo.html#06001, #10037…
│   ├── css/pueblo.css                 Estilos de las páginas de pueblo
│   ├── js/world.js                    Motor 3D compartido (pueblo, iglesias, suelo, olivares, cigüeñas, cielo, mapa)
│   ├── js/landing-world.js            Vuelo de cámara de la plaza a los 388
│   ├── js/main.js                     Scroll, interfaz, mapa interactivo, votos, lista de espera, presencia
│   ├── js/town-page.js                Página de pueblo común: nidos, lugares, luz, paseo, pasaporte
│   ├── js/paseo.js                    Avatar, colisiones con los edificios, NPC y presencia en tiempo real
│   ├── js/pasaporte.js                Sellos por pueblo visitado
│   ├── js/guarena.js · js/pueblo.js   Contenido de Guareña y ficha automática del resto
│   ├── js/backend.js                  Conexión con el servidor propio (WebSocket y API)
│   └── data/                          municipios.json, guarena.json, contexto.json y pueblos/<INE>.json
├── server/servidor.py                 Servidor propio: web + multijugador + SQLite
├── render.yaml                        Despliegue en Render
└── tools/                             Scripts Python que generan los datos
```

## Ver la web en local (con multijugador y base de datos)

```bash
python3 388-pueblos/server/servidor.py --port 8388
```

Y abrir http://localhost:8388. Abre el mismo pueblo en dos pestañas, pulsa "Pasear por el pueblo" en ambas y os veréis.

## Servidor propio: el mundo abierto a cualquiera

`server/servidor.py` (solo biblioteca estándar de Python) sirve la web y añade lo que el Artifact no puede dar a visitantes anónimos:

| Ruta | Qué hace |
|---|---|
| `/ws?room=pueblo-<INE>` | Presencia en tiempo real por pueblo: posición, frases y emojis predefinidos. El servidor descarta cualquier campo de texto libre |
| `/api/online` | Personas paseando ahora, en total y por pueblo |
| `/api/votos` | Recuento por pueblo; un voto por dispositivo |
| `/api/pasaporte` | Sellos por pueblo visitado, por dispositivo |
| `/api/lista` | Alta en la lista de espera (exige edad ≥ 14 y consentimiento). No se puede leer por la API |

- Exportar la lista de espera: `python3 server/servidor.py --export-lista --db <ruta>`.
- Límites: 64 personas por pueblo, 20 mensajes por segundo por persona y 30 escrituras por minuto por IP.
- Un voto por dispositivo no impide el fraude de quien borre su navegador: para decisiones con dinero público, cruzar con la lista de espera verificada.
- **Despliegue (beta):** `render.yaml` crea el servicio en el plan gratuito de Render. Sin disco, la base de datos es temporal: votos, pasaportes e inscripciones se vacían en cada reinicio o despliegue, y el servicio se duerme tras unos minutos sin visitas. Para conservar datos, cambiar a `plan: starter` y añadir `disk: {name: datos, mountPath: /var/data, sizeGB: 1}` con `--db /var/data/388pueblos.sqlite3`. Con un dominio propio (p. ej. 388pueblos.es) la misma carpeta `web/` funciona sin cambios.
- Dentro del Artifact de claude.ai la web sigue usando las capacidades del Artifact; fuera, detecta el servidor propio por `window.P388`.

## Decisiones de diseño

- **Referente principal: Igloo Inc** (Awwwards Site of the Year 2024, estudio abeto). Un único mundo WebGL continuo en el que el scroll mueve la cámara, con interfaz tipo HUD. Aquí el vuelo va desde la Plaza de España de Guareña hasta las 388 luces de Extremadura, pasando del atardecer a la noche.
- **Secundarios:** Messenger (abeto, Developer SOTY 2025) para la idea de mundo vivo jugable; Son Daven para el tono patrimonial y la hoja de ruta; Lando Norris (SOTY 2025) para la escala tipográfica.
- **Identidad propia:** noche de cielo Starlight, luz de farola de sodio como acento, cal y zócalo de añil en las secciones claras. Archivo extendida para los rótulos, Instrument Serif en cursiva para los acentos y Geist Mono para los datos (códigos INE, UTM, habitantes).
- **Los 388 sin listado:** mapa 3D extruido y nocturno (altura y color por habitantes, cambio 2001–2025, altitud o votos), buscador, ruleta "pueblo al azar", filtros (< 1.000 hab., < 500 hab., pierden población), ficha de cada pueblo, votos "Despierta tu pueblo" y una franja de los 388 nombres en movimiento.

## Datos (todos abiertos)

| Dato | Fuente | Licencia / atribución |
|---|---|---|
| 7.985 volúmenes de edificación de Guareña, con nº de plantas | Dirección General del Catastro, INSPIRE (descarga ATOM) | Uso libre citando a la D. G. del Catastro |
| Límites de los 388 municipios | IGN, vía `es-atlas@0.6.0` | CC BY 4.0 (IGN) |
| Población 2001–2025, altitud, superficie, gentilicio | INE (Padrón) vía Wikidata | CC0 (Wikidata) |
| Coordenadas de hitos de Guareña | OpenStreetMap (Nominatim) | ODbL, © colaboradores de OpenStreetMap |

Regenerar los datos: `tools/parse_catastro.py` (Guareña), `tools/build_municipios.py`, `tools/build_contexto.py`, `tools/fetch_catastro.py` + `tools/build_pueblos.py` (los 388). Ver la cabecera de cada script.

Detalles del pipeline de los 388:
- Los códigos de municipio del Catastro **no coinciden** con los del INE en unos 200 casos, sobre todo en Cáceres. El emparejamiento se hace por nombre (`tools/ine2catastro.json`).
- Algunas coordenadas oficiales de Wikidata caen lejos del casco (Nogales, a 14 km). Por eso cada modelo se centra en la iglesia principal según OpenStreetMap (la de mayor superficie construida cerca) o, si no la hay, en el núcleo edificado más denso del término.
- La torre y las espadañas son genéricas: indican dónde está cada iglesia, no cómo es.

## Qué es provisional (revisar antes de enseñarlo fuera)

- **La cita de Ana** en la sección "Origen" es un borrador escrito a partir del brief. Hay que validarla con ella o sustituirla por una frase suya. Lo mismo con el texto biográfico, que se limita a lo que dice el brief.
- **Precios por nivel** (6.000–12.000 €, 15.000–35.000 €, 40.000–90.000 €) son estimaciones de la investigación, no tarifas cerradas.
- **Hoja de ruta:** fechas propuestas a partir del calendario festivo de Guareña y de las municipales previstas para mayo de 2027.
- **Paseo con otras personas:** dentro del Artifact solo conecta a personas con sesión iniciada y acceso de colaborador; con el enlace público se pasea en solitario (con los NPC). Con el servidor propio desplegado, cualquiera se ve con cualquiera, sin cuentas. Probado en local con dos clientes simultáneos.
- **Lista de espera, votos y pasaporte:** al publicarse como Artifact usan la base de datos del Artifact. Los votos son públicos y anónimos (uno por persona); los emails solo los puede leer la propietaria del Artifact. Para el lanzamiento real hace falta un backend propio, política de privacidad y el flujo de consentimiento para menores de 14 años (LOPDGDD).
- **Guareña v0.1** es volumetría automática (LOD1) más una torre procedural para Santa María. No es cartografía oficial. El siguiente paso es capturar plaza, Santa María y San Gregorio con fotogrametría o splats.
