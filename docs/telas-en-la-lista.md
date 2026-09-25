# Las telas en el paso de la lista — y los datos que el asistente ya guarda

El dueño, el 24/09, después de conversar con Lía en la ruta corta («compra nueva → reventa», que
**no tiene paso de recomendación**) y ver la transcripción:

> «this conversation show that AI dont save data of customer in the interaction .... you can use local
> storage... whatever.... and aditional.. dont apply actions.... dont recommend ... but is for wizard
> dont have recommend... can you put a button in the wizard for recommed fabric... the last
> collections... and remember the assistant should have acces to fabrics..and values... and can
> calculate...»

Y en la segunda pasada, mirando el paso de «Reventa o inventario» (le faltaban dos preguntas):

> «even I can see are missing two steps... between "reventa o inventario"...and ..."que referencia y
> cuantas"...because should exist before.. "ya sabes que tipo de tela requieres" and "quiero
> sugerencias"....after that... if choose "ya sabes que tipo de tela requieres"..show the current next
> step... without button recommendation... but if choose "quiero sugerencias"...you can add another
> step like a this... [el paso de las preferencias: qué necesitas de la tela, estilo, gama de
> color]...and after that... run assistant recommendation action....»

## Lo que pasaba (los números)

- El ESTADO que recibía el modelo en cada turno (`estadoDelCotizador`) llevaba paso, línea, mueble,
  medidas, fotos, revisión, tela y estimación — **no la rama** (`ruta`/`proposito`/`saber` no estaban
  ni en `ACI.context()`). Después de decir «compra nueva… para vender», el modelo no podía verlo y lo
  volvía a preguntar: el prompt le ordena «si un dato no está ahí, no lo sabes».
- `lista` y `pedido` **no existían** como campos llenables: ni en el prompt, ni en
  `losValoresLegalesDe`, ni en `aplicarValorDelContrato`. En esa rama la lista ES lo que falta, así
  que «dos rollos» no tenía dónde entrar y el turno se quedaba en palabras.
- El prompt **no llevaba el catálogo**: el modelo no podía nombrar una tela, una colección ni un
  precio, y sus reglas le prohibían citar cifras que no fueran de la estimación.
- **La reventa no preguntaba nada**: entraba derecha a la lista. Y el asistente, en esa rama, pedía
  cosas que el recorrido no tiene (ver «El flujo viaja en el mundo», más abajo).

## Lo que hay ahora

1. **El estado lleva lo declarado.** `ACI.context()` suma `ruta`, `proposito`, `saber`, `lista`
   (referencias con su unidad y sus metros), `order` (el pedido anterior), `delivery` (cómo llega la
   tela) y `contactDeclared` (el HECHO de estar declarado, sin los valores). `estadoDelCotizador` los
   cuenta en su idioma: «Camino elegido por el cliente: «Nueva compra» → «Reventa o inventario» →
   «Sé qué tela quiero»», «Lo declarado en la lista: …», «Datos de contacto: ya declarados el nombre,
   el correo (sin autorización todavía). No los vuelvas a pedir…».
2. **El contacto sigue la regla de la casa**: los VALORES solo viajan con la autorización marcada
   (Ley 1581); sin ella viaja el hecho, que es lo que evita la repregunta. El spec lo comprueba en
   las dos direcciones.
3. **`lista` y `pedido` se llenan por los MISMOS controles** que un dedo: la referencia entra en el
   `select` de su fila (se trae la fila si no existe) y la cantidad en su campo, **en la unidad de
   ESA tela** (rollos si es de rollo completo, con el largo del rollo para los metros). El parser del
   respaldo entiende los números DICHOS —«dos rollos», «veinte metros»— además de los dígitos, y
   rechaza una referencia que no esté en el catálogo. El pedido escribe la referencia en su campo y
   corre la búsqueda de siempre.
4. **El asistente tiene el catálogo.** El prompt de la conversación lleva las telas activas —nombre ·
   colorName · colección · (última colección) · precio por metro · etiquetas— y la regla: puede citar
   el precio de catálogo y los metros que el cotizador calcule; **nunca** totales, descuentos ni
   cifras inventadas. El cerco (`assistant-fence.js`) recibe `permitidas` —los precios del catálogo—
   y deja pasar esas cifras; una inventada la sigue tumbando. Y el cerco ahora **también juzga la
   conversación** (antes solo el chat): una frase sucia no se dice, la pregunta la hace el respaldo.
   El TEMA de la respuesta es **dato, no lista**: el cerco recibe `tema` con el vocabulario del
   negocio —telas, colecciones, líneas, muebles y ciudades, armado del catálogo— y la lista de
   palabras del oficio queda como **piso genérico** (el dueño: «¿cómo así toca arreglar por palabra?»).
   Así una respuesta que habla de «Bouclé Capri · Marfil» o de «Texturas» pasa aunque no use ninguna
   palabra del piso, y una tela o una colección nueva entran solas. El piso sigue tumbando lo que no
   responde («necesito plátanos para el techo» queda marcada).
