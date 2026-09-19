# ACI · Líneas de servicio y journeys de cotización

Borrador de trabajo (Cardyram). Objetivo: fijar **qué cotiza ACI**, **cómo se agrupa** y
**qué habilita cada plan**, antes de tocar código.

## 1. Regla de frontera

ACI cotiza lo que un catálogo no puede resolver: el resultado final depende de diagnóstico,
medidas o configuración.

- Si el precio no se puede publicar en una lista (porque depende de la pieza, del estado, de
  las medidas o de las opciones) → **ACI**.
- Si se puede vender con una referencia + "agregar al carrito" → **fuera de ACI**. Catálogo,
  inventario y checkout son otro problema y ya tienen sus herramientas. ACI **no** es una
  tienda.

ACI entrega una **cotización/estimación** (registro + PDF) y, cuando aplica, **agenda una
visita de inspección**. No cobra por el mueble del cliente final.

## 2. Nota de vocabulario: tapicería vs retapicería

Revisión de uso real (industria anglo e hispana) porque el nombre de las líneas depende de esto:

| Término | Qué nombra | No nombra |
|---|---|---|
| **Upholstery / tapicería** | El oficio y el proceso general: poner relleno, resortes, cinchas y tela o cuero a un mueble. También los materiales mismos. Aplica a muebles nuevos, reparaciones y reemplazos. | No implica que la pieza sea usada. |
| **Reupholstery / retapizado** | El mismo oficio aplicado a una **pieza existente**: se retira la tela vieja y se instala nueva; puede incluir relleno, espumas y corrección de resortes. | No es un oficio distinto ni otro material: cambia el **objeto** (existente vs nuevo). |
| **Restauración** | Además de tela y relleno, estructura: madera, ensamble, resortes, acabados. | No es "retapizado con otro nombre": agrega oficio de madera y acabados. |
| **Tapicería tradicional vs moderna** | **Técnica y materiales**: tradicional = resortes amarrados a mano, crin, yute, capas armadas a mano, más horas; moderna = espuma, resortes serpentinos, grapadora, menos capas. | No dice si la pieza es nueva o usada. |

Conclusión para el producto: **"tradicional" y "retapizado" no son lo mismo ni son
intercambiables**, porque describen ejes distintos:

1. **Objeto**: pieza existente (retapizado / restauración) vs pieza nueva (a la medida).
2. **Técnica**: tradicional (materiales naturales, a mano, más horas) vs moderna (espuma,
   serpentín, rápida).
3. **Alcance**: solo tela · tela + espuma/relleno · tela + estructura · restauración completa.

