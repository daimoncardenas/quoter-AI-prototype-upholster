# El documento de Lía: leer mientras el sistema trabaja

El dueño lo pidió el 19/09 con estas palabras:

> «Lia at this moment can have a document on her hands.. and simulate read these documents... the
> same animation when the system recommed fabric.... is white.. is simulating while the bar
> progressive and loading animation is working at the same time.... when exist response then come
> back to normal behaviour».

Traducción a criterios: **mientras hay una barra de progreso trabajando, ella sostiene una hoja
blanca y la lee; cuando llega la respuesta, la deja y vuelve a su pose**. Sin renglones, sin texto y
sin datos declarados en el papel (preguntado y respondido: «no my baby is a document on her hands..
is white»).

## Cuándo se enciende (y cuándo no)

Se enciende con los DOS momentos que tienen barra en pantalla:

| Momento | Evento | Qué se ve |
|---|---|---|
| La mirada de la foto (paso de revisión) | `LOOK_STARTED` / `LOOK_COMPLETED` | la fila «Lía está analizando tus fotografías» con su barra |
| La recomendación de telas (paso de recomendación) | `RECOMMENDATION_STARTED` / `RECOMMENDATION_COMPLETED` | la fila «Pidiéndole una recomendación a Lía» con su barra |

**No** se enciende con `ANALYSIS_STARTED` / `ANALYSIS_COMPLETED`: ese es el repaso local del paso de
revisión (1,2 s, sin barra, y sale ANTES de que la mirada empiece — el orden real es
`ANALYSIS_STARTED` → (1,2 s) → `ANALYSIS_COMPLETED` → `LOOK_STARTED` → … → `LOOK_COMPLETED`). Durante
ese repaso ella «piensa» como siempre: mira arriba y afuera (`THINKING`, la pose que ya existía).

## Cómo está hecho (three.js, sin assets nuevos)

- **La hoja** es una malla de dos planos: el papel blanco (`0xffffff`, `MeshStandardMaterial`,
  `DoubleSide`) y un filo gris claro detrás, un pelo más grande que el papel. Sobre el fondo blanco
  de la página una hoja blanca sola no se ve: el filo es lo que le da contorno.
- **Media carta** (0.16 × 0.22 m): el rig viene en metros, así que no hay que adivinar escalas. Se
  dibuja a ~20 × 28 px con la ventana a 1341 × 768 (ella mide ~300 px). Empezó siendo A4 (0.21 ×
  0.297 → 26 × 38 px) y el papel dominaba la figura: ver la tercera vuelta, más abajo.
- **Pliegue de 3 cm** en el medio (`sheetGeometry` curva los vértices y recalcula las normales): un
  plano recto se lee como un cartón pegado al cuerpo. Con 1,6 cm no se veía a ese tamaño.
- **Cuelga del Torso**, no de una mano: los brazos también cuelgan del Torso, así que el agarre no
  se desarma con el vaivén del clip. El cuerpo gira al mirar y la hoja gira con él.
- **La posición se mide CADA CUADRO** del punto medio de las dos muñecas ya posadas (más
  `gripY`/`gripZ`): la hoja sube con las manos mientras la pose se levanta y nunca queda en el aire
  si una medida cae en un mal cuadro — que es exactamente lo que pasó cuando se medía una sola vez:
  midió 1,48 m de alto porque cayó a mitad de la despedida del saludo.

### La pose

Ningún clip del rig lee (solo quedan `Idle`, `Idle_Neutral`, `Wave`, `Interact` y `Walk`), así que
la pose es procedural: rotaciones aditivas sobre lo que dejó el mixer, **después del mixer**, con los
huesos guardados y devueltos en el mismo cuadro — el mismo truco que la pose de sentarse. Se levanta
y se deja con un peso (`readWeight`, ~0,6 s) para que no salte: los brazos suben, la hoja sube con
ellos.

Ángulos finales (aditivos, ejes del mundo; se aplican en el orden de la tabla):

```
UpperArm.L  x −0.55   y −0.65      LowerArm.L  x −1.05
UpperArm.R  x −0.47   y +0.73      LowerArm.R  x −1.05
Wrist.L/R   y ±0.75   z ∓0.35      (el giro que trae la palma al papel y los dedos adelante)
dedos       cierre suave sobre x (0.22–0.32 por falange), pulgares neutros
mirada      pitch 0.30 rad (≈13°), con un barrido lento (yaw ±0.055, 3.4 s) y la respiración
hoja        w 0.16 · h 0.22 · fold 0.03 · back 0.0025 · gripY −0.02 · gripZ −0.05 · tilt 0.62
```

