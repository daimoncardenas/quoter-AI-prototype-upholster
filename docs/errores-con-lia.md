# Los errores los dice Lía · y su nombre en vez de «IA local»

Lo que el dueño pidió el 19/09, con sus palabras:

> «lia at this moment is chat with AI this is good ... but we need to give her prominence ... each
> error that show of inputs..... is lia or the assistant that show this... for example the error of
> measures.. show both.. the input and lia show this error ... the idea is show the error in the
> dialogue inmediatly.... that is dont wait that user do click»

> «you can change texts "Mirando tu foto IA local / La IA local está mirando la fotografía." should
> be "Lia (name or assistant) Mirando tus fotos / Lia está analizando tus fotografías"»

## Lo acordado con él (sus respuestas, una por una)

| Pregunta | Su respuesta |
|---|---|
| El texto de los errores | «YEAH THE SAME ERROR BUT THE IDEA IS SHOW THE ERROR IN THE DIALOGUE IMMEDIATLY»: el mismo texto, en el paso y en el aviso de ella, y sin esperar a que pulse «Continuar» |
| La etiqueta | «REPLACE ALL TEXT... IN THE APPLICATION WHERE SAYS "AI local"..or "local AI" or "AI"»: su nombre en toda la atribución del cotizador |
| El documento | «is white.. simulating while the bar progressive and loading animation is working at the same time.... when exist response then come back to normal behaviour» — papel blanco, sin texto |
| Avisos blandos | «IS HER BUBBLE NEAR TO HER..THE SAME THAT HIDE SIDEBAR ... THE USER DONT HAVE TO CLICK FOR READ ERROR MESSAGE» |
| Asistente apagado | «IN BACKOFFICE DON'T TOUCH FOR THE MOMENT... AFTER THE FIXES.. WE CAN ANALIZE WHAT ACTION CAN BE OFF IN CONFIGURATIONS» |

## 1. Los errores, dichos por ella y al instante

- **Una sola voz**: con el asistente encendido el aviso se publica en su burbuja (`aci:notice`, el
  mismo canal del chat) y la línea del paso se queda **escrita pero oculta** —el mismo texto, en el
  DOM— para que las dos superficies no puedan separarse; apagado, la línea se enseña y es la única
  voz (no se finge a nadie). El dueño lo pidió en dos tiempos: primero «show both.. the input and lia
  show this error», después «this errors always is Lia who tell to client... you can delete error
  messages of the wizard and let it be Lia who always says that» (19/09, con una captura de la
  burbuja del navegador —«Please fill out this field.», en el idioma del sistema— sobre el celular).
- **Ningún aviso fuera de su voz**: los dos `reportValidity()` que sacaban la burbuja del navegador
  —medidas y contacto— se reemplazaron por frases suyas: una medida sin escribir («Me falta el ancho
  del mueble: sin las tres medidas no puedo calcular la tela.»), una medida imposible («El alto de
  900 cm no es una medida posible: va de 20 a 500 cm.»), el nombre, el correo (vacío o sin forma de
  correo), el celular (vacío o sin pinta de celular) y la autorización sin marcar. El campo que
  falla queda con el foco y `aria-invalid`.
- **El aviso no espera un clic**: el mensaje de la burbuja es un canal publicado, no el botón. En las
  medidas el aviso sale cuando el valor se confirma (`change` del campo: al salir del campo o con
  Enter), sin pulsar «Continuar»; el bloque de «Continuar» sigue existiendo para lo imposible.
- **La burbuja es la de ella**: el aviso flota sobre su cabeza, esconde el progreso mientras está
  (`.journey.noticing`), se va solo y deja la marca en «Pregúntale a» — todo eso ya existía.
- **Y mira el campo que falla**: el aviso viaja con el campo (`detail.campo`) y la capa 3D gira su
  cabeza hacia él, como cuando el cliente toca un control.
- Sin asistente (`Store.assistant().enabled === false`), el aviso no existe: no se finge una voz, y
  la línea del paso se enseña porque es lo único que puede hablarle al cliente.

Errores que hoy existen en `validStep()` y pasan por la misma voz: la línea (paso 0), «Otro» sin
descripción, fotos insuficientes, daños sin marcar, la medida sin escribir, la medida imposible, la
medida muy fuera de lo habitual, la revisión sin hacer, la revisión mirando, el contacto (nombre,
correo, celular, autorización) y los pasos de pregunta (campos fuera de rango, filas sin piezas).
Ninguno llama ya a `reportValidity()`.

## 2. Su nombre donde decía «IA local»

El nombre es del paquete (`Store.assistant().name`, p. ej. Lía) y el asistente se puede apagar por
cliente: sin él, la app vuelve a hablar de «la IA local del equipo» — nunca de una persona.

| Dónde | Antes | Ahora |
|---|---|---|
| Fila de la mirada (espera) | «Mirando tu foto» + etiqueta «IA local» + «La IA local está mirando la fotografía.» | «Mirando tus fotos» + etiqueta «Lía» + «Lía está analizando tus fotografías.» |
| Fila de la recomendación (espera) | «Pidiéndole una recomendación a la IA local» + «Está leyendo lo que declaraste…» | «Pidiéndole una recomendación» + etiqueta «Lía» + «Lía está leyendo lo que declaraste y las telas disponibles.» |
| Recomendación que no llegó | «Recomendación de la IA local» / «La IA local no pudo darte una recomendación…» | «Recomendación de Lía» / «Lía no pudo darte una recomendación esta vez…» |
| Filas de la mirada (ojos, fallo) | «…con IA», «la IA local miró la fotografía…» | el nombre de ella, con «en este equipo» y «un asesor» donde ya estaban |
| Nota del paso de revisión | «…marcado «IA local»…» | «…en una fila a nombre de Lía…» (el modelo local se sigue diciendo) |
| Nota del chat con modelo | «Asistente con IA local (modelo de Chrome, en este equipo)…» | «Lía responde con el modelo local del navegador (no es una persona): lo que escribas no sale de este equipo.» |

Fuera de alcance por su palabra: el backoffice («don't touch for the moment») y el nombre del
producto (ACI · Asistente Comercial Inteligente, que es la marca del producto, no una etiqueta de IA).

## 3. Lo que queda para después (él lo pidió «one by one»)

- **El documento blanco en las manos de ella** mientras la barra avanza, y vuelta a la normalidad
  cuando llega la respuesta. No hay clip de «leer» en el pack CC0 (24 clips: `Idle`, `Walk`, `Wave`,
  `Interact` y combate), así que es pose procedural + una hoja blanca en la mano, con los mismos
  enganches de eventos que ya tienen la mirada y la recomendación.
- **Qué se puede apagar desde «Configuraciones»**: se analiza después de estos arreglos, con él.

## Criterios de aceptación (checks)

- Al confirmar una medida imposible, el aviso de ella YA está en pantalla —sin pulsar «Continuar»— y
  su texto es el mismo que el de la línea del paso. (wizard.spec)
- Un paso que no avanza deja el error en la línea (escrita, oculta) y en el aviso, con el mismo
  texto; sin asistente la línea se enseña y no hay aviso. (wizard.spec)
- El último paso habla por ella: nombre, correo, celular y autorización tienen su frase, el campo que
  falta queda con el foco y `aria-invalid`, y una medida sin escribir también se dice en palabras.
  (wizard.spec)
- Las filas de la mirada y de la recomendación dicen «Lía» (el nombre del paquete) y no «IA local»;
  la nota del chat con modelo nombra a Lía y sigue diciendo que no es una persona. (review.spec,
  recommend.spec, assistant-ia-local.spec)
