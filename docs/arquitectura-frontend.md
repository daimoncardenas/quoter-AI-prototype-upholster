# Arquitectura del frontend (y el camino a producción)

Este documento dice **cómo está organizado el frontend, cómo crece y en qué orden se modulariza**. Va junto
a `docs/base-de-datos.md` (la forma de los datos) y a `CLAUDE.md` (las reglas de la casa). Si algo de aquí se
cambia, se cambia AQUÍ primero.

## Decidido (dueño, 25/09)

- **No se migra de framework.** El frontend actual (JS vanilla + plantillas + generador) llega a producción.
  Next/React solo se considerará por mantenibilidad, no porque haga falta para ser multi-tenant — y no es
  ahora: hay demos.
- **Se modulariza**, de las hojas al tronco, para que el día que entre el primer cliente no tome por
  sorpresa: hoy `index.html`, `admin.html`, `store.js` y `assistant-presence.js` concentran demasiado.
- **Mongo Atlas: después de este refactor** (dueño, 25/09). El modelo ya está escrito en
  `docs/base-de-datos.md`; la base local del servidor sigue siendo la verdad mientras se refactoriza.

## Lo que ya está bien (y no se toca)

- La marca **no está hardcodeada**: el paquete (`clients/<slug>/client.json`) se convierte en variables CSS
  (`{{THEME_VARS}}`) y en datos; la UI consume variables y datos, nunca literales de un cliente.
- `shared/` es común a todos (catálogo, líneas, contratos, datos de demo) y **el pack solo aporta marca**.
- `tests/clients.spec.mjs` vigila la regla: un valor de cliente metido en el código es un fallo de suite.

## El árbol al que vamos

```
src/
  app/          state.js · events.js            (el núcleo: se modulariza AL FINAL)
  wizard/       service · furniture · measurements · preferences · validation ·
                recommendation · estimate · contact        (un módulo por paso)
  assistant/    brain.js · presence.js · voice.js
  tenant/       config.js · theme.js · branding.js · index.js
  backoffice/   quotes · catalog · sellers · settings
  ui/           modal.js · toast.js · components.js
```

## Las reglas de la transición

1. **De las hojas al tronco.** Se extrae primero lo que nadie llama (datos, tema, utilidades), y `app/state`
   queda para el final: es lo que todos tocan y moverlo antes rompe todo a la vez.
2. **Puente `window`.** Los módulos son de verdad (`import`/`export`), pero mientras el resto siga siendo
   scripts clásicos se asoman por `window` (`window.Tenant`, y así cada corte). Cuando el núcleo sea
   modular, el puente se borra y nadie más se entera.
3. **La primera pintura no se toca.** El generador escribe la marca en el `:root` y `Brand.apply()` corre en
   el `<head>` para que un ajuste del backoffice no parpadee. Ese pedazo se queda inline hasta el corte de
   `store.js`; pasarlo a módulo hoy sería introducir un parpadeo por gusto.
4. **Nada cambia de comportamiento en un corte.** Si un corte obliga a tocar más de lo previsto, se avisa
   ANTES (no se documenta después): el valor está en que cada paso deje la pantalla igual y la suite verde.
5. **Cero `if` por cliente.** Lo que cambia entre clientes vive en el paquete y se lee de `src/tenant/`.
6. **Cada corte termina con**: `npm run generate` limpio, la pantalla funcionando y la suite que cubre esa
   zona en verde.
7. **El empaquetador RECHAZA los choques de nombres** (`tools/bundle.mjs`): en un script aplanado dos
   `function conectar` de archivos distintos se pisan sin avisar (gana la última), así que el build se cae
   con el nombre y los dos archivos. Consecuencia de escribir módulos: **nada de `import * as` ni de
   alias** (`import { x as y }` deja el nombre sin declarar al aplanarse) y **los nombres públicos llevan
   el asunto del módulo** (`pintarPuntos`, `conectarPuntos`, `engancharConfirmacion`).
