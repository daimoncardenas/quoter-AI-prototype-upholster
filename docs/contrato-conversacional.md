# El contrato conversacional: la conversación llena el mismo contrato que el formulario

El dueño, el 24 de septiembre de 2026:

> «the next feature is... conversational voice contract... wizard is determinist way.. you fill data step
> by step... but conversation with AI can be messy... but if you require to AI a contract before send
> pre-quoter... then the system will be declarative and AI should complete the data for contract JSON...
> mix the flexible conversation and hardness of contract JSON requirement... AI will able to change
> questions and redirect to customer until complete the contract information»

> «yeah can be live... but remember the conversation need be fluent... that is wizard is only the
> reference but dont be restrictive... even you can hide the wizard with a modal voice... but with
> transparent design while the user speak with assistant can see the modal voice and how the sound move
> this component but can see how before the wizard will be moving behind of modal transparent»

## La idea en una frase

La precotización necesita un conjunto de hechos. Hoy ese conjunto solo se puede producir de una manera
—el formulario, paso a paso— y eso lo hace rígido. El feature separa **los hechos** de **la manera de
preguntarlos**: los hechos son un **contrato** (JSON), y el formulario y la conversación son dos
maneras de llenarlo. La conversación puede ser desordenada, fluida y hablar de lo que el cliente
quiera; el contrato no. Nadie calcula ni envía nada hasta que el contrato está completo, y el sistema
—no el modelo— es quien dice qué falta.

## Por qué el contrato es lo que vuelve segura la conversación

Tres reglas, las mismas que ya sostienen al asistente:

1. **El modelo no decide datos.** Propone valores para campos de una lista cerrada (el mismo contrato
   de acciones que ya usa `src/assistant/brain.js`): un campo, un tipo, valores permitidos del catálogo.
   Un valor que no está en el catálogo no entra; una cifra calculada no entra nunca.
2. **El validador es determinista.** `faltantes(contrato)` es el espejo de `validStep()`
   (`index.html:1311`): las mismas reglas —mueble elegido, mínimo de fotos, medidas dentro del rango
   del catálogo, lista con cantidad, contacto con autorización— dichas al revés: no «no puedes
   avanzar», sino «esto falta».
3. **El motor calcula.** `Store.lineQuote()` y `estimateInputs()` no cambian: el contrato es
   exactamente lo que el motor consume más lo que el registro guarda.

## El contrato: sus campos y de dónde salen

| bloque | campos | de dónde salen las reglas |
|---|---|---|
| viaje | línea (`service`), ruta, propósito, saber | `skips` y `rutas` por línea (`shared/service-lines.json`) |
| la pieza | mueble (+ su descripción si «Otro»), cantidad, qué se tapiza | `furnitureRules`, `skips` |
| medidas | ancho × alto × fondo, con sus rangos | `measurements.ranges` del catálogo |
| evidencia | fotos (mínimo por línea) | `photoLimits()` |
| elecciones | necesidades, estilo, color, presupuesto, tela | preferencias declaradas + catálogo |
| por línea | daños · insumos · lista o pedido anterior · `answers[askId]` | `asks` por línea (`limpieza`, `boq`, `obra`…) |
| contacto | sede, nombre, correo, teléfono, autorización | `validStep()` del paso 15, Ley 1581 |
| motor | la estimación (con `engineVersion` y sus entradas congeladas) | `Store.lineQuote` — **no la conversación** |

El contrato **por línea** no es un caso especial: una línea que no pregunta mueble deja ese campo en
`null` con su bandera, igual que hoy (`pideMueble()`/`pideMedidas()`/… salen de `skips`).

## Dos capas: los CAMPOS del contrato y las ACCIONES estándar

El dueño, el 24 de septiembre de 2026:

> «one thing are fields...for JSON contract... another actions of AI in each step in the wizard...then
> you should have starndar actions like a "revisar requerimientos, revisar medidas, recomendar tela y
> hacer calculos"...is for all... that can have field that involve this actions...»

Son dos inventarios distintos, y no se mezclan:

