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
