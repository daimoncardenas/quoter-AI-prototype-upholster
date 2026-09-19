# El chat en espera: decir que está pensando

Criterio de aceptación, en palabras del dueño (18 de septiembre de 2026):

> «is important fix can be points.. or reloading... or something for chat when is thinking...
> because ... whitout that the user can think that the chat is bad or doesnt work»

## El problema

El chat contesta por dos caminos y ninguno avisaba que estaba trabajando:

- el **cerebro simulado** tarda 350 ms a propósito (respuesta preparada, pero con la pausa de
  alguien que escribe), y
- el **modelo local** puede tardar segundos: la primera respuesta de una sesión levanta el modelo
  en memoria y cada turno se genera en el equipo del cliente.

En los dos casos el panel quedaba mudo entre la pregunta y la respuesta. Con el modelo local ese
silencio se mide en segundos, y un chat mudo se lee como un chat roto —que es exactamente lo que
el dueño quiere evitar—.

## La decisión

1. **Tres puntos, en la burbuja del asistente.** Un turno en curso dibuja una burbuja más
   (`.message.bot.typing`) con tres puntos animados, en el mismo lugar donde va a aparecer la
   respuesta: lo que se mueve es lo que el cliente está esperando, no un indicador suelto.
2. **Se anuncia.** La burbuja es `role="status"` con nombre accesible «<nombre del asistente> está
   escribiendo…», así que un lector de pantalla lo dice; los puntos van `aria-hidden`.
3. **Un turno a la vez.** Mientras hay una respuesta viva, `askAssistant()` ignora una segunda
   pregunta y el botón de enviar queda deshabilitado (el campo de texto sigue libre para escribir
   la siguiente). Sin eso, dos turnos se intercalan y el orden de las respuestas miente.
4. **Un mínimo en pantalla.** Los puntos se quedan `ESPERA_MINIMA_MS` (450 ms) aunque la respuesta
   llegue antes: aparecer y desaparecer en un parpadeo se lee como un fallo de dibujo, no como una
   espera. Aplica a los dos caminos (el simulado ya tarda 350 ms; el modelo, a veces menos).
5. **Movimiento reducido.** Con `prefers-reduced-motion` los puntos se dibujan quietos.
6. **El silencio no se disfraza de otra cosa.** No hay porcentaje de progreso ni barra: el chat no
   sabe cuánto va a tardar el modelo, y prometer precisión que no existe es lo mismo que inventar
   una cifra.

## Criterios de aceptación (y dónde se prueban)

| criterio | dónde |
|---|---|
| al preguntar, el chat muestra que está pensando en vez de quedar mudo | `tests/assistant.spec.mjs` (cerebro simulado) y `tests/assistant-ia-local.spec.mjs` (modelo que tarda 900 ms) |
| la espera se anuncia con el nombre del asistente | `tests/assistant.spec.mjs` |
| el envío espera a la respuesta y vuelve cuando llega | las dos suites |
| una segunda pregunta no se cuela mientras hay un turno vivo | `tests/assistant.spec.mjs` |
| los puntos se van y queda el mensaje del asistente | las dos suites |

## Lo que NO hace (y por qué)

- **Botón de detener.** Cancelar una generación en curso es otra decisión de producto (y en el
  modelo local implica destruir la sesión); no estaba pedido.
- **Progreso de descarga del modelo.** El modo «downloadable» no descarga nada (ver
  `docs/onboarding-precios.md` y el cerco): avisar de una descarga que nadie pidió sería el
  problema contrario.
- **Streaming de la respuesta.** El modelo local puede entregar por partes con
  `promptStreaming()`; hoy la respuesta entra completa, y con los puntos delante eso es una
  mejora posterior, no un requisito para que el chat se sienta vivo.
