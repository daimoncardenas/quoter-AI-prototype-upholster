# El contexto del modelo: el estado viaja en cada turno

Palabras del dueño (18 de septiembre de 2026), sobre una respuesta que habló del sofá cuando le
preguntaron qué tenía seleccionado:

> «look ... dont have context.. for the user and what step was selected for the user and the option...»
> «that is is necessary inject the model with this information of context»

## El problema

El cerebro simulado y el modelo local recibían el contexto de maneras distintas:

- **El cerebro** lo lee vivo, en cada pregunta (`AssistantBrain.respond(ACI.context(), text)`): los
  eventos del cotizador (`aci:event`) y `ACI.context()` se recalculan desde la página, así que nunca
  contesta con datos viejos.
- **El modelo** es una sesión de chat con memoria propia: recibía el contexto **una sola vez**, al
  crear la sesión, y después cada turno le mandaba únicamente el texto del cliente. El único camino
  que lo volvía a informar era el «sello» (`paso | mueble | estimación | tela`), que **no** incluía
  la línea elegida ni las medidas: elegir «Proyecto comercial» con el chat abierto no cambiaba nada
  de lo que el modelo sabía, y escribir medidas nuevas tampoco.

## La decisión

1. **El carácter es permanente; los hechos son del turno.** `promptDeLaCasa()` (el prompt de
   sistema) dice quién es, cómo habla, el nombre del documento y las reglas que no puede romper.
   Todo lo que cambia —paso, línea, mueble, medidas y los rangos habituales del cotizador, fotos,
   revisión del formulario, tela, estimación y lo pendiente— lo escribe `estadoDelCotizador()` y
   viaja en el prompt de **cada** turno, junto con la pregunta.
2. **El estado manda sobre la memoria.** El prompt lo dice explícitamente: lo que vale es el
   ESTADO ACTUAL; si un dato no está ahí, el modelo no lo sabe. Así una respuesta vieja no puede
   tomarse por verdad cuando el cliente ya cambió de paso o de línea.
3. **Una sesión por conversación.** No se recrea la sesión para «refrescar» el contexto: la
   historia se conserva (una sesión nueva es una conversación nueva), y el estado fresco llega por
   el camino de arriba. El sello desaparece porque ya no tiene nada que proteger.
4. **La misma pregunta, dos cerebros.** Cuando el nodo es el modelo, el cerco sigue juzgando cada
   respuesta y el cerebro simulado responde cuando no hay modelo o cuando la respuesta rompe el
   cerco. (Pendiente declarado: la respuesta *preparada* del cerebro a «¿qué tengo seleccionado?»
   es hoy genérica —nombra el paso, no la línea ni el mueble—; se iguala cuando el dueño lo pida.)

## Criterios de aceptación (y dónde se prueban)

| criterio | dónde |
|---|---|
| el estado (paso, línea, mueble, medidas) viaja en el turno, no una vez al abrir la sesión | `tests/assistant-ia-local.spec.mjs`, sección «Con modelo» |
| la línea se dice con las palabras de la página, no escritas a mano en la prueba | la misma sección (lee `ACI.context().service.label`) |
| cambiar de línea y escribir una medida con la conversación abierta se refleja en el turno siguiente | `tests/assistant-ia-local.spec.mjs`, sección «El cliente cambia de línea…» |
| y eso sin recrear la sesión (la conversación no pierde el hilo) | la misma sección (`__sesiones === 1`) |
| las reglas siguen en el carácter, y el cerco sigue filtrando | `tests/assistant-ia-local.spec.mjs` (secciones «Con modelo» y el cerco por su lado) |

## Lo que NO hace

- **Identidad del cliente sin autorización.** El nombre, correo y teléfono solo entran al contexto
  con la casilla de autorización marcada (Ley 1581, `index.html` → `context()`), así que el modelo
  tampoco los recibe antes. Si el dueño quiere que salude por nombre, eso se decide con el texto de
  la autorización, no con el prompt.
- **Streaming ni caché de respuestas.** Cada turno va al modelo; no se guarda nada.
- **Historial entre recargas.** La conversación vive en la sesión del modelo: recargar la página
  empieza una conversación nueva (como hasta ahora).