- **Campos**: el DATO de la precotización (mueble, medidas, fotos, contacto, lista, la estimación…).
  Viven en el contrato JSON de cada rama — el estado terminado al final de ella — y son lo que la IA
  puede llenar.
- **Acciones**: lo que el asistente HACE en un paso del wizard, y son **las mismas para todas las
  líneas**: `revisar-requerimientos` (mira lo declarado y dice qué no cuadra), `revisar-medidas` (los
  rangos del mueble), `recomendar-tela` (ordena el catálogo con lo declarado) y `hacer-los-calculos`
  (la estimación). El catálogo de acciones es del PRODUCTO: ninguna línea inventa acciones propias.
- **El puente**: un campo puede INVOLUCRAR una acción — `revision` solo existe cuando
  `revisar-requerimientos` corrió (`analizada`), la tela recomendada la devuelve `recomendar-tela`, la
  cifra la produce `hacer-los-calculos` y las medidas pasan por `revisar-medidas` antes de darse por
  buenas. En el JSON, el campo declara qué acción lo llena o lo juzga; la acción se declara UNA vez.
- **Qué decide el flujo de la línea**: qué acciones corren en ella. Una línea que se salta la
  recomendación (`skips`) no ejecuta `recomendar-tela`.

## El contrato es UN JSON por RAMA — al final de cada una, el estado terminado

El dueño, el 24 de septiembre de 2026 (su recorrido de ejemplo: Suministro de tela → Nueva compra → Mi
mueble o proyecto personal → «No tengo claro ninguna de las dos» → Sofá):

> «"línea y sub-línea" is the same... the sub-line is the finish state.. that is.. JSON for sub-line
> indirectly has a line...»

> «if you see can exist subline, subsubline and so on... my point is... you need is base for each
> branch... you need take a JSON finish...this is the contract for this... and for AI can choose faster
> what is... and base on this... check the wizard and apply actions according the case.. in the
> conversation....»

- **Los niveles no tienen número fijo**: sub-línea, sub-sub-línea y así — el catálogo abre los caminos
  que abra (hoy `ruta` → `propósito` → `saber`; mañana más). Lo que define el contrato no es el nivel
  sino la RAMA: el camino completo desde la línea hasta donde deja de preguntar.
- **Un JSON por rama, tomado al FINAL de la rama** — el estado terminado de ese caso. Ahí dentro va la
  línea, indirecta (igual que hoy el camino `reparación` de mantenimiento lleva `line: reparacion`), y
  no hay un JSON «de línea» aparte.
- Ese JSON es **el contrato del caso**: describe la precotización COMPLETA de esa rama (todos sus
  campos — el recorrido de arriba termina en «Sofá» y sus medidas, no en la mitad), con el flujo
  efectivo del wizard para ella (la unión de `skips` que hoy calcula `saltos()`), materializado como
  data.
- **El flujo se lee; no se adivina.** En el navegador el mundo lleva `flujo` = `pasosVisibles()` (los
  pasos que ESA rama tiene a la vista, calculados por el wizard) y el contrato marca un campo como
  «de esta rama» si su paso está en `flujo` (`pasoEnElFlujo`) o si su `aplica(m)` da verdadero. Mirar
  el DOM (`hidden`) mentía —el wizard esconde con `skippedSteps`, no con el atributo— y la
  conversación pedía pasos que el recorrido no tiene (medido: retapizado preguntaba «¿compra nueva o
  pedido?»).
- **Es también el índice de la clasificación**: con los contratos de las ramas a la vista, la IA elige
  MÁS RÁPIDO de qué caso se trata (abajo); y elegido el caso, el contrato dice qué ACCIONES corren y en
  qué paso del wizard.

## Primero se elige el contrato, después se llena

El dueño, el 24 de septiembre de 2026:

> «AI receive the first input with this validate what service line is... and possible subline... this
> first approach.. allow validate still what line and subline want the customer.... with another
> question or anothers questions AI should choose definitely what line and subline is... and then
> complete data according data JSON...and steps of wizard for this line or subline»

Dos fases, en ese orden:

