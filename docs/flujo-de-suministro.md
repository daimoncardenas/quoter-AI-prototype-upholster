# El flujo de suministro: dos caminos, tres propósitos y un solo tronco

El dueño dibujó el flujo (20/09 — tres versiones hasta la final) y pidió que sea **agnóstico**: da
igual el paquete (Mediterránea, Macizo, Intertelas o el que venga) — el wizard dirige, y lo que decide
el camino es lo que declara quien entra, no quién es la empresa. En sus palabras: «el wizard debe
dirigir y está diseñado para cualquier tipo de caso de uso».

## Qué había

Un solo recorrido (mueble, medidas, fotos, preferencias, recomendación, estimación) para cualquier
comprador: al profesional que ya sabe la referencia y los metros se le pedía describir un sofá. El
cotizador nunca preguntaba lo que un distribuidor vende de verdad — disponibilidad, lote y forma de
compra — y la única salida era una pre-cotización con número.

## Los dos caminos (la primera pregunta)

    ¿Qué quieres hacer?
    1  Nueva compra               Tela nueva: una referencia o varias
    2  Completar pedido anterior  Faltante de una compra anterior

El segundo va directo a **buscar pedido** (factura, referencia, color y lote) y de ahí a su lista.

## Los tres propósitos (solo en la compra nueva)

    ¿Para qué necesitas la tela?
    1  Reventa o inventario             Compra para stock o terceros
    2  Mi servicio de tapicería         La tela para los trabajos de mi taller
    3  Mi mueble o proyecto personal    Para mi casa o mi proyecto

Los tres son **el mismo recorrido con distinto propósito**, y el propósito decide lo que se pregunta
después. No se anulan entre sí: el cliente final que se salta al tapicero para hacerlo él y el taller
que compra para sus trabajos son dos casos distintos de la misma línea, y la empresa necesita saber
cuáles cubre. Por eso el propósito **se congela con la solicitud** (junto a la ruta y a lo que se
sabía): el backoffice puede contarlos.

## Qué se sabe (la tercera pregunta)

    ¿Conoces tela y cantidad?
      → Conozco la tela y cuánto necesito     compra directa
      → Conozco la tela, no cuánto necesito   el cálculo del trabajo (taller)
      → Sé cuánto necesito, no la tela        recomendación
      → No tengo claro ninguna de las dos     el recorrido guiado

- **Reventa o inventario** pregunta lo suyo (el dueño, 24/09 — antes caía directo en la lista sin
  preguntar nada): **«¿Ya sabes qué tela quieres?»**

      → Sé qué tela quiero    la lista y el cierre (referencias, colores y cantidades por producto)
      → Quiero sugerencias    las características (uso, estilo, gama) + la recomendación: ahí se
                              eligen VARIAS telas, cada una con su cantidad, y la lista no vuelve

  El que revende trae referencias, colores y cantidades; el que pide sugerencias **arma su compra EN
  la recomendación** (acción `recomendar-tela`, paso 14): elige varias telas y cada tarjeta elegida
  lleva su cantidad (su unidad: metros, o rollos si esa tela se vende por rollo), que es su fila de la
  compra — y sin tela elegida, o con una sin cantidad, no se pasa (el aviso dice cuál falta). Por eso
  el paso de la lista (paso 20) no vuelve en ese camino: ya se declaró todo. En el camino de «sé qué
  tela quiero» la lista es el paso corto de siempre. Los dos cierran en la estimación.
- **Mi servicio de tapicería** pregunta dos cosas (las dos, o que se calcule el trabajo).
- **Mi mueble o proyecto personal** pregunta tres (las dos, los metros, o que lo guíen).

Lo que sabe el cliente decide quién pone los números:

    sabe tela y cantidad   la lista (referencia + cantidad en su unidad)  → reglas → valor
    sabe la tela           la lista (solo la referencia) + mueble/medidas → el motor calcula los metros
    sabe los metros        la lista (solo la cantidad) + recomendación    → el catálogo pone la tela
    no sabe nada           mueble, medidas, preferencias, validación, recomendación → recorrido guiado

