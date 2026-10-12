# El Discord de 388 Pueblos

Guía para montar el servidor de la comunidad en unos 10 minutos y conectarlo con la web.

## 1. Crear el servidor

1. En Discord: «+» (Añadir un servidor) → Crear el mío → Para un club o una comunidad. Nombre: **388 Pueblos**.
   Icono: `web/assets/logo/icon-512.png`.
2. Ajustes del servidor → Habilitar comunidad. Eso activa las normas, el canal de anuncios y la pantalla de bienvenida.
3. Ajustes del servidor → Seguridad: nivel de verificación **Medio** (cuenta con más de 5 minutos y email verificado) y
   filtro de contenido explícito **para todos los miembros**.

## 2. Canales

| Categoría | Canal | Para qué |
|---|---|---|
| 388 PUEBLOS | `#bienvenida` | Normas y primeros pasos (solo lectura) |
| | `#anuncios` | Novedades importantes (solo lectura) |
| | `#diario-de-obra` | Cada cambio de la web y del juego, automático (solo lectura) |
| LA PLAZA | `#plaza-mayor` | Charla general |
| | `#busco-partida` | Para quedar y jugar juntos en Guareña |
| | `#capturas` | Fotos y vídeos del juego |
| COMARCAS | `#vegas-altas`, `#tierra-de-barros`, `#la-serena`, `#la-siberia`, `#campina-sur`, `#tentudia`, `#sierra-suroeste`, `#llanos-de-olivenza`, `#lacara`, `#alcantara`, `#sierra-de-gata`, `#las-hurdes`, `#valle-del-ambroz`, `#valle-del-jerte`, `#la-vera`, `#campo-arañuelo`, `#villuercas`, `#miajadas-trujillo`, `#tajo-salor`, `#sierra-de-montanchez`, `#zona-centro` | Un canal por comarca: sus pueblos, sus fiestas, quedadas |
| PROYECTO | `#ideas-para-mi-pueblo` | Lo que falta en tu pueblo (lugares, historias, fiestas) |
| | `#errores` | Algo no funciona |
| | `#codigo-abierto` | Para quien quiera programar o editar su pueblo (ver CONTRIBUTING.md) |
| | `#ayuntamientos` | Solo con el rol Ayuntamiento: dudas sobre el servicio |
| VOZ | `🔊 La plaza` | Hablar mientras se juega |

## 3. Roles

- **Equipo**: administración.
- **Moderación**: puede silenciar, borrar mensajes y expulsar. Hace falta al menos una persona adulta por franja horaria.
- **Ayuntamiento**: personal municipal verificado; ve `#ayuntamientos`.
- **Creador**: quien contribuye con código o contenido.
- **Vecino de…**: un rol por comarca, para que cada cual elija la suya en la pantalla de bienvenida (Incorporación →
  Preguntas: «¿De qué comarca eres?»).

## 4. Normas (para `#bienvenida`)

> 1. Respeto a todo el mundo. Nada de insultos, acoso ni discriminación.
> 2. Esto es un espacio con gente joven: nada de contenido sexual, violento o de drogas.
> 3. No compartas datos personales tuyos ni de otros: dirección, teléfono, centro de estudios, fotos de personas.
> 4. Nada de spam ni de publicidad sin permiso del equipo.
> 5. Si ves algo que no está bien, avisa a Moderación.
> 6. Discord tiene una edad mínima; para la lista de espera de 388 Pueblos hace falta tener 14 años o apuntarse con un
>    adulto.

## 5. AutoMod

Ajustes del servidor → AutoMod:

- **Bloquear palabras**: insultos y términos sexuales (incluye la lista común de Discord).
- **Bloquear spam de menciones**: más de 5 menciones por mensaje.
- **Contenido sospechoso de spam**: activado.
- **Enlaces**: en las comarcas y la plaza, permitir solo `pueblos388.onrender.com`, `github.com` y `nestorguerra.github.io`.

## 6. Conectar con la web

1. Ajustes del servidor → Invitaciones → crear una invitación **que no caduque** y sin límite de usos.
2. Pon la URL en `web/js/config.js`, en `DISCORD_URL`, y despliega. Aparece el botón «Entrar en el Discord» en la
   sección Comunidad y tras apuntarse a la lista de espera.

## 7. Diario de obra automático

1. En `#diario-de-obra`: Editar canal → Integraciones → Webhooks → Nuevo webhook → Copiar URL del webhook.
2. En GitHub, el repositorio 388-pueblos → Settings → Secrets and variables → Actions → New repository secret:
   nombre `DISCORD_WEBHOOK`, valor la URL copiada.
3. Desde entonces, cada cambio que llega a `main` se publica solo en el canal
   (`.github/workflows/discord-diario.yml`). Para el juego, el mismo archivo sirve en sus repositorios.
