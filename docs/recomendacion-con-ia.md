# La recomendación de telas, con la IA local por delante

El paso de recomendación ya ordenaba las telas con reglas (`Store.recommend()`: necesidad, estilo, gama de
color y presupuesto, con sus motivos en cada tarjeta). Lo que faltaba era la voz que el dueño pidió el 19/09:

> «the AI should recommend fabric.. according and base on previous information of client»

## Qué hace

- Al **entrar** al paso —una sola vez, no en cada cambio de preferencia— `recomendarConIA()` le pide al
  modelo local que **ordene** las telas del catálogo y diga por qué la primera le viene bien.
- Lo que recibe: **lo declarado**, con las mismas filas que el cliente acaba de leer en la revisión
  (`declaredRows()`: motivo, mueble, medidas, qué se tapiza, uso previsto, estilo y color, punto de
  atención), más el **presupuesto por metro** que indicó, y el catálogo activo con id, nombre, color,
  precio por metro y etiquetas.
- Contesta en **JSON** (`{"orden": [ids], "razon": "…"}`). El orden solo puede **reordenar** el catálogo:
  los ids que no sean del catálogo se ignoran y las telas que no nombre quedan detrás, en el orden
  determinista. La «Mejor coincidencia» pasa a su primera tela.
- La razón pasa por el **cerco** con `sinTema` (una recomendación no responde a una pregunta) y con los
  precios del catálogo como `estimacion`: citar un precio que el cliente ya tiene a la vista no es inventar
  una cifra.
- La fila va marcada **«IA local»** y espera con el mismo movimiento de la mirada (aro girando + barra).

## Los tres desenlaces

| | |
|---|---|
| Recomendación limpia | la fila la muestra y la parrilla se reordena |
| El cerco la tumba, o no se pudo leer | la fila lo dice (`TEXTO_RECOMENDACION_FALLO`) y la parrilla se queda con el orden determinista |
| No hay modelo | **no se pinta nada**: el orden de siempre, sin fingir una recomendación |

Los precios de las tarjetas salen SIEMPRE del catálogo, nunca del texto del modelo.

## Dónde vive

| Pieza | Qué es |
|---|---|
| `index.html` `recomendarConIA()` / `promptDeLaRecomendacion()` / `leerLaRecomendacion()` | la recomendación y su pedido |
| `index.html` `pedidoDeTelas()` | las preferencias declaradas, única fuente del orden determinista y del pedido |
| `index.html` `#aiPick` + `FILA_RECOMENDACION` | la fila, con la espera compartida de `.mirada-gira`/`.mirada-espera` |
| `index.html` `ordenDeLaIA` en `renderFabrics()` | el único poder del modelo: reordenar el catálogo |
| `tests/recommend.spec.mjs` | sección «LA IA LOCAL RECOMIENDA…» (8 comprobaciones, con el cerco y sin modelo) |

## Lo que queda abierto

- El modelo ordena y explica; **no elige por el cliente**: la selección sigue siendo suya (y una elección
  manual manda sobre la sugerencia, como antes).
- Si el cliente cambia sus preferencias, el paso no vuelve a pedir recomendación (se pide al entrar). Volver
  a preguntar sería un modelo llamando por cada clic; el día que importe, se pide al salir y volver a entrar.
