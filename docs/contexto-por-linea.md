# El contexto lleva lo que la línea pregunta — y nada más

El dueño, el 19/09, con una captura de «Tapicería arquitectónica»:

> «look is "tapiceria arquitectonica"...where the user dont choose the furniture... however Lia has
> a context of furniture....even if client dont choose that... even in this wizard doesnt exist
> choose furniture....»

## Qué pasaba

Esa línea no pregunta mueble, ni medidas, ni preferencias: su catálogo declara
`"skips": ["furniture", "measurements", "preferences"]` y sus preguntas son otras
(`superficie`, `acustica`). Pero el cotizador nace con un mueble de fábrica en el estado (`'Sofá'`) y
los campos del recorrido del mueble siguen existiendo en el DOM —ocultos— con sus valores por
defecto. El contexto que recibe el asistente (`ACI.context()`) y el resumen que lee el cliente
(`declaredRows()`) los leían igual, así que:

- el resumen declaraba **«MUEBLE: Sofá · 1 puesto»**, «Qué se tapa: Todo el mueble», «Estilo y color:
  Moderno · Neutros y arena» y «Fotografías: 0 adjuntas» en una línea que no pregunta nada de eso;
- la revisión avisaba «**El ancho y el alto y el fondo está fuera de lo habitual para sofá. Corrige
  la medida para continuar**» — sobre unas medidas que nadie escribió, comparadas contra los rangos
  de un sofá que nadie eligió (`oddMeasures()` corría siempre, y con los campos vacíos **todos**
  contaban como fuera de rango);
- y el turno del chat llevaba «Mueble: Sofá …» con cada pregunta.

## Qué hace ahora

Una sola fuente manda: **los pasos que la línea tiene**, leídos del mismo catálogo con el que se arma
el recorrido (`applyOptionalSteps`):

```js
const pideMueble=()=>!skipsLine().includes('furniture');
const pideMedidas=()=>!skipsLine().includes('measurements');
const pidePreferencias=()=>!skipsLine().includes('preferences');
const pideRecomendacion=()=>!skipsLine().includes('recommendation');
```

- **El contexto** (`ACI.context()`) lleva banderas (`asksFurniture`, `asksMeasurements`,
  `asksPreferences`, `asksRecommendation`) y **null** donde no hay paso: `selectedFurniture`,
  `measurements`, `preferences`, `photos`, `fabric`. Los consumidores distinguen «no aplica» de «sin
  elegir» por la bandera, no por el valor.
- **El resumen declarado** (`declaredRows()`) solo arma las filas de los pasos que existen: la
  arquitectónica declara su motivo y sus propias respuestas, no un mueble.
- **La revisión** (`runReview()`) solo juzga lo que hay: sin paso de fotos no hay fila de fotos, y
  sin paso de medidas no hay rango que aplicar. Queda la comprobación de que hay con qué estimar.
- **El chat** (`estadoDelCotizador()`) arma las frases del mueble y de las medidas solo si la línea
  las pregunta: en la arquitectónica, el turno no puede hablar de un sofá.
- Y la copia de la tercera comprobación dice «de tela» **solo donde se cotiza tela** (fabricación y
  arquitectura van por m² o por pieza): dejarla genérica movía la barra lateral un píxel, y lo
  destapó una comprobación de equilibrio que ya existía.

## Y un paso que ya no existe

De paso, un hueco real que apareció al probarlo: si el cliente cambiaba de línea desde un paso que la
línea nueva **no tiene** (por ejemplo desde «Tu mueble» a una línea sin mueble), ese paso se quedaba
en pantalla pidiendo fotos de un recorrido que ya no existe y «Continuar» no avanzaba nunca. Ahora
`resetProjectForLine()` deja el recorrido en su primer paso visible cuando el actual no pertenece a
la línea nueva.

## Cómo se prueba

- `tests/wiring.spec.mjs` — «solo lleva al contexto los datos de sus pasos»: para las cuatro líneas
  que no van por tela (mantenimiento, arquitectónica, a la medida, proyecto comercial), las banderas
  del contexto coinciden con los pasos que el catálogo declara y los datos ausentes van en `null`.
- `tests/wizard.spec.mjs` — «LA LÍNEA SIN MUEBLE NO DECLARA MUEBLE (REVISIÓN Y CONTEXTO)»: recorre
  «Tapicería arquitectónica» respondiendo SUS preguntas, y comprueba que su revisión no tiene filas
  de fotos ni de medidas (y ninguna mención a «fuera de lo habitual»), que sigue diciendo que hay con
  qué estimar, que su resumen declara el motivo y sus preguntas pero no un mueble, y que el contexto
  va tan limpio como el resumen. El bloque «UNA LÍNEA NUEVA NO HEREDA LO DECLARADO PARA LA ANTERIOR»
  cambia de una línea que sí pregunta mueble a una que no, y comprueba el `null`.

## Pendiente, con su precio

- **La silla del fondo.** La escena 3D muestra una poltrona aunque la línea no pregunte muebles: es
  mobiliario del estudio, no del cliente, pero en una línea de muros y techos se lee raro. Cambiarlo
  es arte/animación (la capa de presencia), no datos.
- **Los pasos ocultos siguen en el DOM** con sus valores de fábrica. Hoy no viajan a ningún lado
  (el contexto y el resumen están filtrados), pero un `FormData` del formulario entero los llevaría.
  Si algún día se serializa el formulario, hay que filtrar por la misma regla.
- **La estimación por m² no se ve en el resumen.** Las respuestas propias de la línea (superficie,
  acústica) no tienen fila en `declaredRows()`: sus números aparecen en el paso de estimación y en
  los supuestos, no en la revisión. Añadirlas es una fila por grupo declarado en el catálogo.
