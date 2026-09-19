# El mueble «Otro»: el cliente lo describe

Palabras del dueño (18 de septiembre de 2026):

> «even for UX... when user choose "otro"..should be necessary that user write description...
> can be important»

## El problema

Dos cosas con la misma causa:

- **UX**: el catálogo ofrece «Otro» con la pista «Cuéntanos cuál» (`store.js`, la lista compartida de
  muebles) y **no había dónde contarlo**: quien lo elegía seguía con un mueble sin nombre, y el
  taller se quedaba sin saber qué es.
- **La IA lo rellenaba**: con «Otro» y nada más, el modelo local contestó que el cliente había
  elegido «un sofá». El cerco no lo detiene a propósito (juzga cifras, promesas y tema, no nombres):
  el hueco lo llenó el modelo con el mueble más probable.

## La decisión

1. **Elegir «Otro» abre un campo y lo pide por escrito** (`#furnitureOtherField`, con su
   `#furnitureOtherError`), visible solo con esa opción elegida — y decidido por el `id` del
   catálogo (`otro`), nunca por el nombre: el backoffice puede renombrar el mueble.
2. **Sin la descripción no se avanza** (validación del paso, igual que las fotos): el error lo dice,
   el foco va al campo y la página lo trae a la vista.
3. **La descripción viaja al asistente** en el contexto (`ACI.context().furnitureNote`) y en el
   bloque de estado del modelo, junto al mueble: «Mueble: Otro (el cliente lo describe: «silla de
   barbería»)…». Con cualquier otro mueble es `null`.
4. **Lo escrito sobrevive al cambio de opción**: si el cliente vuelve a «Otro», su descripción sigue
   ahí; el contexto solo la lleva mientras «Otro» está elegido.
5. **El carácter del modelo repite el estado con sus palabras**: si dice «Otro», dice «Otro» — no lo
   cambia por un mueble que le parezca probable.

## Criterios de aceptación (y dónde se prueban)

| criterio | dónde |
|---|---|
| con un mueble normal, el campo no existe | `tests/wizard.spec.mjs` |
| elegir «Otro» abre el campo | `tests/wizard.spec.mjs` |
| sin la descripción no se avanza, y el error lo dice | `tests/wizard.spec.mjs` |
| lo escrito no se reescribe solo | `tests/wizard.spec.mjs` |
| con la descripción el cotizador sigue | `tests/wizard.spec.mjs` |
| el contexto del asistente la lleva | `tests/wizard.spec.mjs` (`ACI.context().furnitureNote`) |
| el bloque de estado del modelo la lleva pegada al mueble | `tests/assistant-ia-local.spec.mjs` |
| el asistente sigue leyendo las mismas claves, ahora con esta | `tests/assistant.spec.mjs` |

## Lo que NO hace (todavía)

- **La solicitud no la guarda**: el registro sigue diciendo `furniture: 'Otro'`, así que el
  backoffice muestra «Otro» sin la descripción. Llevarla al registro y a la ficha de la cotización
  es el paso que sigue, y toca la capa del taller: se decide aparte.
- **El cerebro simulado** no la usa en sus respuestas preparadas (con «Otro» diría «otro», sin la
  descripción). Alinear su copia es la otra mitad parkeada — ver `docs/contexto-del-modelo.md`.
