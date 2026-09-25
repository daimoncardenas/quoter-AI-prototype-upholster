# Las piezas de la cotización: una lista, no un dato

El dueño, el 25 de septiembre de 2026:

> «ahora yo veo un problema de cantidad aca... porque supongamos que es un juego de sala... o 2
> poltronas... o un sofa y una poltrona... el sistema no esta para eso y es importante»

> «osea las primeras medidas si son importantes... las del mueble completo... pero si selecciona las
> otras opciones... no solo debe tener las del mueble...sino las de la parte especifica del daño... esas
> medidas dependen de esa cotizacion... incluso... daria dos valores a la cotizacion porque el tapicero
> podra determinar si es mejor cambiar todo o solo ajustar ese pedazo... entonces la pre-cotizacion seria
> con dos valores.. por el total tapizado.. dado caso que sea necesario y por el valor especifico por si
> en realidad tiene solucion sin cambiar todo»

## La idea en una frase

Una pre-cotización es de **una o varias piezas** (un juego de sala, dos poltronas, un sofá y una
poltrona), y **cada pieza tiene lo suyo**: su mueble, su cantidad, sus medidas, su cobertura —y, cuando
la cobertura es una parte, las medidas de esa parte—. El motor suma por pieza; la pre-cotización enseña
la tabla; y cuando hay una parte, enseña **dos valores** (el tapizado completo y solo esa parte) para que
el tapicero decida.

## Lo que hay hoy (medido)

- **El estado ya es una lista**: `state.piezas` (mueble, cantidad, medidas, fotos) y `state.piezaEnFoco`;
  `state.furniture` y `#seats` quedaron como ESPEJO de la pieza en foco, que es lo que el motor y el
  sendero siguen leyendo (así nada de lo que ya funcionaba se rompió).
- **El paso 1 es la lista con desplegable**, no la rejilla de tarjetas: una fila por pieza con su mueble
  y su cantidad, `+ Agregar otra pieza`, y el ✕ para quitar. El dueño lo pidió así (25/09: «I wouldnt do
  like a this...I prefer list and dropdown for each select... because the first part is waste space»).
- **La cantidad del mueble vive en la fila** (antes era el select del paso 9): el `#seats` del paso 9
  queda oculto porque su trabajo se mudó a la lista, y sigue siendo el espejo que lee el motor.
- Cantidad del MISMO mueble: sí (1 a `maxQuantity`; 2 poltronas = 2 × la mano de obra + los metros de
  tela de ESA pieza).
- **Pendiente de la etapa 1**: las medidas por pieza caminando la lista (hoy los `#width/#height/#depth`
  siguen siendo la terna de la pieza en foco), el motor sumando por pieza, el resumen/registro con la
  tabla, y las 2 fotos por pieza con su etiqueta.
- La cobertura (`#coverage`, paso 9) existe en el contrato (`measurements.coverage`) y el motor la usa
  para elegir las piezas del corte (`store.js`: `partial` → cojines; `seats` → cojines + respaldos;
  completo → todo con estructura), pero la conversación no la pregunta (es de los valores por defecto).
- La mano de obra de Retapizado es POR MUEBLE (`labor.porMueble`) + por metro: no existe el precio de
  una parte.

## La forma de los datos (el bloque «la pieza» del contrato)
    "pieces": [
      {
        "furniture": "Sofá",              // + "note" si es «Otro»
        "quantity": 1,
        "measurements": { "width": 210, "height": 85, "depth": 90, "seats": "3", "cushions": null,
                          "coverage": "complete" },
        "part": null                      // si coverage ≠ complete: { "which": "asiento y respaldo",
                                          //   "width": …, "height": …, "depth": … }
        "photos": { "min": 2, "ids": [ … ] }   // MÍNIMO 2 FOTOS DE CADA PIEZA (dueño, 25/09:
                                               // «y minimo 2 fotos de cada uno»)
      },
      { "furniture": "Poltrona", "quantity": 2, … }
    ]

- **El estado de la página** (`state.piezas`) es la verdad; el DOM del paso 1 y del paso 9 es el EDITOR
  de la pieza en foco (la que se está declarando), como la lista de telas: una fila por referencia.
- **El motor** suma por pieza: mano de obra `porMueble[mueble]` × cantidad + `perMeter` × metros de ESA
  pieza (los metros salen de sus medidas y su cobertura), más los insumos de esa pieza.
- **Dos valores** cuando hay parte: el total del tapizado completo y el de solo la parte — el segundo
  necesita un precio de trabajo para la parte, que es DATO DEL DUEÑO (tabla por parte / porcentaje del
  mueble / por m² de la parte: sin ese dato, no se inventa).
- **El registro y la pre-cotización** guardan y enseñan la tabla de piezas (mueble, cantidad, medidas,
  cobertura, parte) con sus dos valores.
- **La conversación** lo escribe como todo lo demás: el modelo manda la lista (`valores.piezas`) y la
  página escribe fila por fila por los mismos controles (un solo escritor).

## Etapas (cada una con su captura y sus suites)

1. **El estado y el paso del mueble**: `state.piezas` + las filas del paso 1 (mueble + cantidad,
   agregar/quitar) + las medidas por pieza en el paso 9 (caminando la lista) + el motor sumando por
   pieza + el resumen/registro con la tabla. Las suites del wizard, del contrato y de la conversación.
2. **La cobertura como campo del contrato**: se pregunta (tres opciones) y el estado la declara.
3. **La parte y los dos valores**: sus medidas (ancho/fondo del asiento, alto del respaldo) y el segundo
   valor, con el precio de trabajo de la parte que dé el dueño.