## El tronco (común a todas las ramas)

    Regla comercial            corte, mínimo, incremento o rollo
      → Cantidad facturable    lo que realmente se cobra
      → Valor estimado         facturable × precio vigente
      → ¿Hay stock y lote?
          sí / parcial  → Cotización preliminar + Datos de entrega (valor, disponibilidad y condiciones)
          parcial / no  → Valor indicativo + asesor (alternativa, espera o cantidad parcial)

Y aparte, **Muestra o asesoría**: la salida de quien no puede elegir una tela en digital. Arranca en la
Recomendación, en mitad del recorrido guiado, sin cantidad y sin precio — la solicitud tiene que poder
guardarse sin número.

## Decisiones tomadas

- **Un solo paso para la cantidad declarada, con una tela o con veinte.** La lista es la misma para la
  compra directa, para el que revende y para el faltante de un pedido; cada fila pasa por SU regla
  comercial (mínimo, incremento, rollo) y lleva su unidad (metros, o rollos completos).
- **La compuerta responde por línea.** Una solicitud puede llevar varias referencias; una referencia
  sin stock no arrastra toda la lista al asesor: la salida es mixta —líneas confirmadas y líneas para
  asesor— con el valor total y su detalle por línea (decisión del dueño, 20/09).
- **Stock y lote son datos opcionales del negocio**, por referencia (cantidad disponible y lote). Sin el
  dato, la respuesta honesta es la de asesor: nunca se finge existencia.
- **La cantidad tiene origen**: declarada, calculada o rollo. El alza de desperdicio y margen solo
  aplica cuando la cantidad se CALCULA; a quien declara 22 metros no se le muestran 24.
- **El propósito y lo que se sabía van congelados con la solicitud** (`proposito`, `saber`): es lo que
  permite decir, con números, qué casos cubre la línea cuando la empresa la habilita.
- **Nada de esto nombra a un cliente**: ruta, propósito y saber son datos del catálogo de líneas,
  iguales para los tres paquetes.

## Lo que ya existe y no se toca

- La regla comercial es `Store.quantities()` tal cual (mínimo, incremento, rollo y sobrante, con sus
  razones escritas en el paso).
- La estimación es un paso de todos los motivos (`docs/journeys.md` §10) y sigue siéndolo: cuando la
  compuerta no deja vender, muestra «por confirmar» en vez de inventar cifra.
- La recomendación con IA ya solo reordena el catálogo; lo que le falta para recomendar en serio (uso,
  desempeño y preferencias) es catálogo, no motor.

## Pendiente de decidir

- **Retapicería cotiza un trabajo, no material.** Hoy retapicería (pricing `tela`) suma **mano de obra
  como 60 % del valor de la tela** (store.js:651): con 21,5 m de Velvet Siena son ≈ 1.535.100 y con la
  misma cantidad de Lino Verona ≈ 1.148.100 — el mismo trabajo vale menos porque la tela es más barata.
  Lo correcto para un trabajo tercerizado es **mano de obra por pieza** (o por hora) más **insumos**
  (espuma, cinchas, grapas, hilo, pegante) con su costo, como ya los tiene «Mueble a la medida»
  (`asks:['materiales']` + maderas/acabados/firmezas/herrajes en `pricingRates.fabricacion`). Falta la
  decisión del dueño: por pieza, por hora, o se queda el porcentaje.
- **La lista mixta** (líneas confirmadas + líneas a asesor) espera el dato de stock por referencia.
- **El mayorista** (precio por tipo de comprador) es dato/tarifa del negocio, no un paso del flujo.

## Cómo se prueba

- `tests/ruta-cantidad.spec.mjs` — la compra directa: la lista, la unidad de cada tela, la regla de
  cada fila, el alza que NO se aplica a lo declarado, el cierre y la solicitud congelada.
- `tests/ruta-caminos.spec.mjs` — los tres propósitos y los saberes de cada uno (los dos de la
  reventa incluidos): qué recorrido abre cada respuesta y qué pide la lista en cada caso.
- `tests/ruta-pedido.spec.mjs` — completar pedido: buscar la solicitud, traer su referencia, el
  faltante, y el lote/continuidad que confirma un asesor.
- La caminata clásica sigue en `tests/wizard.spec.mjs`, `wiring`, `atencion` y `presupuesto`: el
  recorrido guiado es el de siempre, ahora dentro de «nueva compra → mi mueble → no tengo claro nada».
