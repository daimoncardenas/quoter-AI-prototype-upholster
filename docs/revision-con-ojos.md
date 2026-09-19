# La revisión mira la foto — y dice con qué ojos

El paso 4 («Revisión previa») comprobaba la fotografía solo por lo que se puede medir sin mirarla:
cuántas llegaron, cuánto miden, si alguna es de baja resolución. Nunca decía haber visto lo que hay
en ella — la frase `no longer claims the image is a sofa` de `tests/review.spec.mjs` defiende
exactamente eso. El dueño pidió lo que faltaba, con sus palabras:

> «yeah this step needs eyes for validation of photos... and related with another information... please»

Aquí está la forma que tomó.

## Qué hace

- Cuando el modelo local del navegador está listo (`availability() === 'available'`), la tarjeta
  manda a mirar **la foto más grande** de las cargadas —el mismo criterio con el que la revisión
  señala «la menor»— y pinta lo que responde como **una fila más** de la tarjeta (`#visionNote`),
  marcada con la etiqueta **IA local**.
- Antes de mirar, la fila dice «Mirando tu foto» **con los puntos del chat**
  (`.mirada-pensando`, `role="status"`, la misma clave `typing-dot`): el modelo tarda segundos —12 en la
  máquina del dueño— y una línea quieta se lee como un cotizador colgado. Es la lección de
  `docs/chat-en-espera.md`, aplicada aquí; con `prefers-reduced-motion` los puntos se quedan quietos.
- La mirada contesta en **JSON** (`{"veMueble": true|false, "frase": "…"}`): se muestra `frase` —pasada
  por el cerco— y el **color lo pone `veMueble`**: verde si ve el mueble, ámbar si no lo ve. El color
  dice lo que dice la mirada, no que la tubería funcionó; una frase sin mueble en la foto en verde se
  leería como un visto bueno que nadie dio. Si el modelo contesta en prosa y el veredicto no se puede
  leer, se muestra su texto tal cual **en ámbar**: es una cautela, no un visto bueno.
- La etiqueta **«IA local»** va siempre: dice quién mira, no si la noticia es buena.
- La mirada **no decide nada**: no bloquea el paso, no cuenta como observación de la revisión, no
  entra en `state.review` y no toca la estimación. Es lo que ve, no un veredicto.
- Si en la foto **no hay un mueble** —un documento, una habitación, una mano— el carácter pide decirlo
  claro y no describir nada más. El cerco deja pasar esa respuesta (es lo que se ve) y la fila la
  muestra como cualquier otra mirada: «Veo un documento con texto, no un mueble…».

## Con qué información mira («related with another information»)

Con **las mismas filas que el cliente está leyendo** en la tarjeta, ni una versión distinta: las
arma una sola función, `declaredRows()` (motivo, mueble y puestos, medidas, qué se tapiza, uso
previsto, estilo y color, punto de atención, fotografías y, si el motivo tiene daños, reparaciones).
`renderReviewSummary()` las pinta y `promptDeLaMirada()` las escribe, así que la mirada y la tarjeta
no pueden divergir. El caso que lo afirma: `y lo declarado en el cotizador viaja entero con la
mirada` — lee las filas del DOM y comprueba que todas están en el carácter del modelo.

## Qué NO puede decir

La mirada pasa por el **cerco** (`assistant-fence.js`, `CercoAsistente.revisar`) antes de mostrarse:

- una promesa (plazos, garantías, transporte, rellenos, descuentos), una cotización «definitiva» o
  una cifra en pesos **no se muestran**: en su lugar queda
  `La IA local miró la fotografía, pero su respuesta no se puede mostrar aquí. Un asesor la revisa y
  te dice si sirve.` — la fila dice que miró y que lo que dijo no se puede mostrar, nunca una línea
  hueca bajo un título que promete «lo que veo en la foto».
- la regla del **tema** del cerco (una respuesta tiene que hablar del motivo o del negocio) **no** se
  le aplica: es una regla del chat —responder a lo que se preguntó— y una descripción de la foto no
  responde a nada. Se pasa `sinTema: true`; las promesas, las cifras, el «definitivo» y el relleno se
  siguen juzgando. Sin esa salida, una mirada limpia se caía por no nombrar el motivo y la tarjeta
  quedaba con la línea vacía (el dueño: «the sentence dont say nothing»).
- al modelo se le prohíben, además, las medidas, los precios y las telas del catálogo, y se le pide
  que **no diga que confirma** lo declarado: lo que ve, no lo que el cliente ya escribió.

## Los tres desenlaces de la fila

| Lo que pasó | Lo que lee el cliente |
|---|---|
| El modelo miró y su respuesta pasa el cerco | su texto, tal cual, con la etiqueta **IA local** |
| El modelo miró y su respuesta **no** pasa el cerco (promesa, cifra, no habla del caso) | `Un asesor mira la fotografía y confirma lo que haga falta.` — el motivo queda en la consola |
| **No puede mirar**: este equipo no tiene la variante de imagen (o el veredicto no se pudo leer) | `En este equipo no puedo mirar la fotografía con IA. Un asesor la revisa y te dice si sirve.` — en ámbar |
| **El intento se cayó** (la foto no se leyó, el modelo reventó) | `No pude mirar la fotografía con el modelo local de este equipo. Un asesor la mira y te dice si sirve.` — en ámbar |