8. **El paquete pega los módulos en UN script** (`tools/bundle.mjs`, usado por el generador): así el
   prototipo sigue abriéndose con **doble clic** —`file://` bloquea los módulos ES— y la primera pintura
   mantiene su llamada en el `<head>`. Consecuencia que hay que respetar: **los nombres de nivel superior
   no se repiten entre archivos** (dos `const TENANT` en dos módulos son un choque al empaquetar), y los
   `import` del código son relativos (los que no lo sean se resuelven a mano).

## El orden de los cortes

| # | Corte | Qué sale de dónde | Estado |
| --- | --- | --- | --- |
| 1 | `src/tenant/` (config + theme) | La marca como dato; el generador emite `config.generated.js` y copia `src/**` al build | **Hecho** (25/09) |
| 2 | `src/ui/` | modal, toasts, componentes chicos del backoffice | **Hecho** (25/09: `modal.js` y `toast.js` con sus puertas — `window.UI`) |
| 3 | `src/backoffice/` | una vista por archivo (puntos, vendedores, telas, ajustes, servicios, resumen, cotizaciones) | **Cerrado** (25/09: las siete vistas mudadas y probadas con gestos reales) |
| 4 | `src/wizard/` | un módulo por paso; el wizard carga `src/tenant/` y `src/ui/` | **Cerrado** (25/09: compra, mueble, piezas, fotos, telas, revisión, contacto, validación y la ruta mudados) |
| 5 | `src/assistant/` | brain, presence, voice | **Cerrado** (25/09: los tres en `src/assistant/` y en el paquete de `src/`; la presencia se arranca con `Asistente.presencia.empezar()`) |
| 6 | `src/app/` (state + events) | el núcleo; se borra el puente `window` | **Cerrado** (25/09: `state.js` + `events.js` —el bus— y la puerta `window.App`; el puente del taller sigue como handoff hasta mudar las ayudas del wizard) |
| 7 | `src/tenant/branding.js` | el motor de marca (`Brand`) con su baile de pre-paint | **Hecho** (25/09, con el corte 6: `Brand` vive en el paquete; store.js queda sin él) |

## Corte 3 — lo que va quedando (25/09)

- `src/backoffice/casa.js` — **el puente de la transición, en un solo sitio**: la página pasa a cada vista,
  con `conectar…(casa)`, el almacén, los avisos, el confirm y las lecturas compartidas. Cada vista lo pide
  de aquí, así ninguna declara su propia copia (dos vistas con su propio `casa` es un choque, y el
  empaquetador lo rechaza). Cuando el núcleo sea modular, este archivo se borra.
- `src/backoffice/puntos.js` — Puntos de atención (tabla, alta, edición, borrado y el reetiquetado de las
  cotizaciones que ya llevan el nombre del punto).
- `src/backoffice/cotizaciones.js` — la lista con su detalle, la última del corte 3: tabla con búsqueda y
  filtro, visor de fotos, detalle con la tabla de piezas y la galería, estado con comentarios y CSV. El
  bloque vive dentro de `conectarCotizaciones` (sus ayudantes lo ven por closure) y la página sigue llamando
  `renderQuotes()`; el cierre global del modal pregunta por `Backoffice.cotizaciones.cerrarFoto()`.
  Lección de este corte: **las vistas se enganchan ANTES de pintar** (el primer `renderAll()` corre en el
  arranque; una vista que se pinta antes de conectarse deja su tabla vacía), y al mudar un bloque hay que
  barrer las referencias que quedan en la página (`closePhoto` seguía llamándose desde tres sitios).
- `src/backoffice/resumen.js` — El panel que agrega: los cuatro números, la dona por estado, la actividad
  reciente y el ciclo por vendedor. Respeta el gate de siempre: un vendedor solo ve lo suyo. Queda pendiente
  la otra mitad del corte de cotizaciones —`cotizaciones.js`: la tabla con búsqueda y filtro, el visor de
  fotos, el detalle con la tabla de piezas y su galería, el estado con comentarios y el CSV—, que se separó
  a propósito por ser otro asunto.