Medido con esa pose (ventana 1341×768): hoja 20 × 28 px, muñecas a 0.065–0.080 m del centro (los
cantos del papel a 0.080), puntas sobre la cara del papel a 0.036–0.062 m, cara a 13°.

Tres trampas, todas medidas con sondas sobre el render:

1. **El rig NO es simétrico en reposo.** Los brazos de Quaternius traen otra orientación en cada
   lado: con el mismo ángulo la mano derecha quedaba 6 cm más adelante. El lado derecho lleva su
   desvío (x −0.47) y las dos manos caen a la misma altura (±0.001 m).
2. **El orden de los ejes importa.** El giro hacia adentro (para que las manos quepan en el ancho
   del papel) tiene que aplicarse con el brazo COLGANDO; aplicado después del giro hacia adelante
   casi no mueve la mano en x (el brazo ya apunta hacia la cámara). Por eso `z` va primero y `y`
   (el ancho fino) después.
3. **Las manos van a los COSTADOS de la hoja**, a la altura de su mitad y asomando por fuera:
   a 26 px de ancho, con las manos dentro del papel o detrás de él el agarre no se lee.

## Lo que se publica (y por qué)

La pose se aplica y se DESHACE dentro del cuadro, así que desde fuera de la capa no se puede medir
nada de ella: la suite lee lo que la capa publica, medido DENTRO del cuadro.

| Atributo en `#assistantStage` | Qué es |
|---|---|
| `data-reading` | `on` / `off` (el estado, desde el arranque: «off» es una respuesta) |
| `data-sheet-px` | cuánto mide la hoja DIBUJADA, en píxeles (proyectada, con la inclinación de la cámara) |
| `data-sheet-gap` | distancia de cada muñeca al borde más próximo de la hoja, en metros (`0.03\|0.03`) |
| `data-sheet-head` | cuánto baja la cara, en grados (la mirada se deshace dentro del cuadro) |
| `data-sheet-mid` / `data-sheet-hands` | centro de la hoja y las dos muñecas, en metros, mundo |
| `data-sheet-color` | el color del papel (para que la suite compruebe que es blanco, no un PNG cualquiera) |
| `data-look-src` | qué rama ganó la mirada: `glance \| talking \| reading \| thinking \| step \| none` |

## Aceptación (lo que corre en la suite)

`tests/review.spec.mjs` (con un modelo de mentira que TARDA, para mirar la espera):

- sin nada corriendo no hay documento en las manos (ni se finge uno);
- mientras la mirada corre, ella sostiene el documento y lo lee (`data-reading=on`);
- el papel es blanco y se dibuja con tamaño de verdad (≥ 20 px de lado);
- las dos manos están en los bordes, a la misma altura y a menos de un palmo (`gap < 0.06`);
- la cara baja hacia el papel (más de 20°);
- la hoja cuelga del punto medio de las manos, no de un supuesto;
- cuando llega la respuesta, el documento se guarda y vuelve a su pose.

`tests/recommend.spec.mjs`: la espera de las telas enciende la hoja y, al llegar la recomendación,
se guarda.

## Trampas encontradas al probarlo

- **La bienvenida.** Entre el saludo y su burbuja, la capa pone `state='talking'` (ella mira al
  cliente, no al papel) y el clip `Wave` le levanta el brazo izquierdo. Si el sistema se pone a
  trabajar en ese momento, la pose de lectura cae encima del gesto y las manos quedan donde el
  gesto las dejó — medido: 0,167 m del papel en vez de 0,03. Ahora, al empezar a leer, la capa
  vuelve al reposo (`Idle_Neutral`) y la hoja se levanta limpia.
- **Los clips de gesto durante la lectura** (`Interact` al elegir tela, `Wave` al enviar) se saltan
  mientras la hoja está en las manos: el giro de cabeza de la reacción sí se hace (ella mira), pero
  no suelta el papel.
- **La API de diagnóstico** (`data-dbg-api`, `window.__aci`) sirvió para medir la pose desde la
  consola: es la forma de tocar huesos y cámaras sin inventar atributos nuevos.

## La segunda vuelta: «the hands dont catch the sheet» (mismo día)

El dueño miró la captura del navegador y fue exacto en tres cosas: «the hands dont catch the sheet..
the head is too down.. and seems postize». Las tres tenían causa y medida:

1. **«Seems pasted»: el papel no se sombreaba.** Con las luces de la escena (hemisférica 2.2 +
   direccional 2.4) CUALQUIER albedo claro satura en blanco en todas las caras: el pliegue de la
   malla existía y no se veía. Ahora el sombreado va PINTADO en una textura (`sheetTexture`: la línea
   del pliegue y las orillas, en grises que sí caen en rango visible) y el albedo es un blanco cálido
   (`SHEET_PAPER = 0xe9e6e0`, que sigue leyéndose blanco). La prueba de la suite ya no exige
   `#ffffff`: exige un blanco casi sin tinte y que se dibuje con tamaño.