Una línea de servicio se define combinando los tres (p. ej. "Retapizado tradicional de
sillones" = existente + tradicional + tela y relleno). Ponerlas en la misma lista sin
desambiguar produce cotizaciones incomparables y precios que no se pueden defender.

En el mercado colombiano el uso es más laxo: muchos talleres anuncian "tapizado",
"retapizado" y "restauración" como si fueran lo mismo. Para cotizar hay que **elegir y
sostener** una convención: la de esta tabla.

## 3. Journeys (arquetipos)

Solo tres; doce servicios caben dentro de ellos como alcance u opción.

1. **Pieza existente** — retapizado, cambio de tela, espuma/relleno, reparación, restauración,
   limpieza. Cambia el **alcance**, no el camino.
   Campos: tipo de mueble · fotos (3–7) · medidas aproximadas · puestos/cojines · estado
   actual · uso y estilo · tela + técnica deseada · punto de atención.
   Fórmula: mano de obra + tela (m² × precio) + espuma/rellenos + reparaciones + transporte.
   **Estado: implementado en su primera parte.** La estimación reparte tela, mano de obra (% del
   material, `laborPct` por línea) y, en reparación, los daños marcados uno por uno (`damageItems`).
   Espuma/rellenos y transporte todavía no entran en el número: son las dos piezas que faltan de
   esta fórmula, y no se disimulan con un porcentaje más.
2. **A la medida** — mueble nuevo a especificación y personalización de un modelo (tela,
   patas, dimensiones, acabados). Sin catálogo propio: la base es la referencia del cliente o
   su propia pieza, y ACI cotiza el **delta**.
   Campos: tipo · dimensiones · configuración (puestos/módulos) · estilo · materiales ·
   acabados · color · uso previsto · cantidad · imágenes de referencia.
   Fórmula: estructura + materiales + tapizado + acabados + fabricación + entrega.
3. **Proyecto comercial** — restaurantes, hoteles, oficinas, locales.
   Campos: tipo de negocio · ubicación · cantidades · planos o fotos · fecha esperada ·
   instalación. Salida: **propuesta**, no precio de lista.
   Fórmula: (unidad × cantidad) + instalación + logística.

**Adicionales** (líneas de la cotización, no journeys): transporte/recogida y entrega ·
limpieza y tratamientos de protección · instalación.

**Confirmación humana, no excepciones**: **todo** servicio se cotiza. ACI produce siempre una
**pre-cotización** — el nombre del artefacto: una estimación que todavía no es la cotización
oficial. Lo que nunca ocurre es que salga sin que una persona la revise y confirme. Ese es el
ciclo que ya existe en la cotización: ACI la deja en `Nueva` / `En gestión`, el taller la
revisa (puede ajustar el valor y comentarla) y al pasarla a `Cotizada` queda confirmada para
enviar al cliente. Si la pieza tiene daño estructural, no se devuelve un "no se puede cotizar":
se cotiza, y la revisión humana es donde el número se corrige.

**El asistente no fija precios** (invariante): calcula el motor, revisa una persona, decide el
cliente. Nadie del lado automatizado inventa dinero — pero tampoco se esconde: siempre hay
un número que revisar.

## 3.1 Catálogo de líneas (lo que un cliente habilita)

La **línea** es lo que el cliente pide: objeto + alcance. La **técnica** (tradicional /
moderna) no es una línea: es una opción dentro de la línea, porque cambia la tarifa, no el
camino (ver 3.2).

| # | Línea (etiqueta) | Journey | Alcance | Notas |
|---|---|---|---|---|
| 1 | Retapizado de muebles | existente | tela + espuma/relleno (+estructura si el taller la hace) | La línea base de todo taller. Precio = mano de obra + tela + espuma + reparaciones. |
| 2 | Suministro de tela (por metro) | suministro | tela | La línea del distribuidor (caso Mediterránea). Es el cotizador actual, sin selector. |
| 3 | Cambio de tela | existente | solo cubierta | Barata y rápida; obliga a declarar que la estructura está sana. |
| 4 | Reparación y restauración | existente | + estructura y acabados | La línea donde la revisión humana pesa más; el motor cotiza igual. |
| 5 | Muebles a la medida (y personalización) | nueva | mueble completo o delta sobre un modelo | La base es la referencia del cliente, no un catálogo. |
| 6 | Proyecto comercial | proyecto | cantidades + instalación | Salida: propuesta. Solo plan superior. |

Los servicios del mercado caben aquí sin una línea por cada uno: limpieza y tratamientos son
**alcance**; transporte e instalación son líneas de la cotización.

## 3.2 La técnica es una opción, no una línea

Tradicional (resortes amarrados a mano, crin, yute, capas armadas) y moderna (espuma,
serpentín, grapadora) son la **misma** línea con distinta tarifa y distinto tiempo:

- Se pide como **opción dentro de la línea** ("Técnica: tradicional / moderna"), un solo campo
  que alimenta la tarifa. Si el taller solo hace una, la opción **no se pregunta** (misma regla
  que el paso 1: no preguntar lo que tiene una sola respuesta).
- Como línea propia crearía un menú falso: "Retapizado" y "Tapicería tradicional" aplicarían al
  mismo objeto y el cliente no podría comparar dos cotizaciones.
- El **marketing** puede seguir diciendo "tapicería tradicional" en la web del taller: la
  taxonomía del cotizador es para cotizar, no para vender la marca.

Por eso el plan Essential, con una sola línea, es "Retapizado de muebles" y la técnica
tradicional entra como opción por defecto — no como la línea misma.

## 4. Planes → líneas habilitadas

> **Nota (v2 propuesta, sin aprobar):** este modelo está en revisión — ver
> [`paquetes-y-precios.md`](paquetes-y-precios.md), donde los planes pasan a ser **paquetes
> recomendados** y el cliente **arma su ACI** con casillas. Nada de lo de aquí abajo se toca hasta
> que el dueño apruebe el v2.

Los planes actuales (Essential 299k/año, Professional 699k/año, Business 1.29M/año) **ya
venden esto** en su copy: Essential promete "una categoría de servicio", Professional "varias
categorías de servicio configurables". Esta tabla lo vuelve real:

| Plan | Líneas | Paso de la línea |
|---|---|---|
| **Essential** | 1 línea, la que el taller elija (#1 para un taller, #2 para un distribuidor) | No existe |
| **Professional** | hasta 4: #1 · #3 · #4 · #5 · #6, configurables | Sí, si hay ≥2 |
| **Business** | todas, incluidas #7 proyecto comercial | Sí, si hay ≥2 |

Reglas:

- La lista efectiva es `líneas del paquete ∩ líneas del plan`, con una sola fuente de verdad
  (como `effectiveLimits`). Un cambio de plan hacia abajo **oculta** líneas sin borrar su
  configuración: al volver a subir, reaparecen.
- **El negocio prende y apaga sus líneas**: `Configuraciones de cotizador` → "Líneas de servicio"
  lista las líneas del plan con un checkbox (`Store.setLineEnabled`). Apagada, sale del cotizador
  sin borrar nada; arriba del plan, el checkbox llega bloqueado con el plan que la habilita.
  Nunca queda en cero: apagar la última se rechaza — una solicitud sin línea no se puede cotizar.
- Con **una sola línea** habilitada el cotizador no pregunta «¿qué quieres hacer?»: entra directo
  a ella (el paso de la línea no existe, ni en el flujo ni en el stepper) y la cotización la
  guarda igual.
- **La línea también decide los pasos y el precio.** Cada línea declara `laborPct` (la mano de obra
  como porcentaje del material) y `asks` (lo que pregunta de más). Hoy: suministro cotiza **solo
  material**; retapizado (60%) y cambio de tela (45%) suman mano de obra; y **reparación** (60% +
  `asks:["danos"]`) abre un paso propio —«¿Qué hay que reparar?»— donde se marcan los daños, cada
  uno con su valor (`damageItems`), y el total los suma. La estimación deja de ser el material con
  una nota al pie: el bloque de precio muestra material, mano de obra, reparaciones y total.
- **Los pasos opcionales se cuentan, no se numeran a mano**: `skippedSteps` reúne los que no
  existen (el 0 sin más de una línea, el 2 sin daños) y `showStep()` numera sobre los visibles, así
  que el flujo va de 6 a 8 pasos según la línea sin tocar ninguna cuenta en otro sitio.
- Cada línea declara su `minPlan`. Un paquete **no puede** quedar sin líneas en Essential: la
  validación del paquete falla en voz alta (misma política que `validateAssistant`).
- El backoffice muestra qué líneas están activas por plan y cuáles se pueden habilitar
  (mismo patrón de bloqueo del asistente en Essential, con "Ver planes").
- La página Upgrade puede listar las líneas de cada plan: el copy deja de ser una promesa.

## 5. El paso de la línea (condicional)

El primer paso ("¿Qué quieres hacer?") **solo existe si hay más de una línea habilitada**, y
cuando existe es un **paso propio**, no un bloque dentro de otro.

- 1 línea → el paso no existe: ni en el flujo, ni en el stepper, ni en la numeración. El
  cotizador entra derecho al paso 1 y el cliente ve los seis pasos de siempre; la cotización
  guarda igual la línea.
- ≥2 líneas → el cotizador tiene **siete** pasos: el primero es la línea (una tarjeta por
  línea, con su nombre y su recorrido) y los seis de siempre corren una posición. Cada
  respuesta activa su journey. La numeración visible se calcula, nunca se escribe a mano
  (`applyServiceStep()` renumera el stepper; `showStep()` el indicador de progreso).
- La regla de fondo es la misma que la del resto del flujo: **cada paso existe para aliviar la
  carga de información, no para embutir dos preguntas en uno**. Por eso la línea no se mezcla
  con el mueble: se pregunta, se responde y se pasa.
- La cotización guarda `service` (línea + journey); el backoffice filtra, busca y muestra por
  línea, y "Configuraciones de cotizador" lista las líneas del paquete con el plan de cada una.
- En el asistente simulado la línea es el paso `SERVICE` (`assistant-brain.js` → `STEPS`), y su
  copy nombra los pasos por **nombre**, nunca por número: con siete pasos, "paso 3" dejaría de
  ser Preferencias.

## 6. Invariantes (no cambian)

- El asistente **nunca** fija precio, estimado, metros, tela, estado, ni datos de contacto:
  explica, propone ediciones validadas y navega. Vale para **todos** los journeys.
- El catálogo cerrado de campos del asistente es por journey; lo que no está listado, no
  existe para él.
- **El cotizador no avanza con una medida MUY fuera de lo habitual para el mueble.** El rango es el
  mismo que el paso 4 revisa y que el asistente cita (`ranges` del catálogo de muebles), y con
  margen: una medida tomada a ojo es aproximada, así que solo detiene «Continuar» —en el paso de
  Medidas, con el número y el rango a la vista— lo que se aleja más de un 20 % del rango. El aviso
  de la asistente sigue saliendo en el borde mismo de lo habitual, y sigue siendo aviso, no una
  acción. Antes la IA avisaba y el cliente podía seguir con el dato absurdo (palabras de Daimon:
  «even if the AI warn for the wrong.. the user still could send trash... please protect the inputs
  too ... and block the button "continuar"..until the user modified and fix that»), y él mismo
  afinó la regla después: «but can be average measures... dont necesary strict measures».
- **Una línea no implementada sí se muestra**, porque la coherencia del plan es lo que se evalúa:
  subir de Professional a Business tiene que **agregar** un servicio al primer paso del cotizador
  (regla de Daimon: "si yo cambio de professional a business plan entonces por lógica deben
  agregarse servicios al primer paso de ACI"). Ocultarla por journey sin construir dejaba el paso
  1 idéntico en los dos planes — el plan cambiaba y el cotizador no. El recorrido de una línea
  nueva es el flujo compartido; lo que falta es su tarifa propia, y eso es trabajo por hacer, no
  motivo para esconder el servicio.

## 7. Fuera de alcance (explícito)

Catálogo de producto terminado · inventario · carrito y checkout · pagos del cliente final ·
facturación electrónica · logística propia. Nada de eso entra en ACI.

## 8. Pendiente de confirmar con el cliente

1. Quién **confirma** la cotización (dueño o vendedor) y si hay un tiempo objetivo de respuesta;
   el ciclo `Nueva → En gestión → Cotizada` ya lo soporta.
2. Tres o cuatro anclas de precio (mano de obra, espuma por densidad, tela, transporte por
   zona) para que la demo no muestre números decorativos.
3. Si la técnica tradicional se ofrece **siempre** o solo en ciertas líneas (define si la opción
   se muestra, se oculta o trae mínimo de horas).

## 9. Los motivos que faltan — primera versión implementada

Hoy un solo camino —«elijo tela para una pieza que ya existe»— recorría los ocho motivos. Los
cuatro que faltaban no eran variantes de ese camino: cambian **qué se pregunta, qué se suma y qué
se enseña al final**. Lo de abajo sale de cómo cotiza el oficio (fuentes en §9.6) y respeta las dos
reglas de la casa: una pregunta por paso, y **no preguntar lo que no se usa** (igual de importante
que no embutir: si el precio no lo lee, no se pregunta).

**Estado**: los cuatro están implementados como primera versión (pasos, precio y saltos, con las
tarifas demo del catálogo sujetas a las anclas de §8.2). Pendiente: la estimación como paso propio
para los motivos que se saltan la recomendación —hoy su total se ve en el resumen final—, el mapa
de copia por motivo y unificar el paso de daños con el render de `asks`.

### 9.1 Mantenimiento y limpieza — se cotiza por PIEZA, no por tela

    Pasos      0 Motivo · 1 Tu mueble (tipo + fotos) · 2 ¿Qué necesita? · 3 Domicilio o recogida
               · 4 Validación · 5 Tu estimación · 6 Tus datos
    Pregunta 2 Limpieza profunda · Quitamanchas · Olores y mascotas · Protección (impermeabilizante)
    Estimación tarifa por pieza (según tipo/tamaño) × cantidad + los extras marcados
               (el protector suma ~30 %) + domicilio/recogida
    Modelo    `pricing: "pieza"` + una tabla de tarifas por tipo de mueble en el catálogo + `asks:["limpieza"]`
    NO se pregunta  medidas exactas (el tipo y la cantidad ya fijan el tamaño), ni tela, ni estilo:
    aquí no se elige tela, se limpia la que hay. La «Recomendación» desaparece como paso y su lugar
    lo toma la estimación.

### 9.2 Tapicería arquitectónica — se cotiza por m², no por mueble

    Pasos      0 Motivo · 1 La superficie (muro · techo · paneles sueltos) · 2 Medidas del área
               (ancho × alto) · 3 Sustrato y montaje · 4 Papel (acústico · decorativo · los dos)
               · 5 Tela · 6 Validación · 7 Tu estimación · 8 Tus datos
    Pregunta 3 Yeso · Madera · Concreto, y Fijo · Desmontable (velcro, imanes, clips)
    Pregunta 4 Absorción acústica · Decorativo · Ambos, y el módulo del panel (60×120 · 60×60 · a medida)
    Estimación m² × (material + instalación) + altura/andamio cuando el muro pasa de cierta altura
    Modelo    `pricing: "m2"` + precios por m² y por módulo en el catálogo + `asks:["superficie"]`
    NO se pregunta  profundidad (una superficie tiene dos medidas), ni cantidad de puestos, ni
    cojines: el «mueble» es el muro. La tela sigue eligiéndose, pero por m² y no por metros de rollo.

### 9.3 Muebles a la medida — se cotiza por MATERIALES + FABRICACIÓN

    Pasos      0 Motivo · 1 Tu pieza (tipo + fotos de referencia) · 2 Medidas de fabricación
               · 3 Materiales y acabados · 4 Tapizado · 5 Preferencias (uso y estilo de la tela)
               · 6 Validación · 7 Tela · 8 Tu estimación · 9 Tus datos
    Pregunta 3 Madera (pino · roble · cedro · MDF enchapado) · Acabado (barniz · laca · pintura)
               · Herrajes (bisagras · correderas · manijas)
    Pregunta 4 Espuma por firmeza (blanda · media · alta) y el acabado del tapizado
    Estimación estructura (madera por pieza) + espuma + herrajes + acabado + tela (motor de siempre)
               + fabricación (un % de los materiales, como se cobra en carpintería) + entrega
    Modelo    `pricing: "fabricacion"` + piezas/tarifas de madera y de espuma en el catálogo +
              `asks:["fabricacion"]`
    NO se pregunta  si la estructura está bien (es nueva), ni daños, ni retapizado: la pieza nace.
    Las fotos dejan de ser «tu mueble» y pasan a ser referencias del estilo buscado.

### 9.4 Proyecto comercial — se cotiza por BOQ (unidades × cantidad + instalación)

    Pasos      0 Motivo · 1 El local (hotel · restaurante · oficina · local) + ciudad
               · 2 Qué piezas y cuántas (una lista que se agrega por filas) · 3 Especificaciones
               (material · acabado · tela) · 4 Instalación y entrega · 5 Fotos del espacio
               · 6 Validación · 7 Tu propuesta · 8 Tus datos
    Estimación Σ (precio unitario por tipo × cantidad) + instalación + logística y entrega
               + desmontaje de lo existente, si se pide
    Modelo    `pricing: "unidad"` + `asks:["boq"]` (la primera interacción de varias filas del wizard)
    NO se pregunta  medidas pieza por pieza (cada línea del BOQ lleva su tipo y su cantidad; las
    medidas exactas se confirman en la visita) y el artefacto se llama **propuesta**, no precio de
    lista: es la salida que el oficio usa para estos clientes, y sigue siendo una pre-cotización.

### 9.5 Lo que hay que tocar en el modelo (una sola vez, para los cuatro)

1. **El precio deja de ser uno solo.** Hoy `estimateByComponents` (metros de tela) + `lineEstimate`
   (mano de obra % + daños) cubren la pieza existente. Los cuatro motivos piden un `pricing` por
   línea: `tela` (lo de hoy), `pieza`, `m2`, `fabricacion`, `unidad` — y las tarifas viven en
   `shared/service-lines.json` como datos de producto (valores demo, sujetos a las anclas de §8.2).
2. **`asks` crece** con `limpieza`, `superficie`, `fabricacion` y `boq`. La maquinaria ya está:
   `skippedSteps` + `pasosVisibles()` numeran solos, un paso opcional más es un candado más, no un
   refactor.
3. **La copia se vuelve por motivo**: el h1 de la columna («Cotiza la tela ideal para tu mueble»),
   el texto del paso de validación (hoy habla de fotos y medidas plausibles) y el de la
   recomendación. Un mapa de textos por línea, con el de tela como base.
4. **Nada de esto toca la marca ni los datos de demo**: siguen siendo compartidos e iguales en los
   tres paquetes.

### 9.6 Fuentes (consultadas para esto)

- Limpieza por pieza y protector como extra: tabla por tipo de mueble y «protector adding 25 to
  30 %» — cleanmastercarpetcleaning.com/blog-posts/how-much-does-upholstery-cleaning-cost.
- BOQ de mobiliario para hoteles (item · área · tipo de habitación · cantidad · medidas · material
  · acabado · herrajes · tapizado · fase de entrega): volant-fitout.com/blog/hotel-furniture-procurement-guide
  y los factores de presupuesto en mingsungroup.com/hotel-furniture-budget-breakdown.html.
- Paneles tapizados por m², con instalación aparte y módulo 60×120: referencias de mercado
  (MDF/yeso $600–1,200 por m² sin instalación; instalación $250–400 por m²).
- A la medida: lista de piezas con cantidad y espesor (muebleando.com) y el manual de elaboración
  de muebles de madera (OEI) para la elección de especie y acabado.

### 9.7 Orden propuesto

`mantenimiento` → `tapicería arquitectónica` → `a la medida` → `proyecto comercial`. Los dos
primeros prueban lo que hoy no existe en ningún motivo (pieza sin tela; superficie en vez de
mueble) y son los más baratos; `a la medida` reusa el motor de telas; el BOQ es el único que pide
una interacción nueva (varias filas) y se hace al final, cuando el resto ya está probado.

## 10. La estimación es un paso, y cada motivo habla de lo suyo (P4A + P4B)

**El paso (P4B).** La estimación vivía DENTRO del paso de recomendación de telas, así que
`mantenimiento` y `proyecto comercial` —que se saltan ese paso— solo veían su precio en el resumen
final. Ahora es un paso propio (`data-step="16"`, `data-brain="ESTIMATE"`) que va después de las
preguntas del motivo y antes del contacto, y **ningún motivo se lo salta**: `SERVICE_SKIPS` no
incluye `estimate`, así que una línea que lo pidiera en `skips` no pasa la validación del catálogo.
El paso pinta el mismo número que ya calculaba el motor (`Store.lineQuote`, un solo motor para los
cinco oficios) más tres cosas que antes no existían en ninguna pantalla: **con qué se calculó**
(supuestos armados con las MISMAS entradas que se congelan en la solicitud — ver
`docs/paquetes-y-precios.md` §14), **qué falta por confirmar** (por oficio, `copy.pendingConfirm`) y
el **aviso de preliminar** (`copy.preliminaryNotice`). El bloque de precio dejó el paso de telas y
se mudó aquí, con su tarjeta oscura propia.

La barra de progreso suma una fila por motivo: los recorridos quedaron en 7, 8, 9 y 10 pasos. El
CSS tiene cubos por número de filas (`[data-rows="8|9|10"]`) y la regla es la de siempre — **la
barra no hace scroll** — medido en `tests/wizard.spec.mjs` (ocho y diez filas, `scrollHeight ===
clientHeight`, y el hueco de Lía en el mismo sitio).

**La copia (P4A).** Los textos que ve el cliente salen del catálogo, no del markup: `copyByEngine`
(`shared/service-lines.json`) trae el default completo de cada oficio y `lines[].copy` solo lo que
cambia. La clave **autoritativa es la línea**, no el journey: `pricing: 'tela'` cubre cuatro
servicios comercialmente distintos (suministro, retapizado, cambio de tela, reparación) y
`mantenimiento` comparte journey (`existente`) con tres de ellos — una copia por journey le habría
seguido diciendo «elige la tela ideal» a quien pide una limpieza. Las claves son `wizardTitle`,
`wizardIntro`, `photoTitle`, `photoInstructions`, `analysisTitle`, `estimateTitle`,
`preliminaryNotice`, `confirmationMessage`, `artifactLabel`, `stepperLabel` y `pendingConfirm`;
`Store.lineCopy(line)` las resuelve (oficio + override) y `tools/client-pack.mjs`
(`validateCopyByEngine`) exige que no quede ninguna sin resolver ni desconocida.

**El nombre del artefacto.** El nombre que el cliente lee cambia por motivo —«Precotización de
retapizado», «Estimación de mantenimiento», «Propuesta preliminar para proyecto comercial»— y
aparece en la ceja del paso de la estimación, en el paso del stepper y en la pantalla de cierre. El
**identificador del registro sigue siendo `COT-123`**: es el nombre visible el que cambia, no la
identidad ni la migración de nada.

**Dónde queda cada cosa.** El formato de la estimación (paso, supuestos, pendientes) es producto y
vive en la plantilla + el catálogo; los textos son datos del catálogo; los valores comerciales de
cada negocio (los que faltan: relleno/espuma y transporte) son **configuración del negocio** —
ver `docs/onboarding-precios.md`, que define la entrevista para obtenerlos y el esquema provisional.
La capa de conocimiento POR MOTIVO (los pares `qualification`/`expert` que Lía cargaría algún día)
está contratada y **parkeada** en `docs/lia-skills.md`: hoy nada la consume.