- `src/backoffice/servicios.js` — Líneas de servicio (lo que el negocio presta hoy), la tarjeta de mano
  de obra e insumos por línea (que se guarda como override de este cliente, para que regenerar el paquete
  no borre lo elegido) y Mi ACI (Core, capacidades, paquetes y el total). Va aparte de `ajustes.js` porque
  es otro asunto: allí se ajustan números, aquí se decide qué se ofrece.
- `src/backoffice/ajustes.js` — Configuraciones de cotizador: los números que mueven precios (desperdicio,
  margen, tolerancia, porcentajes de cobertura) y las listas que ve el cliente (necesidades, estilos, gamas,
  cortes de presupuesto), con las etiquetas de «escribe y Enter» y el aviso de «cambios sin guardar». El
  bloque de líneas de servicio y Mi ACI vive en la misma pantalla y se muda aparte, a propósito.
- `src/backoffice/telas.js` — Catálogo de telas: la rejilla con búsqueda y filtro, y el formulario grande
  (referencia, rollo y forma de venta, criterios de recomendación que salen de Configuraciones y la foto
  de la tela, que se reduce a ~80 KB y vive en IndexedDB).
- `src/backoffice/vendedores.js` — Vendedores y zonas: la primera vista que **lee datos de otra**
  (los puntos que cubre cada vendedor) y que **escribe en dos registros a la vez** (el vendedor y su
  cuenta de acceso).

**Verificado** (Chromium real, :3000): las dos vistas las sirve su módulo; 4 puntos y 4 vendedores en
pantalla; «Nuevo punto» propone el orden 5; «Editar vendedor» abre con sus 4 casillas de puntos (1 marcada:
la que cubre); el interruptor pausa («Pausado · sin acceso» + aviso) y al devolverlo vuelve a «Recibe
asignaciones»; `page errors: none`. Y el **doble clic** (`file://`) carga `Tenant`, `UI` y `Backoffice`
sin errores.

## Corte 1 — lo que quedó (25/09)

- `src/tenant/config.js` — la marca como dato, con nombres claros (`nombreVisible`, `nombreDeLaAsistente`,
  `namespace`, `correoRemitente`, `modoDeColor`). **Ningún valor de cliente dentro del código.**
- `src/tenant/theme.js` — los nombres canónicos de las variables del tema y su lectura/escritura en vivo
  (`leer`, `leerTodas`, `aplicar`, `restaurar`).
- `src/tenant/index.js` — la puerta `Tenant` + el puente `window.Tenant` de la transición.
- `tools/generate.mjs` — copia `src/**` al build y escribe `src/tenant/config.generated.js` con el paquete
  (marca solamente: precios, servicios y demo siguen viviendo en `shared/`).
- `admin.html` carga `src/tenant/index.js` (el wizard lo hará en su corte).

**Verificado** (Chromium real contra el `:3000`, navegador limpio): `window.Tenant` carga y devuelve
`Cardyram Digital · Cardyram · Lía · cdy.v1. · cotizaciones@cardyram.example`; el tema se lee en vivo
(`--accent #0d7d84`, `--ink #001d42`, `Inter`); la barra se ve igual; `page errors: none`; y
`tests/styles.spec.mjs` → **ALL PASS**.

## Corte 4 — lo que va quedando (25/09)

Piezas mudadas, en orden:

1. **`src/wizard/compra.js`** — las tres preguntas de la compra («¿qué necesitas?», «¿para qué?», «¿qué
   sabes del daño?»), que son una sola pantalla y comparten el pintor de la grilla. Con
   `src/wizard/casa.js` (el puente del taller, hermano del del backoffice) y `src/wizard/index.js`
   (`window.Wizard`). La página conserva las puertas `renderServiceOptions/renderPurposeOptions/
   renderSaberOptions/renderAllOptions`. Verificado con el E2E de una línea: 28 s de reloj (presupuesto
   60), COT-1046, 10 cotizaciones en el backoffice y su detalle con la tabla de piezas. Cero errores de
   página.