1. **Clasificar** — con la primera entrada, la IA compara lo dicho con los contratos de las ramas y
   propone de qué línea y qué sub-líneas (sub-sub-líneas, y así) podría tratarse; con una o más
   preguntas más, cierra la elección de la RAMA definitiva — la línea viene dentro de ella. Son los
   mismos datos del wizard (`linea`, `ruta`, `proposito`, `saber`), pero la conversación no espera a
   que el cliente llegue al paso: los pregunta y los confirma hablando.
2. **Llenar** — con el contrato elegido, mira el wizard de esa rama (los pasos que ESE caso tiene) y
   aplica las ACCIONES según el caso, en la conversación: `revisar-requerimientos` donde se revisa,
   `revisar-medidas` donde hay medidas, `recomendar-tela` donde hay recomendación y
   `hacer-los-calculos` donde hay cifra. Los campos de las otras ramas no existen.

El dueño, el 24 de septiembre de 2026 (después de ver el espejo del corte 1):

> «for the same reason is a JSON contract... the assistant can handle flexible way.... with flexible
> conversation until complete the JSON and action for validate this data ....»

Llenar no es caminar el formulario. Los pasos del wizard son la REFERENCIA del qué —los fija el
espejo por línea (`tests/contrato-<línea>.spec.mjs`)—, no el orden del cómo: la conversación va en
lote (varias frases llenan varios campos), fuera de orden y con correcciones, y avanza el MISMO JSON
hasta que `faltantes()` queda vacío. El juez de la completitud es el contrato; el modelo no decide
qué falta. Y validar tampoco es su palabra: `validarValor()` (las listas cerradas del catálogo y las
bandas de medidas) más las ACCIONES estándar que juzgan lo declarado —`revisar-medidas`,
`revisar-requerimientos`— son la puerta del dato, campo por campo, en cualquier orden.

### El orden de las preguntas es el del recorrido (dueño, 24/09)

El contrato se pregunta en el orden del RECORRIDO de la rama (`m.flujo`, lo que el wizard tiene a la
vista): se recorre el flujo paso por paso, se valida el campo de cada paso y se pregunta el primero
que falte — y el ciclo se repite hasta que no falte ninguno. Un paso del recorrido sin campo en el
código se pregunta igual.

Medido en retapizado, `faltantes()` devuelve las medidas, los insumos (17), la revisión (13), la tela
(14) y la atención/contacto (15) EN ESE ORDEN — antes no existían los campos de la tela, los insumos,
el estilo/color ni el presupuesto: el formulario los pedía y la conversación nunca. Cada uno se llena
por conversación (decir una tela toca su tarjeta; «estímalos» corre la mano del taller del paso 17;
«revisa» corre la revisión aunque el pendiente sea otro — el parser prueba TODOS los campos que
faltan, no solo el que pregunta), y el wizard se pone en el paso del campo que se pregunta, para que
su control esté a la vista. La estimación no se le ofrece al modelo hasta que tela, insumos y
revisión estén declarados: así no la suelta antes de tiempo.

## La prueba por línea: los campos del wizard contra el JSON

El dueño, el 24 de septiembre de 2026:

> «is base on wizard... should exist testing service-line when validate that the current field of each
> wizard are according of contract JSON fields...»

Cada línea tiene su propia suite (como la evaluación por línea: sola, fuera de `npm test`); recorre
cada rama suya y comprueba el ESPEJO, en las dos direcciones:

- cada paso visible del wizard de esa rama declara los campos del contrato JSON (no más, no menos);
- ningún campo del JSON vive en un paso que esa rama no muestra;
- cada acción estándar que el flujo de esa rama ejecuta está declarada, con el campo que involucra y
  el paso donde corre.

El espejo puede FALLAR: si el wizard gana un campo y el JSON no (o al revés), la suite lo dice con el
paso y el campo por nombre.

## La regla de oro: quién escribe qué

- **La conversación** escribe solo lo que el cliente **dijo**, con sus palabras (el mueble, las medidas
  que dictó, sus colores, su presupuesto, su contacto). Y **confirma lo que cuesta dinero**: una
  medida o una cantidad dictada en voz se le repite al cliente antes de entrar al contrato.
