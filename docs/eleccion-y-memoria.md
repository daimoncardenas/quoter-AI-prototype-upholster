# Elegir el contrato, recordar el caso y mirar si la foto se lee

El dueño, el 24/09, corrigiendo el dibujo del flujo que le devolvió la asistente:

> «el model tiene que elegir por obvias razones cual JSON es de acuerdo al caso y las primeras
> preguntas de sondeo... como diablos va a hacer de otra forma»
>
> «puede guardarse esa memoria en algun LOCAL STORAGE o algo asi para tener acceso a ese contrato
> durante la conversacion e ir anotando y completando cada campo de ese contrato»
>
> «si hay fotos.. tienes que validar que realmente se puedan leer y que sea lo que dicen que es.. o
> si estan borrosas etc...... para completar ese campo»

Tres piezas, una por pregunta. Prueba: `npm run test:eleccion-y-memoria`.

## 1 · El modelo elige el contrato (`elIndiceDeContratos`, el prompt y `rama`)

El contrato de cada rama es un JSON terminado (`shared/contracts/`), y **esa lista es el índice de la
clasificación**: el prompt de la conversación lleva, por cada rama, su cadena en rótulos y el id de su
contrato —

    - Suministro de tela → Nueva compra → Reventa o inventario → Quiero sugerencias → contrato suministro-tela.compra.reventa.sugerencias

— con la orden de elegir por el sentido y anotarlo en `rama`. El índice sale del **catálogo** (las
líneas, sus rutas, sus propósitos y sus saberes), así que una rama nueva entra sola; y la única lista
que se sostiene a mano es la de las líneas cuyo contrato todavía no está escrito (`"contrato":
"pendiente"` en el catálogo — hoy, mantenimiento): no se ofrece lo que no existe.

Cuando el turno trae `rama`, `aplicarValorDelContrato('rama', id)` aplica la **cadena entera** por los
mismos controles que un dedo —la tarjeta de la línea, la del camino, la del propósito y la de lo que
sabe— y valida cada nodo contra el catálogo: una rama inventada no entra y lo dice. El modelo
clasifica; el sistema traduce y juzga. Nada se escribe dos veces.

## 2 · La memoria es de la conversación (`olvidarElCaso`)

Lo declarado vive en la página mientras se conversa —la rama, los campos, la compra, los mensajes— y
**recargar empieza limpio**: no vuelve nada y no queda ningún borrador en el almacén (el dueño:
«cuando recargo no se borra»). La memoria que llena el contrato es la de la conversación y
la sesión del proveedor (que es suya y se rehace), no la del navegador.

Dentro de la conversación, el caso se limpia cuando **otro caso empieza**: el cliente se va a otra
línea (la tarjeta del paso 0) o lo pide —«empezar de cero», «otra cotización», «otro caso»— y
`olvidarElCaso()` vacía la compra, los campos, los daños, las fotos y la conversación (el dueño:
«¿qué pasa si el cliente quiere otra pre-cotización por otro motivo?»). Ni la ciudad, ni la compra,
ni las medidas de un caso viajan al siguiente. Todo eso lo mide `tests/eleccion-y-memoria.spec.mjs`.

## 3 · Una foto borrosa se nota (`medirNitidez`, `NITIDEZ_MINIMA`)

La nitidez es **aritmética sobre los píxeles**: la varianza del laplaciano sobre el gris, en una
muestra de 480 px de ancho (`medirNitidez`). Se mide UNA vez, al cargar la foto, y la revisión
(`runReview`) la lee. El modelo de visión no decide si una foto se puede leer — mira y cuenta lo que
ve, y eso está bien, pero la borrosidad se mide.

Calibración (medida en las pruebas, 900×650): **nítida ≈ 2000 · desenfoque leve ≈ 80 · plano ≈ 0** →
`NITIDEZ_MINIMA = 200`, con la foto repetida como consejo (la revisión no bloquea: el asesor las mira
igual). Una foto chica sigue avisando por resolución, como antes.

## Dónde vive cada cosa

| Pieza | Dónde |
| --- | --- |
| El índice de contratos | `elIndiceDeContratos()` en `index.html`; el bloque en `promptDeLaConversacion` |
| Elegir y aplicar la rama | `case 'rama'` en `aplicarLoDicho`; `losValoresLegalesDe('rama')` |
| La memoria | `Store.draft`/`saveDraft`/`forgetDraft` (store.js); `guardarElBorrador`/`restaurarElBorrador` (index.html) |
| La nitidez | `medirNitidez`/`NITIDEZ_MINIMA`; la fila «fuera de foco» en `runReview` |
| La ciudad que se dice | `ciudadDicha`; el respaldo «Otra ciudad…» en `elegirCiudad` |
| La prueba | `tests/eleccion-y-memoria.spec.mjs` |