2. **`src/wizard/mueble.js`** — el paso del mueble: el desplegable y las REGLAS que usan el motor y la
   validación (`ponerReglasDelMueble`).
3. **`src/wizard/piezas.js`** — la lista del paso 1 (una fila por pieza con mueble, cantidad, tapices,
   medidas y fotos), la pieza en foco que llenan los pasos de abajo, las fichas del paso de medidas y
   las fotos/etiqueta de cada pieza. La página conserva once puertas (`piezaEnFoco`, `pintarPiezas`,
   `pintarMedidasPorPieza`, `enfocarPieza`…).
4. **`src/wizard/fotos.js`** — la tubería de la subida: leer el archivo con sus dimensiones reales,
   medir la nitidez UNA vez al cargar, marcar cada foto con su PIEZA y refrescar la fila; con sus
   oídos (el botón del bloque, el «+» de cada fila y el arrastre). La tubería es UNA: el bloque del
   paso, la fila y el componente de fotos de la conversación la comparten por las puertas
   `photoLimits/renderPhotos/loadPhotos`. El UMBRAL de la nitidez (`NITIDEZ_MINIMA`) se quedó en la
   página: quien lo lee es la revisión, hasta su corte.
5. **`src/wizard/telas.js`** — la parrilla de la recomendación (mejor coincidencia, el porqué, el
   sobre-presupuesto y la cantidad por tela del camino de varias) y la espera del asistente que las
   ordena. La página conserva las puertas `renderFabrics/recomendarConIA/telasEnEspera`, más
   `olvidarLaRecomendacion()` (el reinicio de línea ya no toca los `let` del módulo). **`ordenDeLaIA`,
   `recomendandoIA` y `TOPE_RECOMENDACION_MS` viven a nivel del módulo**: las specs del área los
   escriben por `evaluate` y en una closure dejarían de existir.
6. **`src/wizard/revision.js`** — las filas declaradas, el resumen del paso («Esto es lo que vamos a
   revisar»), las medidas raras, el repaso (`runReview`) y la revisión de la FOTO —la mirada del
   modelo, con su espera en `#visionNote`, la sonda de un píxel y los eventos `LOOK_*`— más el botón
   «Revisar mi información». La página conserva las puertas `renderReviewSummary/runReview/
   declaredRows`; `mirandoFoto` vive a nivel del módulo (validStep y las specs lo leen por `evaluate`).
7. **`src/wizard/contacto.js`** — la atención declarada (ciudad del cliente, la del servicio y la SEDE
   por id, con sus «Otra ciudad…») y la tarjeta del resumen del último paso (mueble, medidas, tela o
   lista, consumo, metros, daños y precio). La página conserva las puertas
   `atencionDeclarada/renderCities/updateSummary`.
8. **`src/wizard/validacion.js`** — el motor de validación: qué le falta a cada paso y por qué
   «Continuar» no avanza, con una frase por tropiezo (nada de burbujas del navegador), el foco puesto
   y el cinturón de la mirada (`estasMirando()`, prestada por `revision.js`). La página conserva la
   puerta `validStep` («Continuar» la llama; las specs, por `evaluate`).
9. **El paso de la ruta** — `renderRouteOptions` («¿para qué?» del mantenimiento) se fue con sus
   hermanas a `src/wizard/compra.js`: un camino puede MANDAR A OTRA LÍNEA (la reparación no se
   re-cotiza dentro de mantenimiento) y su elección rehace la estimación y el sendero. La página
   conserva la puerta `renderRouteOptions`.