5. **La reventa pregunta qué sabe el cliente** (el catálogo, no código): el propósito declara dos
   `saberes` —**«Sé qué tela quiero»** (por defecto) y **«Quiero sugerencias»**— y cada uno decide el
   recorrido, con el mismo vocabulario de los otros caminos (los ids `ambas`/`metros` son los mismos
   que ya existían):

   | respuesta | recorrido |
   |---|---|
   | Sé qué tela quiero | la lista y el cierre — **[0, 18, 22, 23, 20, 16, 15]** |
   | Quiero sugerencias | las características, la recomendación y el cierre — **[0, 18, 22, 23, 12, 14, 16, 15]** |

   En el camino de las sugerencias la **recomendación arma la compra** (el dueño: «you can choose
   several fabrics, not only one» y «one field cantidad for fabric»): el cliente elige VARIAS telas y
   cada tarjeta elegida lleva **su campo de cantidad** —con la unidad de ESA tela: metros, o rollos si
   se vende por rollo— que escribe **SU fila** de la compra (una sola fuente: la misma lista). Soltar
   una tela se lleva su fila. Y no se pasa de ahí sin dos cosas: **alguna tela elegida** y **cantidad
   en cada tela elegida**; el aviso dice cuál falta («Dile cuánto necesitas de … para continuar»).

   Por eso el **paso de la lista no vuelve** después de la recomendación (el dueño: «after this
   step... dont show this......this step is innecessary after that»): ahí ya se declararon las
   referencias y las cantidades —el paso se salta con el mismo catálogo, `variasTelas` en el saber— y
   el cierre cotiza lo que se armó en la recomendación. La acción `recomendar-tela` (paso 14) sigue
   siendo la que ordena las telas; la cantidad la escribe el cliente, la asistente solo sugiere cuál.
6. **La vitrina del paso de la lista** (`#listaSugerir` → `#listaVitrina` → `#telasGrid`): el botón
   que el dueño pidió, para los caminos que **no respondieron ya la pregunta de la tela**. Es el
   MISMO ranking del cotizador (`Store.recommend`) con las **últimas colecciones de primeras**, la
   elegida entra en la fila que se está llenando y el paso rehace la cuenta como con cualquier
   elección a mano. El camino lo apaga con `vitrina: false` en su saber (catálogo): en reventa **no
   se ofrece** —«sé qué tela quiero» porque el cliente la sabe, y «quiero sugerencias» porque la
   sugerencia tiene su propio paso—; en «Mi servicio de tapicería · conozco la tela y cuánto
   necesito» sí, que es donde no hay ninguna otra puerta.
7. **Las últimas colecciones son DEMO.** El seed marca `novedad: true` en las telas de Texturas y
   Performance — nadie nos dio el orden real de las colecciones (está dicho en la `nota` del seed).
   El día que haya catálogo real, ese campo se llena de ahí.

## El flujo viaja en el mundo (el defecto que salió al verificar)

Verificando esto salió un defecto del contrato conversacional (`contrato.js`), no de este corte: su
`pasoEnElFlujo()` miraba el atributo `hidden` de las secciones del wizard —**que nunca se pone**: el
wizard esconde los pasos con `skippedSteps`—, así que daba por presente cualquier paso y la
conversación pedía campos que el recorrido no tiene (medido: retapizado pedía «¿quieres una compra
nueva o completar un pedido anterior?» y sus fotos no llegaban a preguntarse nunca; el progreso decía
«Vamos -4 de 7»). Ahora el mundo lleva **`flujo` = `pasosVisibles()`** y el contrato lee de ahí: un
paso que esta rama no tiene a la vista no manda. `tests/conversacion.spec.mjs` —que ya esperaba esto—
pasa entero.

## Lo que NO se toca (ausencias deliberadas)

- **El diálogo y el formulario no sobreviven a un recargo**: el estado es uno solo y vive en la
  página (como antes de este corte). Persistirlo es su propio corte, con su decisión (qué se guarda,
  dónde, y qué dice la ley de esos datos en disco).
- El ranking del paso de la RECOMENDACIÓN no cambió: la vitrina ordena lo suyo (novedad primero) sin
  tocar el motor que ya estaba.
- **La vitrina sigue existiendo en los caminos que no la respondieron** (tapicería · «conozco la tela
  y cuánto necesito»): quitarla de ahí también es decisión del dueño, no de este corte.

## Lo que lo prueba

- `tests/telas-en-la-lista.spec.mjs` (en `npm test`): las dos respuestas de la reventa y los dos
  recorridos (sin y con recomendación), la recomendación donde se eligen VARIAS telas con su campo de
  cantidad por tarjeta (y su fila en la compra), los dos avisos del paso (sin tela, y tela sin
  cantidad), que la lista no vuelve, la vitrina donde toca (botón, panel, últimas colecciones de
  primeras, la elegida en la fila) y su apagado donde no, el estado que lleva la rama y el contacto,
  el catálogo y los campos en el prompt, la lista y el pedido aplicados por el respaldo —con la tela
  de rollo encendida y sin ella—, y el cerco en las dos direcciones.
- `tests/ruta-caminos.spec.mjs`: la reventa pregunta y el sendero suma su tramo; cada respuesta deja
  su recorrido.
- Los contratos por rama (`tests/contrato-<línea>.spec.mjs`): la rama de reventa son **dos** —una por
  respuesta—, y la vitrina es un control MÁS del campo `lista` (el mismo dato, la referencia de la
  fila), así que los contratos que pasan por el paso de la lista la declaran junto a `#listRows` y el
  espejo sigue en pie.
- `tests/conversacion.spec.mjs`: la conversación sigue el flujo de la rama (el defecto de arriba).
