# El equilibrio de los pasos: las tarjetas llenan el panel

El pedido del dueño (19/09), con sus palabras: «I can see several steps in different lines that for
example has big empty spaces without reason … you can fix with card or select that can more big.. but
with sense of aesthetics … is only design». Esto es solo diseño: no cambia ningún paso, ni el orden,
ni lo que se pregunta.

## El problema, medido

«Hueco» = espacio entre el borde inferior del último contenido pintado del paso y la barra de
acciones («← Volver / Continuar →»). Medido en el navegador del dueño a 1341×768, con el paso quieto:

| paso (motivo) | tarjetas antes | hueco antes | tarjetas ahora | hueco ahora |
|---|---|---|---|---|
| relleno (Muebles a la medida, paso 11) | 291×52 | **278 px** | 290×200 | 66 px |
| limpieza (Mantenimiento, paso 3) | 291×52 | **278 px** | 290×200 | 66 px |
| traslado (paso 4) | 291×52 | **278 px** | 290×200 | 66 px |
| superficie (Tapicería arquitectónica, paso 5) | 291×52 | **258 px** | 290×120 | 63 px |
| daños (Reparación y restauración, paso 2) | 291×52 | **216 px** | 290×78 | 82 px |
| preferencias (las cuatro líneas de tela, paso 12) | 291×52 | **216 px** | 290×57 | 19 px |
| boq (Proyecto comercial, paso 7) | — | **244 px** | — | 35 px |
| obra (paso 8) | 291×52 | **127 px** | 290×54 | 19 px |
| materiales (Muebles a la medida, paso 10) | 291×52 + select de 420 | **104 px** | 290×120 + dos select de 438 | 19 px |
| acústica (Tapicería arquitectónica, paso 6) | 291×52 | **100 px** | 290×62 | 19 px |
| tu mueble (paso 1) | — | **99 px** | — | 34 px |

El hueco que queda en el relleno (66 px) es el aire del bloque ya centrado: ~33 px arriba del título
del grupo y ~33 px abajo de las tarjetas.

## La regla

1. **Las tarjetas de opción crecen con la ventana hasta su tope.** Altura mínima
   `clamp(50px, 6.4vh, 72px)` y, cuando el panel tiene espacio, la fila se estira hasta
   `min(210px, 26vh)`: el paso del relleno pasó de una tira de 52 px a una tarjeta de 200 px de alto
   (a 768: 290×200).
2. **Lo que sobra se centra, no se acumula abajo.** El bloque del grupo —su título `h3` y sus
   tarjetas— se centra en el espacio que le toca (`justify-content: safe center`), con el mismo
   recurso que ya usaba `#serviceStep`: si el contenido es más alto que el panel, `safe` cae al
   inicio y el paso scrollea como siempre.
3. **El encabezado del paso no se estira.** La fila del `.step-heading` es `auto`; solo las demás
   filas son `1fr`. El encabezado queda pegado arriba y el aire vive alrededor del bloque, no entre
   el título y sus respuestas.
4. **Los dos selectores del paso van lado a lado.** En materiales, «Madera» y «Acabado» pasan de dos
   filas de 420 px a dos columnas de ~438 px, y el par se centra en su fila. Los campos numéricos de
   los pasos de pregunta (superficie: ancho y alto) quedan con el mismo alto que todos los demás
   campos del cotizador (`min-height: 47px`) — antes eran controles nativos diminutos.
5. **La tarjeta dice que es una elección.** Lleva su indicador a la derecha —círculo para las
   preguntas de una sola respuesta, cuadrado para las de varias— y se levanta al pasar el puntero,
   como el resto de las tarjetas del cotizador. El estado elegido sigue siendo el relleno oscuro con
   el texto en blanco, ahora con el punto marcado.
6. **El paso del mueble hace lo mismo:** su grilla se estira (tarjetas más altas, hasta 300 px) y la
   zona de fotos queda pegada a las acciones, que es donde se pulsa «Continuar».

## Dónde vive

- `index.html`, en el `<style>`: las reglas de `.chip-grid*` y el bloque `@media(min-width:651px)`
  que sigue al comentario «Los pasos que preguntan con tarjetas llenan el panel…». Los dos pasos que
  no salen del catálogo se nombran por su marca del DOM: `[data-ask]` (los pasos de pregunta de
  `asks`) e `#damageStep` (el paso de daños); el mueble y las preferencias por `data-brain`.
- Check: `tests/wizard.spec.mjs` → «LOS PASOS DE PREGUNTA REPARTEN EL PANEL…»: tarjetas de 150 px o
  más y `|aire arriba − aire abajo| ≤ 12 px`, medido a 1280×720 (el viewport de la suite) en dos
  motivos distintos.
- El truco del clic: la tarjeta se levanta con `transform` al pasar el puntero y un elemento
  transformado se pinta por encima de un hermano posicionado con `z-index:auto`; por eso el input
  invisible lleva `z-index:1` (sin él, `.check()` de Playwright falla con «span intercepta los
  eventos de puntero» y el clic deja de llegar al input).

## Lo que no se toca

- Los pasos densos (medidas, revisión, recomendación, estimación, contacto) siguen llenando el panel
  y scrolleando como antes; ahí no había hueco que repartir.
- El catálogo (`shared/service-lines.json`) y el flujo no cambian: el mismo `asks`, el mismo orden.
- Los huecos que quedan en los pasos de una sola pregunta (66 px) o de daños (82 px) son aire
  centrado y simétrico, no el hueco pegado al pie que se reportó.
- A 1280×720 el paso de preferencias sigue scrolleando unos 30 px: ya lo hacía antes de este cambio
  (450 > 418 px medidos en la versión anterior), porque ese paso tiene cuatro selectores además de
  las tarjetas.