- **El sistema** pone los valores por defecto que ya pone hoy (cantidad 1, cobertura, etc.), valida,
  calcula y guarda.
- **Las correcciones se sobreescriben**: «no, es una poltrona» cambia lo declarado y, si invalida algo
  dependiente (las medidas de ese mueble), eso vuelve a la lista de faltantes. Lo que el cliente no
  cambió no se toca.

## El bucle del driver: fluidez, no guion

    escuchar → mapear lo dicho a campos (allowlist) → validar → decir → preguntar por lo que falta

1. **Nunca un guion.** El modelo elige el orden y las palabras de la pregunta; lo que no elige son los
   campos ni los valores permitidos. El formulario es la referencia del *qué*, no del *cómo*.
2. **Batch.** Una frase puede llenar varios campos («es un sofá de tres puestos, lo quiero en gris,
   mide dos metros diez de ancho»).
3. **Fuera de orden.** Permitido. Cuando el modelo no tiene de dónde tirar, el orden **sugerido** es el
   del formulario (el viaje de la línea).
4. **Redirigir.** Contesta lo que le preguntaron (pasando el cerco) y vuelve a lo que falta.
5. **Pregunta de nuevo, con otras palabras.** Un campo que el cliente no entendió se reformula; al
   tercer intento se ofrece el formulario para ese campo.
6. **Nada de cifras ni promesas.** El cerco sigue juzgando cada turno, también lo que ella dice en voz
   alta.
7. **La charla y la calma no son datos** (dueño, 25/09: «Anotado: Claro.» · «assistant should
   interact… not robot»). `CORTESIA` (gracias, hola, por favor…), `ASENTIMIENTO` (ok, listo, dale,
   claro…) y `PIDE_UN_MOMENTO` (dame un momento, ya te digo, espérame, tomar las medidas…) no llenan
   ningún campo —el parser no los toca, ni el del contrato ni los valores del modelo— y el recibo dice
   lo anotado UNA vez, sin la etiqueta de la rama. La **cortesía** se contesta corta y variada y NO se
   le repite la pregunta en el mismo aliento; la **calma** igual, con su frase de espera; el
   **asentimiento** sí avanza (se vuelve a preguntar por lo que falta: el cliente dijo «dale»).

Antes del bucle va la fase de clasificación (arriba): el bucle llena el contrato que la clasificación
eligió, y solo con las preguntas que esa rama pide.

## La memoria presente: la conversación viva, en cada turno (dueño, 25/09)

> «el problema es que no tiene memoria presente» · «si local storage» · «pero cuando recargue sí debe
> resetearse»

El modelo no recuerda entre llamadas: lo que no viaja en el turno, no lo sabe. Así que cada turno lleva
**la conversación viva** —lo que el cliente dijo y lo que ella contestó, en orden, con el aviso de que lo
último es lo que él acaba de decir— además del estado del formulario y de lo que falta
(`laConversacionHastaAhora()`, hasta 12 mensajes de una línea). Y esa conversación se escribe en
`localStorage` con cada mensaje (clave del cliente, `cdy.v1.memoria-presente`), para que no se pierda
mientras se habla; **al cargar la página se borra**: recargar empieza limpio, que es la regla de la casa
(el cliente puede querer otra precotización por otro motivo). Es la memoria de AHORA, no la del navegador.

## Un solo escritor: el modelo llena, la página escribe (dueño, 25/09)

> «eso con función que escriba es muy riesgoso… con razón había visto varios inputs rellenados raros»

Con la API puesta, el **parser del contrato solo mira el campo que se está preguntando** (ahí la forma
del cliente importa: «de ancho 210, de largo 90»); **todos los demás campos los llena el modelo** con sus
`valores`, que entran por los mismos controles y con la misma validación (`aplicarValorDelContrato` →
`aplicarLoDicho`). Antes había DOS escritores: el modelo y un adivinador que probaba todos los campos del
recorrido en cada frase — ése fue el que escribió «Claro» como ciudad del cliente. Sin API (el demo de
doble clic) el respaldo sigue adivinando: ahí no hay quien analice el texto.