**Verificado** con el E2E de una línea (25/09, por pieza): `npm run generate` limpio (25 módulos, sin
choques), retapizado cierra **COT-1050…COT-1057 con DOS piezas** — 035 s de reloj la corrida más
rápida de la tanda, 063 la más lenta (la latencia de la API del asistente, no el corte; presupuesto
60)—, el backoffice abre el detalle con su tabla de piezas y cero errores de página. Y por `file://`:
la revisión pinta su resumen y corre su repaso; el contacto pinta los desplegables de ciudades y
«Otra ciudad…» declara su texto; el motor de validación bloquea el paso sin línea, bloquea los daños
sin marcar (con el aviso del `damageError`, que era un id-global), y el paso de la ruta pinta sus
caminos («Nueva compra» / «Completar pedido anterior» para suministro y mantenimiento) y elegir uno
lo deja escrito y en pantalla; `validStep()`, `runReview()`, `declaredRows()`,
`renderReviewSummary()` y `updateSummary()` se llaman por `evaluate`, y los `let` de los módulos
(`ordenDeLaIA`, `recomendandoIA`, `TOPE_RECOMENDACION_MS`, `mirandoFoto`) se leen y se escriben — el
trato de las specs.

**Corte 4 CERRADO (25/09).** Lo que sigue: el corte 5 (asistente: `brain.js`, `presence.js`,
`voice.js`) y el corte 6 (núcleo: estado y eventos, al final y a propósito).

### Lecciones de este corte (para no repetirlas)

- **Las vistas se enganchan ANTES de pintar.** El arranque pinta una vez; una vista que se pinta antes de
  conectarse deja su tabla (o su paso) en blanco. En el backoffice quedó un solo `conectarLasVistas()`.
- **Al mudar un bloque hay que barrer las referencias que quedan en la página.** `closePhoto` seguía
  llamándose desde tres sitios del cierre global; ahora la página pregunta al módulo.
- **El puente se llena al FINAL del script de la página**, no donde estaba el estado: expone nombres
  (`ACI`) que se declaran más abajo y el objeto los tocaría en su zona muerta temporal.
- **Los `let` del puente viajan como función.** `furnitureRules` es un `let` que el módulo del mueble
  reasigna; el puente lo expone `reglasDelMueble:()=>furnitureRules`. Copiado por valor, el módulo
  leería las reglas viejas desde el primer cambio de mueble.
- **Inventario del puente ANTES de cortar.** Al mudar un bloque, `grep` los nombres que usa: los que
  viven en la página (`esc`, `renderFurnitureOptions`, `renderQuantityOptions`, `selectFurniture`,
  `renderPhotos`…) son entradas del puente, y cada una que falte revienta en el primer gesto — no en el
  build, que solo ve choques y sintaxis.
- **El IIFE que enganchaba sus oídos al leer el archivo se va con el bloque**: los listeners de la
  lista y de las fichas ahora corren en `conectarLasPiezas()`, antes del primer pintado, como las
  demás vistas.
- **Un corte se lleva DEFINICIONES que la página sigue leyendo.** `NITIDEZ_MINIMA` viajó con el bloque
  de las fotos y `runReview` —que se queda hasta su corte— la leía: la primera corrida del E2E lo cazó
  («NITIDEZ_MINIMA is not defined» — el E2E imprime `errores de página`, no falla por ellos). El
  umbral volvió a la página, junto a su comentario. Al cortar, `grep` de los nombres del bloque
  BUSCANDO su definición (`const|let|function`), no solo sus menciones.
- **Los `let` que las specs escriben no pueden ir en la closure.** `ordenDeLaIA`, `recomendandoIA` y
  `TOPE_RECOMENDACION_MS` se quedan A NIVEL DEL MÓDULO (los scripts clásicos comparten el ámbito
  global léxico): dentro de `conectar…()` la spec que baja el tope a 300 ms dejaría de verlos. Y los
  nombres de las puertas no se repiten entre página y módulo: una `function` repetida se pisa en
  silencio (el chequeo del build solo mira choques DENTRO de `src/`). Lo mismo con `mirandoFoto`, que
  `validStep` y `review.spec` leen por `evaluate` (la validación lo pide prestado con `estasMirando()`).
- **El navegador nombra los id: `damageError` no era una constante.** `validStep` lo usaba suelto y ni
  en `index.html` ni en `src/` había definición: era el id-global del navegador. Al mudarlo, el puente
  lo resuelve UNA vez (`damageError:document.getElementById('damageError')`) — un módulo no se apoya
  en el id-global implícito. Antes de cortar: un nombre sin `const|let|function` es un id-global.
