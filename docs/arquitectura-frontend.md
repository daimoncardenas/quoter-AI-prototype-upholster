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
| 2 | `src/ui/` | modal, toasts, componentes chicos del backoffice | Pendiente |
| 3 | `src/backoffice/` | una vista por archivo (puntos, vendedores, telas, ajustes, servicios, resumen, cotizaciones) | **Cerrado** (25/09: las siete vistas mudadas y probadas con gestos reales) |
| 4 | `src/wizard/` | un módulo por paso; el wizard carga `src/tenant/` y `src/ui/` | Pendiente |
| 5 | `src/assistant/` | brain, presence, voice | Pendiente |
| 6 | `src/app/` (state + events) | el núcleo; se borra el puente `window` | Pendiente |
| 7 | `src/tenant/branding.js` | el motor de marca (`Brand`) con su baile de pre-paint | Pendiente (va con el 6) |

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
