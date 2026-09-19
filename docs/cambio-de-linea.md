# Cambiar de línea de servicio empieza de cero

El dueño, el 19/09:

> «reset context of selected... when user change line of service... dont save.. becuase this
> contaminate the context for the AI... adition please check that for example in service "tapiceria
> arquitectonica".... dont save values of the others lines of service... this important»

## Qué pasaba

La línea se elegía una vez y lo declarado se quedaba para siempre: `state.damages=[]` era **lo único**
que se limpiaba al pulsar otra línea. Un cliente podía declarar un sofá de 210 × 85 × 90 con tres
fotos, dos necesidades y estilo minimalista para «Retapizado de muebles», volver al primer paso,
elegir «Tapicería arquitectónica» —paneles y muros— y el asistente seguía contestando con el sofá,
esas medidas y esas fotos: el contexto que recibe sale de `ACI.context()` y de `declaredRows()`, y los
dos leen `state` y los campos del formulario. Limpiar solo los daños dejaba el resto contaminando.

## Qué hace ahora

Al pulsar una línea **distinta** de la elegida, `resetProjectForLine()` devuelve el proyecto a su punto
de partida:

- **Lo declarado**: mueble (vuelve al de fábrica, el que el paquete pone de primero), su descripción
  cuando es «Otro», las medidas, las fotos (se sueltan y la tira queda vacía), «qué se tapiza», los
  usos previstos, estilo, color y presupuesto, las preguntas propias de la línea (`asks`) y los daños.
- **Los campos del formulario**: cada `input`, `select` y `textarea` de los pasos vuelve al valor con
  el que el cliente lo encontró (`defaultChecked` / `defaultValue` / la primera opción). Los pasos que
  la línea nueva no usa se rehacen solos (`applyOptionalSteps()`), y los suyos vuelven a nacer vacíos.
- **Las fotos**: se sueltan del estado; la tira se vacía en el acto.
- **La revisión**: título y texto vuelven a «Listo para revisar» y la fila de la recomendación
  (`#aiPick`) se esconde. La estimación se rehace con lo que quede —nada—.
- **La conversación del modelo local**: `sesionIA` se destruye al cambiar de línea. Su historial
  guarda lo que el cliente declaró para la línea anterior, así que la próxima pregunta abre una sesión
  nueva con el estado ya limpio. Escribir una medida **sin** cambiar de línea no la toca: el hilo no se
  pierde por eso.

**Lo que NO se toca**: los datos de contacto (nombre, correo, teléfono y su autorización). Son de la
persona, no del proyecto, y volver a escribirlos en cada cambio de línea castigaría al cliente por
dudar. Viven tras el consentimiento y solo entran al contexto cuando está marcado.

**Volver a pulsar la línea ya elegida no borra nada**, y la **primera** elección de la página recién
abierta tampoco toca nada (no hay declaración que pueda viajar). La condición exacta es
`!!state.service && state.service.id !== s.id`.

## La parrilla de telas: por qué no se repinta aquí

La primera versión del reset llamaba a `renderFabrics()` para dejar la parrilla al día, y eso elige
tela sola (`state.fabric` con `auto: true` cuando el cliente no ha tocado ninguna). Esa tela elegida
sola **viajaba a la línea nueva**: una línea sin tela —mantenimiento y limpieza— acababa cotizando con
una. Lo destapó una comprobación que ya existía («y sin tela de por medio: lo que antes quedaba en null
ahora es un número», `tests/wizard.spec.mjs`), que empezó a ver un precio donde esperaba `null`. Ahora
el reset **vacía** la parrilla y la vuelve a pintar el propio paso al entrar, que es donde la elección
automática tiene sentido.

## Cómo se prueba

`tests/wizard.spec.mjs` — «UNA LÍNEA NUEVA NO HEREDA LO DECLARADO PARA LA ANTERIOR»: declara mueble
distinto del de fábrica, tres fotos, medidas dentro de rango y preferencias; cambia a «Tapicería
arquitectónica» y comprueba que el mueble vuelve al de fábrica, que las medidas y los campos quedan
vacíos, que las fotos se sueltan, que las preferencias vuelven a su punto de partida, que la revisión
no queda hecha y que **las filas que ve el asistente** no llevan nada de la otra línea; y que re-pulsar
la misma línea conserva lo declarado.

`tests/assistant-ia-local.spec.mjs` — con un `LanguageModel` de mentira que cuenta sesiones y
destrucciones: escribir una medida no recrea la sesión (el hilo sigue), cambiar de línea sí (la sesión
vieja se destruye, la siguiente pregunta abre una nueva y su turno ya no lleva la medida anterior).

## Pendiente, con su precio

- **El asistente no lo dice en voz alta.** Cambiar de línea borra en silencio; Lía podría avisar
  («empezamos de cero con Tapicería arquitectónica»). No se hizo porque el dueño pidió «dont save», no
  «dime que borraste» — y su burbuja está para los errores y los avisos del paso.
- **El contacto es lo único que sobrevive.** Si el dueño prefiere que también se limpie, es una línea:
  sacarlo de `CONTACTO_DEL_CLIENTE`.
- **La estimación de la línea anterior se pierde** con el resto. Es coherente (se cotiza otra cosa),
  pero si el cliente vuelve a la línea de antes tiene que declararlo otra vez. Hoy no hay memoria por
  línea: si el producto la quiere, es un `Map` de estado por `service.id`, no un parche.