Mientras corre —comprobar si el equipo puede mirar y mirar— la fila lo dice con **movimiento inequívoco**:
el icono de la fila es un **aro girando** y debajo del título corre una **barra indeterminada** (no un
porcentaje: no hay progreso que medir, y fingirlo sería mentir). El dueño lo pidió así —«is necessary the
loading... because the user can think that dont need wait for something», y después «can be bar of charge.. or
spinner»—, y `review.spec` comprueba la animación por **estilo computado** (`mirada-barra` en bucle,
`mirada-giro`), no que el elemento exista. La espera se ve un mínimo de `ESPERA_MINIMA_MS` (450 ms) aunque el
equipo conteste al instante, para que la señal no sea un parpadeo.

Y **«Continuar» espera a la mirada**: mientras corre está desactivado, y si el paso se intenta cerrar igual,
`validStep` lo dice —«Un momento: la IA sigue mirando tu fotografía. Puedes continuar cuando termine.»— y no
deja pasar: la revisión no se cierra con una foto que la IA todavía está mirando. Al terminar, el botón vuelve
solo (también cuando no había ojos o la mirada se cayó) y el aviso se retira.

**Sin modelo** (el equipo no tiene Nano) la fila **no se pinta**: la tarjeta es la del cerebro simulado y su
aviso ya dice que no hay IA real — ahí no se prometió ninguna mirada. Con modelo, en cambio, el cliente
**siempre ve qué pasó con su foto**: la observación, la línea honesta de que aquí no se puede mirar, o el
fallo. Nunca se queda sin decir nada. El caso común de «no puede mirar» es un Chrome con el modelo de texto
pero sin la entrada multimodal, que vive detrás de su propia bandera
(`chrome://flags/#prompt-api-multimodal-input`) y de su propia descarga:
`spikes/002-el-modelo-mira-la-foto` es el que lo dice con el error del navegador en la mano.

La foto viaja como una copia de 1024 px hecha en el propio navegador (`fotoPequeña`, JPEG 80): la
original puede pesar megas y el modelo solo necesita mirarla. Nada sale del equipo.

## Cómo se activa la mirada en un equipo

La entrada de imagen no viene de fábrica con el modelo de texto: es la variante **multimodal**, con su
propia bandera y su propia descarga. Para activarla en un equipo:

1. `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → **Enabled** → reiniciar Chrome.
2. Dejar que Chrome baje la parte multimodal. Requisitos que pide Chrome para el modelo:
   ≥22 GB libres en el volumen del perfil, conexión sin medidor, y GPU con más de 4 GB de VRAM
   (o CPU con 16 GB de RAM y 4 núcleos).
3. Mirar qué hay instalado en `chrome://on-device-internals` (Chrome lo publica ahí, con tamaños).

`spikes/002-el-modelo-mira-la-foto` enseña la respuesta del navegador tal cual —`available`,
`downloadable`, `downloading` o `unavailable`— junto al error de la sesión con imagen, que es la
manera rápida de saber **qué** falta en un equipo concreto. El cotizador pregunta lo mismo con
`IA_LOCAL.availability({expectedInputs:[{type:'image'}]})` y, como con el chat, **no descarga nada**:
en `downloadable`/`downloading`/`unavailable` la fila no se pinta (bajar gigas no puede ser el precio
de abrir una cotización).

## Dónde vive

| Pieza | Qué es |
|---|---|
| `index.html` `declaredRows()` | las filas declaradas, única fuente para la tarjeta y para la mirada |
| `index.html` `mirarLaFoto()` / `promptDeLaMirada()` / `fotoPequeña()` / `FILA_MIRADA` | la mirada y su fila |
| `index.html` `#visionNote` + `.tag-ia` | el hueco en la tarjeta y la etiqueta «IA local» |
| `assistant-fence.js` | el cerco que juzga la mirada como juzga una respuesta del chat |
| `tests/review.spec.mjs` | sección «LA REVISIÓN MIRA LA FOTO (IA LOCAL) Y LA RELACIONA CON LO DECLARADO» |

Las ocho comprobaciones de esa sección, todas con un `LanguageModel` de mentira que apunta lo que
recibe: la mirada se muestra; la foto llega de verdad (`Blob`, con tamaño); el navegador está avisado
(`expectedInputs` con `image`); lo declarado viaja entero; la fila va marcada «IA local»; una promesa
no se muestra y queda la línea neutra; sin modelo no hay fila.

## Lo que queda abierto (y su precio)

- **El modelo de verdad opina distinto que el de mentira.** La spec fija el contrato, no la calidad
  de la mirada: Gemini Nano dirá cosas como «veo un sofá claro» y a veces se equivocará con el
  entorno de la foto. Por eso la fila es una observación marcada y un asesor la confirma.
- **La mirada no viaja al registro de la solicitud.** Hoy se pinta y se pierde; llevarla al detalle
  de la cotización (y al backoffice) es un paso más, del mismo tamaño que el que quedó parkeado para
  la descripción de «Otro».
- **Mirar cuesta tiempo de GPU.** Son segundos por cotización en el equipo del cliente; si algún día
  molesta, el interruptor es `mirarLaFoto()` y el paso sigue funcionando sin ella.