- Los `valores` del modelo se aceptan en las formas razonables: `{"atencion": "Manizales"}` (texto) o
  `{"atencion": {"cliente": …, "servicio": …}}`, `{"medidas": {"ancho|width": …}}`, `{"contacto":
  {"nombre|correo|celular": …}}` o la frase tal cual. Perder una forma es perder lo que el cliente dijo
  (medido: el modelo mandó la ciudad como texto y no entraba).
- El recibo dice lo anotado UNA vez y con los números dentro («90 × 90 × 90 cm» es un recibo válido).

## El seguimiento: lo que pasó, turno por turno

`node tools/seguir-conversacion.mjs ["frase" …]` habla con la asistente (modelo real si el server está
encendido) y deja en `generated/seguimiento/` una captura por turno más un `seguimiento-<fecha>.md` con:
lo que dijo el cliente, **el JSON que decidió el modelo**, lo que entró al formulario, lo declarado, lo
que falta y el paso del wizard. La página expone el último turno en `voz.ultimoTurno` (dicho, decir,
valores, aplicados, respaldo) para que el seguimiento no adivine. `node tools/atlas.mjs` hace lo mismo
con las pantallas: una captura por paso de cada línea, en `generated/atlas/`.

## El modal de voz: transparente, con el formulario vivo detrás

- **La capa**: un modal translúcido (`backdrop-filter`) sobre el cotizador, con el asistente y su
  visual. El formulario queda visible detrás y **se mueve**: al entrar un campo, el modal deja ver el
  paso que se completó y el que falta (`showStep()` al paso del dato recién declarado o al primero
  incompleto, con `pasosVisibles()` de la línea — nunca los veinte pasos de todas las líneas).
- **Una sola fuente**: la conversación escribe en el mismo `state`, así que los campos se pintan con
  las funciones de siempre. El formulario no es un espejo de la conversación: es la misma verdad,
  dibujada.
- **El componente que se mueve con el sonido** — y el movimiento dice la verdad:
  - mientras habla **el cliente**: el nivel real del micrófono (`getUserMedia` + `AnalyserNode` de Web
    Audio; el análisis es local, no sale del equipo);
  - mientras habla **ella**: pulsos con los eventos `boundary` de `speechSynthesis` (una señal real
    por palabra, no barras decorativas);
  - mientras **piensa**: los puntos del chat, como siempre.
- **Botones y piezas mínimas**: micrófono, teclado (el mismo diálogo por texto), silenciar su voz,
  cerrar el modal para seguir en el formulario, y **el componente de fotos** (abajo).
- **La conversación también llena las fotos.** El dueño: «you can have a component for photos .... and
  tell them "porfa sube al menos 3 fotos para conocer mejor tu mueble"... for example... the
  conversation has input ... and fill this requirements too». Entonces el modal trae su propio
  componente de subida —una zona de arrastre con el mismo lenguaje visual del formulario— y ella
  PIDE las fotos como pide cualquier otro dato: el contrato ya sabe cuántas faltan (`fotos`, no `min`
  de la línea) y la frase es suya (con la API, dicha con sus palabras; en la simulación, la
  preparada del cerebro: «Porfa sube al menos 3 fotos para conocer mejor tu mueble»). Lo que el
  componente NO puede tener es su propia tubería: llama a `loadPhotos(files)` —el mismo intake del
  formulario, con su máximo, sus dimensiones medidas y su `PHOTOS_CHANGED`— para que las fotos sean
  LAS MISMAS y la revisión del paso 4 siga diciendo lo que midió. En la demo de doble clic (sin
  servidor) el componente sigue funcionando —subir es local—; solo la frase cae a la preparada.

## La voz, y su honestidad

- **Entrada**: `SpeechRecognition` es-CO. Los resultados **finales** entran al contrato; los interinos
  solo mueven el visual. Al cargar se hace **sonda de capacidad** (¿reconocimiento en el equipo? ¿hay
  voz es-CO para hablar?) y la nota dice por dónde viaja el audio — la misma regla que se aplicó al
  pasar a la API: si el audio sale del equipo, se dice.