2. **«The head is too down»: 0.62 rad eran ~34°.** Bajó a `pitch: 0.46` (~22° medidos con
   `data-sheet-head`), y la prueba exige entre 15° y 30°: mira el papel sin clavarlo en el pecho.
3. **«The hands dont catch the sheet»: dos causas, las dos medidas.**
   - La primera versión giraba los dedos sobre el eje VERTICAL del mundo: eso los barría hacia
     adentro y las dos manos terminaban juntas en el medio («clasped in the middle» en la siguiente
     captura). Los dedos apuntan hacia adelante (el antebrazo ya los deja así): se cierran sobre el
     eje HORIZONTAL (`FINGERS.axis = 'x'`, el mismo para las dos manos, sin espejo).
   - Las manos quedaban 1–6 cm POR FUERA de los cantos del papel (medido con una sonda que clasifica
     los píxeles del render… que además resultó poco fiable y se retiró: ver la nota de abajo). Lo
     que sí quedó como medida fiable es `data-sheet-tipsx`: hasta dónde llegan las puntas hacia el
     centro, en metros. Con las manos en los cantos las puntas caen entre 0.069 y 0.100 (el canto
     está en 0.105); si bajan de ~0.05 las manos están cruzadas en el medio y el gesto no se lee.
     La prueba lo exige: 5–9 cm la más adentro, 8–14 cm la más afuera.

**Nota de método**: la sonda que clasificaba píxeles del canvas (papel / piel / ropa) marcaba «cero
piel sobre el papel» incluso con las puntas a 1 cm del centro — el clasificador estaba mal, no la
pose. Se verificó el instrumento DESPUÉS de tres vueltas de ajuste; la lección está en la skill: una
medida que contradice la geometría conocida se calibra antes de usarla para decidir. Las medidas del
hueso (posiciones 3D publicadas por la capa) y el ojo son las que deciden.

## La tercera vuelta: «get the sheet with her dolls.. not with her hands» (mismo día)

La captura del navegador a tamaño real dejó dos cosas: la cara todavía demasiado abajo (0.46 rad ≈
22°) y el papel «agarrado con las muñecas, no con las manos». Las causas, medidas:

- **El papel era demasiado grande para la figura.** A4 a 1341×768 da 26 × 38 px y las manos de este
  rig (manoplas de ~9-10 px, con el saco llegando a la muñeca) quedaban de adorno: el papel dominaba
  la lectura. Ahora es **media carta (0.16 × 0.22 m, 20 × 28 px)**: las manos pesan y el canto cae
  donde caen las muñecas (±0.08 m).
- **La cara**: `pitch 0.46 → 0.30` (≈13° medidos con `data-sheet-head`). La banda de la prueba es
  8–30°: mira el papel sin clavar la cara.
- **El filo del papel**: era de 9 mm y con él el objeto se leía como «a small closed book/tablet»;
  quedó en 2.5 mm (un pelo que lo separa del fondo, sin canto doble).
- **Las manos**: se probaron y se midieron varias poses. Lo que quedó: muñecas a ±0.065–0.075 m
  (los cantos del papel a ±0.08), manos por delante del plano (z +0.02–0.05) y puntas sobre la cara
  del papel a 3.4–6.0 cm del centro (nunca cruzadas al medio, que es lo que deja de leerse).

**Lo que NO funcionó, para no repetirlo**: agrandar la malla de las manos un 35 % mientras lee (la
manopla crecía pero se despegaba del puño: «a separate pair of hands dangles below»). La escala del
hueso arrastra la malla pero no el saco, y el corte se ve.

**Nota de método (segunda vez)**: la sonda que clasificaba píxeles del canvas volvía a decir «cero
piel sobre el papel». El clasificador estaba bien; la medida, mal: renderizaba FUERA del cuadro, y la
pose de lectura se aplica y se deshace dentro del cuadro, así que medía los brazos colgando. La
sonda buena engancha `renderer.render` de la capa y lee el buffer JUSTO después del suyo. Regla: una
medida que contradice la geometría conocida se calibra antes de decidir con ella.

## Queda pendiente (cosmético, no bloquea)

- Las manos son manoplas de ~10 px: se leen como manos que sostienen, no como dedos que agarran
  (los dedos no llegan a envolver el canto; los pulgares no se ven por delante).
- Sin sombras de contacto (la escena no tiene mapas de sombra en ninguna parte).
- Las dos manos no están a la misma profundidad (4–5 cm de diferencia por la asimetría del rig): la
  hoja se cuelga del promedio, así que cada mano queda ~2 cm fuera del plano del papel.
