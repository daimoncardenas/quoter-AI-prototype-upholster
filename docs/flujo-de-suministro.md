# El flujo de suministro: cuatro carriles y un solo tronco

El dueño dibujó el flujo completo (20/09) y pidió que sea **agnóstico**: da igual el paquete
(Mediterránea, Macizo, Intertelas o el que venga) — el wizard dirige, y lo que decide el camino es lo
que declara quien entra, no quién es la empresa. En sus palabras: «el wizard debe dirigir y está
diseñado para cualquier tipo de caso de uso».

## Qué había

Un solo recorrido (mueble, medidas, fotos, preferencias, recomendación, estimación) para cualquier
comprador: al profesional que ya sabe la referencia y los metros se le pedía describir un sofá. El
cotizador nunca preguntaba lo que un distribuidor vende de verdad — disponibilidad, lote y forma de
compra — y la única salida era una pre-cotización con número.

## Los cuatro carriles (la primera pregunta)

    ¿Qué necesitas?
    1  Compra directa        Ya conoce tela y cantidad (código, color, metros o rollos)
    2  Mueble o proyecto     Una pieza, iguales o partidas
    3  Inventario o reventa  Compra para stock o terceros
    4  Completar pedido      Faltante de una compra anterior

Solo el carril 2 pregunta mueble, medidas y fotos. Los otros tres los saltan.

## El tronco (común a los cuatro)

    Regla comercial            corte, mínimo, incremento o rollo
      → Cantidad facturable    lo que realmente se cobra
      → Valor estimado         facturable × precio vigente
      → ¿Hay stock y lote?
          sí / parcial  → Cotización preliminar + Datos de entrega (valor, disponibilidad y condiciones)
          parcial / no  → Valor indicativo + asesor (alternativa, espera o cantidad parcial)

Y aparte, **Muestra o asesoría**: la salida de quien no puede elegir una tela en digital. Arranca en la
Recomendación, en mitad del carril 2, sin cantidad y sin precio — la solicitud tiene que poder guardarse
sin número.

## Las dos respuestas que llegan por otro camino

- **TELA ELEGIDA** (desde la Recomendación) vuelve a entrar justo antes de «¿Conoce cantidad?»: elegir
  tela es responder la pregunta de la referencia por otra vía.
- **CANTIDAD LISTA** (desde Calcular consumo) vuelve al tronco con la cantidad resuelta.

No son bucles: son el mismo tronco con una pregunta contestada en otro sitio — el mecanismo que ya
existe (`asks` / `skips`), un nivel más arriba: **la ruta declara qué pasos existen**.

## Decisiones tomadas

- **La compuerta responde por línea.** Una solicitud puede llevar varias referencias (Lista de compra);
  una referencia sin stock no arrastra toda la lista al asesor: la salida es mixta — líneas confirmadas y
  líneas para asesor — con el valor total y su detalle por línea (decisión del dueño, 20/09).
- **Stock y lote son datos opcionales del negocio**, por referencia (cantidad disponible y lote). Sin el
  dato, la respuesta honesta es la de asesor: nunca se finge existencia.
- **La cantidad tiene origen**: declarada, calculada o rollo. El alza de desperdicio y margen solo aplica
  cuando la cantidad se CALCULA; a quien declara 22 metros no se le muestran 24.
- **Nada de esto nombra a un cliente**: los carriles son datos del catálogo de líneas, iguales para los
  tres paquetes.

## Lo que ya existe y no se toca

- La regla comercial es `Store.quantities()` tal cual (mínimo, incremento, rollo y sobrante, con sus
  razones escritas en el paso).
- La estimación es un paso de todos los motivos (`docs/journeys.md` §10) y sigue siéndolo: cuando la
  compuerta no deja vender, muestra «por confirmar» en vez de inventar cifra.
- La recomendación con IA ya solo reordena el catálogo; el carril 2 le añade lo que le falta para
  recomendar en serio (uso, desempeño y preferencias) — eso es catálogo, no motor.

## Pendiente de decidir

- La **Lista de compra** rompe el uno a uno actual solicitud ↔ tela (`state.fabric`, `fabricId`): es el
  cambio estructural de este flujo.
- El carril 3 compra «para terceros», así que abre el precio por tipo de comprador (mayorista): hoy hay
  un solo precio por tela. Queda parqueado como dato/tarifa.

## Cómo se probará

Una caminata por carril (como hoy se prueban las ocho líneas), las respuestas de la compuerta
(sí / parcial / no), la salida de muestra sin número, y una solicitud mixta — una línea confirmada y otra
a asesor — con su total y su detalle por línea.