- **Un bloque puede venir en TRES tramos con una isla compartida en medio.** La mirada y el repaso
  tenían entre ellos los `const` del asistente (`asistenteCfg/asistenteNombre/etiquetaIA`), que son
  de todos: se corta por anclas parciales y la isla se queda en la página; las anclas de arranque y
  de cierre se afirman UNA por UNA (el blanco que no está donde uno cree es la falla más común).
- **El chequeo de choques del empaquetador ve `src/`, no la página.** `TENANT` estaba declarada en el
  paquete y otra vez en `index.html`: los `const` de nivel superior comparten ámbito entre scripts y la
  página deja de correr («Identifier 'TENANT' has already been declared»). Se borró la vieja.
  **Pendiente**: extender ese chequeo a los scripts de las páginas.

## Corte 5 — el asistente (25/09) · **CERRADO**

El asistente entero vive en `src/assistant/` y viaja en el paquete de `src/` (un solo script):

1. **`src/assistant/voice.js`** — el micrófono, su eco (¿lo dictado son SUS palabras?), su voz
   (`speechSynthesis`, Colombia primero) y el silencio; con los oídos del botón del micrófono y el del
   sonido. `vozAudio` vive a nivel del MÓDULO (voz.spec lo lee y lo escribe por `evaluate`, como
   `mirandoFoto`). La página conserva las puertas `encenderElMicrofono/apagarElMicrofono/hablarConSuVoz`.
2. **`src/assistant/brain.js`** — el cerebro simulado, que era `assistant-brain.js` de la raíz
   incrustado por el generador: ahora viaja en el paquete y sigue cargándose desde Node
   (`tests/assistant-brain.spec.mjs` y `evaluacion-retapizado.spec.mjs` lo requieren por su ruta nueva).
3. **`src/assistant/presence.js`** — la cara (Lía/Tomás, el sillón, Rapier), la barra y los pulsos de
   voz; era `assistant-presence.js` de la raíz, un `<script type="module">` aparte de 2.140 líneas.
   Ahora es `empezarLaPresencia()` —async: espera el `load`, como el módulo— y la página la arranca al
   final con `Asistente.presencia.empezar()`.

**Verificado**: `npm run generate` limpio (29 módulos, sin choques); retapizado cierra **COT-1058…
COT-1060** (025 s la última; presupuesto 60) con cero errores de página; `tests/voz.spec.mjs` →
**ALL PASS**; y por `file://` la presencia COLOCA (three.js y Rapier desde el CDN,
`data-look-src="talking"`, `data-phys="rapier"`, la zona `assistantHit` viva). Captura:
`generated/muestra-25-09-presencia.png`.

### Lecciones de este corte (para no repetirlas)

- **El empaquetador no conocía `export async function`.** La presencia se envuelve en una `async`
  (por su `await ready`) y el `export` quedaba sin pelar: «Unexpected token 'export'» en el paquete.
  `tools/bundle.mjs` ahora pela `export (async)? const/let/var/function/class` y el chequeo de choques
  cuenta el nombre igual.
- **Envolver un módulo en una función no es gratis: su `await` de nivel superior deja de ser legal.**
  `assistant-presence.js` esperaba el `load` con un `await ready;` suelto (válido en un módulo ES). El
  envoltorio va `async` y la página lo arranca sin esperar, con un `.catch` que avisa en consola.
- **`tools/dev.mjs` no vigilaba `src/`.** El pie prometía «save a change and the browser reloads», pero
  guardar un módulo no regeneraba nada: ahora `src/` está en el ojo del dev server.
- **Hallazgo (no de este corte): `tests/assistant.spec.mjs` está rojo desde `fd97222`.** El dueño
  reemplazó el CTA del sidebar («Pregúntale a Lía» → «Conversar con Lía») y el spec quedó anclado a
  `.chat-fab` / `.help-card [data-open-chat]` (líneas 90/91/245/514): revienta en su primer `wizard()`
  con «Cannot read properties of null». Queda como está: el dueño decide si se actualiza o se retira a
  favor de las specs de la conversación.