- **Salida**: `speechSynthesis` con la voz del sistema, silenciable. Sin voz adecuada, ella escribe y
  el modo no promete hablar. El **ruido al final de su frase lo pone la voz del sistema** que el
  navegador elige (las viejas chasquean al cerrar): el selector prefiere Colombia, luego
  Natural/Neural/Online, y cuál suena limpia en un equipo se OYE — `generated/voz-laboratorio.html`
  (diagnóstico de una vez, fuera de git) pone cada voz del equipo en un botón con la frase y el idioma
  de la app, y la preferencia se fija con lo que el dueño elija ahí.
- **Sin micrófono o sin permiso**: el modo voz se apaga y queda el mismo diálogo por texto.

### El turno, en las dos direcciones (dueño, 25/09)

> «and is important tha customer can interrupt to assistant... but assistant can not interrupt to
> customer»

- **Él la interrumpe**: mientras ella habla, lo que entra por el micrófono se compara con lo que ella
  acaba de decir (`pareceSuPropiaVoz`: dos de cada tres palabras suyas). Si es su eco —los parlantes—
  no entra; si **no** suena como ella, es el cliente cortándola: se la calla en el sitio
  (`callarlaParaEscuchar`, `cancel`) y sus palabras abren turno.
- **Ella no lo interrumpe**: su frase espera la pausa del cliente. El nivel real del micrófono
  (`AnalyserNode`) se mide contra el PISO de su propio cuarto (el mínimo oído, con deriva lenta), no
  contra un número fijo; mientras él hable, la frase espera (tope de 12 s para no quedarse muda), y si
  entre tanto sale otra frase, la vieja se cae.
- **La cola del eco es corta**: 400 ms (antes 1500). La cola larga se comía el arranque de la frase
  siguiente del cliente — eso se sentía como «el micrófono no capta mi voz».

## Qué NO cambia

- El formulario sigue siendo el camino determinista y el único que existe **sin API** (la demo de doble
  clic): ahí la conversación no llena nada y todo sigue como hoy.
- El cerco juzga cada turno; el cerebro simulado responde cuando el turno lo rompe.
- El envío (`submitQuote()`) y el motor: mismas entradas, mismo `engineVersion`, mismo registro.

## Primer corte (no empezar por la voz)

**Estado del corte 1 (24/09)**: los contratos como data están escritos —`shared/contracts/` con las
trece ramas de las seis tarjetas que hoy se pintan (las siete del suministro, retapizado, reparación
con sus dos entradas, a la medida, proyecto comercial y tapicería arquitectónica) y las ACCIONES
estándar en `shared/ai-actions.json`—, con la suite de espejo por línea (`npm run
test:contrato-<línea>`, la maquinaria en `tests/contratos.mjs`). **Segunda pasada del mismo día
(dueño)**: «eso no tiene cara de endpoint de backend... un mierdero de indicaciones que son para el
frontend... necesita datos claros y concretos» → el contrato quedó como **cuerpo del endpoint** (puro
dato, camelCase, nombres de archivo y claves EN INGLÉS, `shared/contracts/README.md`) y el espejo del
wizard (pasos, controles, entradas) se mudó a `tests/mirror/<branch>.json`; la suite comprueba que
las dos caras digan la misma rama. Los nombres internos del cotizador siguen en español: el mapeo
campo a campo se cierra cuando los nombres del endpoint queden definidos. **Falta la rama de limpieza
de mantenimiento**: su flujo muestra hoy los pasos 21 y 20 (pedido y lista, de los caminos del
suministro) y `wizard.spec` lo tiene por rojo desde el 21/09 —hallazgo abierto, se reporta; su
contrato y su suite entran cuando el flujo quede arreglado—. El corte 2 (`contrato.js` como motor
del contrato elegido) y el 3 (la clasificación en el driver) no están empezados.

**Las líneas TERMINADAS hoy son dos —«Suministro de tela» y «Retapizado de muebles» (dueño,
24/09)—**: sus contratos y sus suites son la palabra final de esa rama. Los contratos de las otras
tarjetas (reparación, a la medida, proyecto comercial, tapicería arquitectónica) son el espejo del
flujo ACTUAL de una línea en obra: valen como referencia mientras la línea se termina, y el espejo
avisa —en rojo— cuando el flujo se mueva. Mantenimiento va aparte por su hallazgo (arriba).

