# Las fotos se piden en todas las líneas — requeridas y analizadas

El dueño, el 19/09:

> «for each line service is necessary upload photos for differents...situations and context... but is
> necessary always... this data should be require and analize... too...»

## Qué pasaba

El bloque de subida vivía **dentro del paso «Tu mueble»**. Las siete líneas que tienen ese paso lo
pedían bien (mínimo 3, hasta 7, y la revisión las mira), pero la línea que no pregunta mueble
—«Tapicería arquitectónica», `"skips": ["furniture", …]`— no pedía ninguna: el contexto viajaba con
`photos: null`, el resumen no declaraba la fila, la revisión no la juzgaba y el cliente podía llegar
al cierre sin una sola foto. Con el paso de fotos ausente, además, la captura del dueño mostró el
bloque mudado debajo de la rejilla de servicios: el primer «paso visible» de esa línea era el **0**,
el de elegir la línea.

## Qué quedó

- **El anfitrión de las fotos** (`pasoAnfitrionDeLaSubida()`): el paso del mueble cuando la línea lo
  tiene; si no, **el primer paso de la cotización** —nunca el 0, que es la pantalla de elegir
  línea—. El bloque (`#uploadZone` con su tira y su error) se muda ahí en `reubicarLaSubida()`,
  llamada desde `applyOptionalSteps()` cada vez que se recalcula el recorrido.
- **La copia** sale del catálogo (`photoTitle` / `photoInstructions` de la línea) y, si la línea no
  trae la suya, del respaldo («Sube fotos del espacio» / «Lo que vamos a tapizar y un detalle…»).
- **La exigencia** (`validStep`) se ancla al paso que aloja la subida, sea el que sea: sin el mínimo
  de fotos no se avanza, y lo dice ella en su burbuja («Agrega 3 fotos más: necesitamos al menos 3»).
- **El análisis**: las fotos viajan siempre en `ACI.context()` (`photos: {count, min, max}`), siempre
  en `declaredRows()` («Fotografías») y la revisión las mira en todas las líneas: sin fotos avisa
  («No recibimos ninguna fotografía»), con fotos las describe con el modelo local cuando está.

Es la excepción declarada a «la línea declara solo lo que pregunta» (docs/contexto-por-linea.md): el
dueño quiere las fotos en todas, así que son lo único que viaja aunque el paso no exista.

## Cómo se comprueba

- `tests/wizard.spec.mjs`, bloque «LA LÍNEA SIN MUEBLE NO DECLARA MUEBLE»: la caminata de
  «Tapicería arquitectónica» **sube fotos** en su primer paso, y su revisión ya tiene la fila de
  fotos (2 filas) mientras sigue sin hablar de medidas ni de «fuera de lo habitual»; su resumen
  declara «Fotografías» y el contexto lleva el conteo.
- `tests/wizard.spec.mjs`, bloque del cambio de línea: al cambiar de línea la tira queda vacía y la
  línea nueva **vuelve a pedirlas** (`{count: 0, min: 3}`), no `null`.
- `tests/wiring.spec.mjs`: el check de «solo lleva al contexto los datos de sus pasos» exige, para
  cada uno de los cuatro motivos, `photos.count === 0 && photos.min === 3` y la fila «Fotografías»
  en `declaredRows()`.