## Corte 6 — el núcleo (25/09) · **CERRADO**

Lo último, a propósito: el estado y el bus, que sostienen todo lo demás.

1. **`src/app/state.js`** — el estado del cotizador (`state`) y su mueble inicial (`FURNITURE_INICIAL`).
   El paquete comparte ámbito con la página: `state.step` se sigue leyendo por su nombre en la página,
   en los módulos y en las specs.
2. **`src/app/events.js`** — el bus del asistente (ACI): los eventos `aci:event`, `context()`, `env()`,
   `execute()` y `isTyping()`. Se arma con `conectarElBus(puente)` —lo llama el arranque—, queda en
   `window.ACI` y en el puente (`C.ACI`); la página lo lee por su nombre (`ACI.emit(...)`).
3. **`src/tenant/branding.js`** — el motor de marca (`Brand.apply`, con su baile de pre-paint) salió de
   `store.js` (que quedó 146 líneas más flaco) y viaja en el paquete; los valores por defecto salen de
   `Store.brandDefaults()` y las reglas de color chicas se espejan con store.js (nota en el archivo).
4. La puerta nueva es **`window.App`** (`App.eventos.conectar`), y el arranque va ordenado: PRIMERO el
   bus, DESPUÉS los módulos de src/ y al final se pinta.

**Verificado**: `npm run generate` limpio (33 módulos, sin choques); el sondeo por `file://` ve el
estado, el bus publicando de verdad (`ACI.emit('PRUEBA')` → evento), el contexto armado (`SERVICE · …`)
y la marca (`Brand.apply()` no-op sin overrides), sin errores de página; retapizado cierra
**COT-1061/COT-1062** (028–059 s, presupuesto 60); `styles.spec` → ALL PASS (el motor de marca en su
sitio), `voz.spec` → ALL PASS y `conversacion-api.spec` → ALL PASS (ver el hallazgo abajo).

**Lo que falta para «borrar el puente» del todo**: `window.CotizadorPuente` sigue siendo el handoff
página↔módulos. Lo que todavía vive en la página y los módulos leen por él son las ayudas del wizard
(`showStep`, `aplicar*`, `updateEstimate`…) y los datos sueltos (reglas, presupuesto, atención…).
Borrar el puente = mudar esas ayudas a `src/wizard/` y dejar la página como cáscara: la conversación,
el envío y los oídos.

### Lecciones de este corte

- **El puente no puede llevar un objeto que todavía no existe.** El bus necesita el puente para armarse
  y el puente necesita el bus: se resuelve CONECTANDO el bus con el puente y dejándolo en él
  (`elPuente.ACI = ACI`) antes de que los módulos se conecten — el arranque ordena: bus → módulos →
  pintar.
- **Al mudar código compartido, la lista de quién usa qué decide el corte.** `each` se quedó en
  store.js porque lo usa `Assistant`; `kebab` y `BRAND_VAR_ALIASES` se fueron con Brand porque solo él
  los usaba; y `normHex`/`hexToRgb`/`rgbToHex` quedaron ESPEJADOS (los usa `Store`): si cambia la
  regla, cambian los tres (generate.mjs, store.js, branding.js).
- **Hallazgo y arreglo (`muebleOtro`)**: la reconciliación «las palabras del cliente mandan» seguía
  llamando a `elegirTarjeta('.furniture-card')` — la rejilla que el corte 4 reemplazó por los
  desplegables de la fila. `conversacion-api.spec` lo cazó (la tarjeta perdía y «Perdón - Cabecero»
  entraba al campo); ahora usa `elegirMuebleDelCatalogo`, como el caso «mueble». → ALL PASS.