1. **Los contratos como data** — un JSON por rama (el estado terminado al final de cada una, con su
   línea indirecta) más el catálogo de ACCIONES estándar, declarado una sola vez; con la suite de
   espejo por línea (abajo), corriendo sola.
2. **`contrato.js` como motor del contrato elegido** — deja de tener una lista única: recibe el JSON
   de la rama y produce `faltantes()`, `progreso()` y `validarValor()` sobre ESA; con su spec
   `tests/contrato.spec.mjs`, corriendo sola.
3. **El driver por texto** — primero la clasificación (la rama definitiva, con su línea dentro),
   después el llenado del contrato elegido; con su spec (clasificación por la primera entrada,
   conversación fuera de orden, una corrección, un intento de inventar medidas).
4. **La voz**: sondas de capacidad, reconocimiento, síntesis, el modal transparente y el visual; spec
   del modal (el formulario se mueve detrás, el visual responde al nivel del micrófono).

Cada corte se verifica solo: los specs del contrato y el driver por texto corren en `file://` con el
cerebro simulado (sin API, sin micrófono), y la voz se prueba en el Chrome del dueño, que es el único
que tiene micrófono.

## Criterios de aceptación

- Con el contrato a medias, la solicitud no se puede enviar y se dice **qué falta con las mismas
  frases del formulario** (una sola lista de mensajes).
- Una conversación fuera de orden deja el **mismo contrato** que el formulario, y el registro sale con
  las mismas entradas congeladas.
- El modelo **no puede** escribir un campo que el cliente no dijo (spec: intento de inventar medidas →
  se ignora y se pregunta).
- El formulario detrás del modal **avanza** con la conversación, y solo con los pasos que la línea
  tiene.
- Sin API, sin micrófono o sin permiso, el modo conversación cae al formulario o al cerebro simulado
  sin prometer nada.
- La IA **elige** el contrato: con la primera entrada propone la línea y las posibles ramas, y las
  preguntas siguientes cierran la elección del estado terminado antes de llenar nada.
- El llenado sigue los **pasos del wizard de esa rama**: ningún campo de otro caso.
- Las acciones son **las mismas para todas las líneas** (`revisar requerimientos`, `revisar medidas`,
  `recomendar tela`, `hacer los cálculos`); el flujo decide cuáles corren y el campo que una acción
  llena lo declara.
- El **espejo por línea** pasa en las dos direcciones (cada paso visible declara los campos del JSON
  de esa rama; cada campo del JSON vive en un paso que la rama muestra).

## Decisiones abiertas para el dueño

- ¿El modo voz se elige al principio (conversación **o** formulario) o vive siempre como un botón que
  entra y sale?
- ¿La conversación puede **enviar** la solicitud al terminar (tras confirmar en voz) o el envío es
  siempre el botón visible del formulario?
- ¿Se acepta el reconocimiento del navegador (audio fuera del equipo, con su nota) cuando no haya
  reconocimiento local, o el modo voz se apaga en esos equipos?
- **Dónde vive el contrato JSON**: *propuesta: `shared/contracts/<rama>.json` escrito a mano como
  data (`service-lines.json`), y la suite por línea lee el wizard RENDERIZADO — el espejo falla si
  alguno de los dos se mueve solo. La otra vía —generar los JSON del catálogo más un mapa
  paso→campos— deja el mismo test.*
- **El catálogo de acciones estándar**: *propuesta: declararlo como data (`shared/ai-actions.json`),
  una sola vez para todas las líneas.*

Ya decidido: las fotos **se piden desde la conversación**, con su componente en el modal y la misma
tubería del formulario (arriba); el estado es **uno solo**: la conversación escribe en el `state` que
el formulario ya dibuja; y el contrato es **el JSON al final de cada rama** — su estado terminado lleva
la línea dentro, indirecta, y no hay un JSON «de línea» aparte.
