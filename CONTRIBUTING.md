# Cómo mejorar 388 Pueblos (y editar tu propio pueblo)

388 Pueblos es de todos. Puedes mejorar el código, corregir datos o escribir la historia de tu pueblo. Todo se hace con
*pull requests* en GitHub; si no sabes qué es, abre un *issue* contándonos lo que quieres añadir y te ayudamos.

## Escribir el contenido de tu pueblo

Cada pueblo de Extremadura ya tiene su gemelo automático, levantado con los edificios del Catastro. Lo que falta es lo
que solo saben sus vecinos: sus lugares, sus historias y sus fiestas. Para añadirlo:

1. Busca el código INE de tu pueblo: es el número de 5 cifras que aparece en su página (`pueblo.html#06001`) o en el
   mapa de los 388.
2. Crea el archivo `web/data/contenido/<INE>.json` con esta forma:

```json
{
  "descripcion": "Una o dos frases que presenten el pueblo.",
  "autoria": ["Tu nombre o alias"],
  "lugares": [
    {
      "nombre": "Ermita de San Isidro",
      "etiqueta": "Siglo XVII",
      "texto": "Qué es, por qué importa y alguna historia que se cuente de ella.",
      "fuente": "De dónde sale el dato (libro, web del ayuntamiento, testimonio de…)",
      "lat": 38.8601,
      "lon": -6.0987
    }
  ],
  "datos": [
    {
      "titulo": "El apodo del pueblo",
      "texto": "Cómo llaman a los de aquí en los pueblos de alrededor, y por qué.",
      "fuente": "Testimonio de vecinos"
    }
  ]
}
```

3. Añade el código INE a la lista de `web/data/contenido/index.json` (por ejemplo, `["06001"]`).
4. Abre el pueblo en local (ver el README) para comprobar que los lugares caen donde deben, y envía el *pull request*.

Consejos:

- Las coordenadas (`lat`, `lon`) se sacan de cualquier mapa: en Google Maps, clic derecho sobre el sitio → copiar las
  coordenadas. Solo se muestran los lugares que caen dentro del modelo del pueblo.
- Cita siempre la fuente. Si es un recuerdo o una tradición oral, di de quién.
- Nada de datos personales de vecinos (direcciones, teléfonos, fotos de personas) ni de propiedades privadas sin permiso.
- Lo que escribas se publica con licencia CC BY-SA 4.0 (ver [LICENCIAS.md](LICENCIAS.md)).

## Corregir los datos automáticos

Los modelos de `web/data/pueblos/` se generan con los scripts de `tools/` a partir del Catastro, el INE, el IGN y
OpenStreetMap. Si algo está mal (una iglesia mal situada, un pueblo descentrado), no edites el JSON a mano: abre un
*issue* o corrige el script y vuelve a generar los datos.

## Mejorar el código

- La web no tiene paso de compilación: HTML, CSS y módulos JavaScript en `web/`. El servidor y las herramientas usan
  solo la biblioteca estándar de Python.
- Arranca el servidor local (`python3 server/servidor.py --port 8388`) y prueba en un navegador de escritorio y en un
  móvil.
- Escribe como el código que lo rodea: comentarios breves en español, nombres claros.
- Antes de enviar, comprueba que la página no da errores en la consola y que funciona con «reducir movimiento».

## Convivencia

Este es un proyecto para que la gente joven conozca y quiera sus pueblos. Trata a todo el mundo con respeto. No se
aceptan contenidos que ataquen a personas o colectivos.