- **Dos specs quedan rojos, de ANTES de este corte** (los dos describen pantallas viejas):**
  - `tests/wizard.spec.mjs` — su `reach()` llena `#width` en el paso de medidas que el corte 4 retiró
    (las medidas viven en la fila): «element is not visible»; su recorrido entero es del flujo viejo.
  - `tests/assistant.spec.mjs` — anclado al CTA «Pregúntale a Lía» que `fd97222` reemplazó por
    «Conversar con Lía» (`.chat-fab`, `.help-card [data-open-chat]`); revienta en su primer `wizard()`.
  Los dos esperan decisión del dueño: actualizarlos o retirarlos en favor de las specs nuevas.

## La base y el despliegue (25/09) · **CERRADA**

La base dejó de ser solo la de casa: hay DOS motores detrás de las mismas rutas (`tools/api.mjs` elige por
`MONGODB_URI` — SQLite sin ella, Mongo Atlas con ella) y las Netlify Functions quedaron listas
(`netlify/functions/`, `netlify.toml`). La forma del documento, lo compartido por los dos motores y lo que
todavía no resuelven viven en `docs/base-de-datos.md` (sección «El motor del prototipo»); el paso a paso
del despliegue, en `docs/despliegue-netlify.md`. Quedan pendientes la cadena de Atlas (va a `.env`, jamás
al repo) y el sitio en Netlify.

## El paquete: demo y producción son DOS salidas (decisión aparcada, 25/09)

La crítica (ChatGPT, vía el dueño): el empaquetador propio es apropiado para el demo, pero producción no
necesita la restricción de `file://` — «npm run demo → tu empaquetador» y «npm run production →
esbuild/Vite» deberían coexistir, y reglas como «nada de alias» y «nombres de nivel superior sin repetir»
son artefactos del aplanado, no requisitos de ACI. **De acuerdo en el principio**, y aquí queda escrito
para no volver a litigarlo:

- **`src/` ya es ESM de verdad** (44 `import`, 90 `export`; `tools/bundle.mjs` resuelve los imports
  relativos, los ordena y los aplana). Cambiar de empaquetador NO es reescribir 33 módulos.
- **Lo que obliga al aplanado no son los módulos: son las páginas.** `index.html` todavía lleva 3.551
  líneas de script inline (6 bloques) y `admin.html` 1.321 (3 bloques), y hay 17 llamadas en `src/` que
  entran a ese ámbito (`C.updateEstimate()`, `showStep`, `aplicar…`). Las reglas del paquete son
  consecuencia de ese ámbito compartido. Y las dos razones de la casa siguen en pie: `file://` bloquea
  los módulos ES, y la primera pintura llama en el `<head>`.
- **El precio, en orden**: (1) terminar «borrar el puente» — mudar las ayudas que quedan en la página
  (`showStep`, `aplicar*`, `updateEstimate`…) a `src/wizard/` y convertir el script de cada página en una
  ENTRADA de verdad (imports, sin ámbito compartido); (2) repuntar las specs que leen nombres de nivel
  superior por `evaluate` (`mirandoFoto`, `vozAudio`, `state`) a las puertas que ya existen (`App`,
  `Wizard.*`, `Asistente.*`); (3) entonces `npm run production` = esbuild/Vite sobre `src/` + dos
  entradas: una tarde, un archivo de configuración. El chequeo de choques deja de ser guardián y pasa a
  ser lint (o se retira).
- **Qué NO se hace ahora**: meter el segundo pipeline en el prototipo sin consumidor. El demo no lo
  necesita, y el producto no hereda este repo: `quoter-AI-product` elige su bundler desde el día uno —
  lo que cruza de aquí es `docs/base-de-datos.md` y los cortes de `src/`, no el empaquetador.
- **Mientras tanto**: se sigue escribiendo `src/` como ESM de verdad (es lo que abarata el cambio), y
  queda pendiente el hueco ya inventariado arriba: el chequeo de choques mira `src/`, no los scripts de
  las páginas (el caso `TENANT`). Con el aplanado cargando peso, ese guardián es la red — y es justo lo
  que tiene que aguantar hasta que el puente se borre.
