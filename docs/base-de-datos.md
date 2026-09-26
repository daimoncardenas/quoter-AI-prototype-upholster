# La base del cotizador (modelo para Mongo Atlas)

Este documento es **la forma de los datos** del producto. No es un adorno: es lo que hace que un cliente
nuevo sea **filas de datos y no código nuevo**, y lo que van a leer los agentes el día que haya que montar
la infraestructura multi-tenant a velocidad. Si algo de aquí se cambia, se cambia AQUÍ primero y después en
el código (nunca al revés).

## Decidido (dueño, 25/09)

- **MongoDB Atlas**, no SQL relacional: **sin migraciones** que mantener ni riesgos en producción, cluster
  administrado que **escala sin montar Kubernetes**, y **base vectorial incluida** (Atlas Vector Search)
  para lo que viene (sugerir tela por foto o por texto).
- **Multi-tenant de colecciones compartidas**: todos los clientes en las mismas colecciones, aislados por
  `tenantId` (y `brandId` cuando el cliente tiene varias marcas). No una base por cliente.
- **Pack = dato, nunca código**: marca, textos, catálogo y precios viven en documentos; un cliente nuevo es
  un `tenant` + su `brand` + sus documentos, no una rama de `if`.

## Local y producción

| Dónde | Qué guarda | Por qué |
| --- | --- | --- |
| **Local (prototipo)** | La base del servidor de desarrollo (`data/quoter.db`) y el almacén del navegador como copia | Para que el dueño **vea las pruebas de cualquiera** en su propio backoffice: los datos del prototipo son de todos, no de un navegador. Abierto como archivo (doble clic) sigue andando con la copia del navegador. |
| **Producción** | **Mongo Atlas** (mismo modelo, mismos nombres de campo) | Un cluster administrado: escala, replica y respalda sin infraestructura propia. La cadena de conexión vive en `.env`, jamás en el código. |

La capa de datos del frontend es **una sola** y se cambia de motor sin tocar las pantallas: hoy habla con la
base local, mañana con Atlas, con las mismas llamadas (`listar`, `guardar`, `borrar`). El mapeador de hoy ya
produce exactamente la forma de documento de este archivo, así que el traspaso es un export, no una
reescritura.

## Colecciones

### `tenants` — la empresa que compra ACI
```json
{ "_id": "acme", "slug": "acme", "name": "ACME Muebles", "plan": "Business",
  "status": "activo", "createdAt": "2026-09-25T00:00:00Z" }
```

### `brands` — cada marca/paquete del tenant (hoy: los packs)
```json
{ "_id": "acme.cardyram", "tenantId": "acme", "slug": "cardyram", "name": "Cardyram Digital",
  "theme": { "accent": "#2ec4b6", "mode": "light" },
  "assistant": { "name": "Lía", "tone": "cercano" },
  "senderEmail": "cotizador@acme.co", "namespaces": ["cdy.v1."] }
```

### `users` — quién entra
```json
{ "_id": "u_102", "tenantId": "acme", "email": "laura@acme.co", "name": "Laura Méndez",
  "role": "seller", "zones": ["norte"], "active": true }
```

### `servicePoints` — sedes y zonas (las ciudades del cierre salen de aquí)
```json
{ "_id": "sp_12oct", "tenantId": "acme", "brandId": "acme.cardyram",
  "city": "Bogotá", "name": "12 de Octubre", "zone": "sur", "active": true }
```

### `fabrics` — el catálogo de telas (**con el vector**)
```json
{ "_id": "f_lino_verona", "tenantId": "acme", "brandId": "acme.cardyram",
  "ref": "Lino Verona", "name": "Lino Verona · Arena", "collection": "Verona",
  "colorway": "Arena", "pricePerMeter": 89000, "widthCm": 140, "saleMode": "metro",
  "active": true, "imagePath": "data/fabrics/lino-verona.jpg",
  "embedding": [0.013, -0.221, "..."] }
```
`embedding` es lo que habilita **Atlas Vector Search**: «telas parecidas a esta foto» o «una tela como la
que describió el cliente» pasan a ser una consulta, no una integración aparte.

### `furniture` — los muebles y su consumo
```json
{ "_id": "m_sofaL", "tenantId": "acme", "brandId": "acme.cardyram",
  "slug": "sofa-l", "label": "Sofá en L", "units": "puesto",
  "measures": { "min": [200, 55, 70], "max": [420, 120, 200] },
  "metersPerUnit": [18, 24], "scaleByQty": false, "active": true }
```

### `settings` — un documento por marca (no una fila por clave)
```json
{ "_id": "acme.cardyram", "tenantId": "acme", "brandId": "acme.cardyram",
  "coverageSeats": [68, 70], "coveragePartial": [45, 50], "maxPhotos": 7, "minPhotos": 3,
  "autoAssignByZone": true, "assistant": { "enabled": true } }
```

### `quotes` — la solicitud completa, EMBEBIDA
Una cotización es **un documento**: sus piezas y sus fotos van dentro, así que se lee entera de un golpe
—sin joins— y guardar es un solo upsert. Las referencias (`servicePointId`, `sellerId`, `fabricId`) son ids
a otras colecciones.

```json
{
  "_id": "COT-1043",
  "tenantId": "acme", "brandId": "acme.cardyram",
  "date": "2026-09-25", "status": "Nueva", "source": "cotizador",
  "service": { "id": "retapizado", "label": "Retapizado de muebles", "journey": "existente" },
  "customer": { "name": "Cliente E2E", "email": "e2e@example.com", "phone": "3001112233" },
  "city": "Bogotá · 12 de Octubre",
  "servicePointId": "sp_12oct", "sellerId": "u_102", "fabricId": "f_lino_verona",
  "estimate": { "lo": 3927500, "hi": 5405000 },
  "meters": { "lo": 39, "hi": 56 },
  "notes": null,
  "pieces": [
    { "idx": 1, "furnitureId": "m_sofaL", "furnitureLabel": "Sofá en L", "quantity": 1,
      "coverage": "complete", "measures": { "width": 260, "height": 85, "depth": 170 },
      "photosCount": 2, "meters": [27, 32], "value": [2899500, 3786000] },
    { "idx": 2, "furnitureId": "m_poltrona", "furnitureLabel": "Poltrona", "quantity": 2,
      "coverage": "seats", "measures": { "width": 95, "height": 95, "depth": 85 },
      "photosCount": 2, "meters": [12, 24], "value": [1028000, 1619000] }
  ],
  "photos": [
    { "pieceIdx": 1, "slot": 1, "path": "data/photos/cdy.v1./COT-1043/01.png",
      "width": 1200, "height": 900, "bytes": 240123 }
  ],
  "createdAt": "2026-09-25T13:04:00Z", "updatedAt": "2026-09-25T13:04:00Z"
}
```

## Reglas (para que nadie tenga que adivinar)

1. **Todo documento de datos lleva `tenantId`** (+ `brandId` donde el cliente tenga varias marcas). Toda
   consulta filtra por ahí: ese es el aislamiento, sin base por cliente.
2. **Los índices empiezan por `tenantId`**: `{tenantId:1, brandId:1, date:-1}`, `{tenantId:1, status:1}`,
   `{tenantId:1, brandId:1, ref:1}` único en `fabrics`, `{tenantId:1, email:1}` único en `users`.
3. **Vector**: índice de Atlas Vector Search sobre `fabrics.embedding` (y, cuando toque, sobre las fotos de
   las piezas). La consulta es un `$vectorSearch` que devuelve las telas parecidas: no hay servicio aparte.
4. **La cotización va embebida con sus piezas y fotos.** Lo que se lee siempre junto, se guarda junto.
5. **`source` dice de dónde salió cada cotización**: `cotizador` (cliente real), `e2e` (la prueba
   automática), `seed` (datos de demo). Así el feedback del equipo se ve y no se confunde con lo real.
6. **Sin migraciones**: un campo nuevo se escribe cuando aparece; si un dato se vuelve importante, se le da
   su lugar en la forma y se rellena desde donde estaba. Nada se borra en silencio.
7. **Validador opcional por colección** (`$jsonSchema`) para las tres reglas duras (tenant, ids, tipos). Es
   la red de seguridad que reemplaza a las migraciones: barata y sin ceremonia.
8. **Los ids de negocio son el `_id`**: `COT-####` identifica la cotización, y se numera consultando el
   máximo (nunca adivinando en el navegador).
9. **Nada de secretos en el código**: la cadena de Atlas va en `.env` (como la llave de DeepSeek).
10. **El pack es dato**: marca, textos, catálogo y precios se leen de documentos; un cliente nuevo es
    `tenant` + `brand` + documentos, sin tocar código.

## El motor del prototipo (implementado)

El prototipo ya tiene los dos motores detrás de las MISMAS rutas (`tools/api.mjs`); cuál corre lo decide
`MONGODB_URI` — la misma degradación que la llave de DeepSeek: sin llave, la página usa lo suyo; sin
Atlas, el prototipo usa su base de casa.

| Dónde | Motor | Fotos | Cuándo |
| --- | --- | --- | --- |
| Casa | `tools/api-sqlite.mjs` → `data/quoter.db` (tablas, columnas) | R2 si está configurado; si no, archivos en `data/photos/…` | siempre que NO haya `MONGODB_URI` |
| Atlas | `tools/api-mongo.mjs` → colección `quotes` EMBEBIDA | R2 si está configurado; si no, el GridFS (`fotos/<ns>/<COT-####>/NN.ext`) | cuando hay `MONGODB_URI` (en .env o en el entorno) |
| Netlify Functions | las mismas rutas en `netlify/functions/api.mjs` y `ia.mjs` | R2 | desplegado: allá Atlas es obligatorio (no hay disco) |

Lo que ambos motores comparten (por eso el traspaso es un export, no una reescritura):

- **Las mismas rutas y el mismo JSON**: `GET/PUT/DELETE /api/quotes`, `POST /api/reset` y
  `GET /api/photos/<ns>/<COT-####>/<archivo>`. El navegador no cambia una línea entre motores.
- **`data` es el cajón de lo que el modelo todavía no nombra**, el mismo en los dos: lo que la página
  manda y no tiene columna/campo propio (el desglose de la tela, la lista, los insumos, las entradas de
  la estimación…) vuelve tal cual al leer. Cuando un dato se vuelve importante, se le da su lugar y se
  rellena desde ahí (regla 6).
- **El `_id` de una cotización es su `COT-####`** (regla 8). Mientras un sitio despliegue un solo cliente
  (un namespace) no hay choque posible; el día que un cluster sirva a varios clientes con el mismo
  número, el `_id` pasa a compuesto (`<tenantId>:<COT-####>`) — anotado aquí para que nadie lo descubra
  a golpes.
- **`source` ya se escribe** (regla 5): las seeds viajan con `"source": "seed"` en `shared/demo-seed.json`,
  la corrida automática con `"e2e"` (la página lo marca con `window.__E2E__`, que pone el E2E), y lo demás
  es `cotizador`.
- **Los nombres desnormalizados se quedan** (`sellerName`, `servicePointName`, `fabricName`): el listado
  del backoffice se lee de un golpe, sin `$lookup`; las referencias (`sellerId`, `servicePointId`,
  `fabricId`) siguen ahí para cuando haga falta la verdad vigente.

Dos cosas que el motor de Atlas todavía NO resuelve (a propósito; nada se inventa):

- **`pieces[].furnitureId` va en `null`**: la página manda la ETIQUETA del mueble; el id del catálogo lo
  pondrá quien lo tenga (el cotizador o el resolutor del catálogo). La etiqueta sí viaja
  (`furnitureLabel`).
- **La foto vive en Cloudflare R2** (`tools/fotos-r2.mjs`): la clave es `photos/<ns>/<COT-####>/NN.ext`,
  y el documento guarda `key` + `url` (la Public Development URL del bucket; con dominio propio, esa).
  El camino es el de producción: el navegador pide una **URL firmada** (`POST /api/photos/firmas`, 10
  minutos, un solo objeto), sube DIRECTO a R2 y a la base solo viajan los metadatos — los bytes no pasan
  por la función. Sin R2 configurado la página manda los dataURL como antes (el servidor los sube a R2 si
  está, o al GridFS/disco si no): el extra nunca es un requisito.
- **Una lista de fotos VACÍA no borra nada**: la página manda su lista entera al guardar, y una copia
  leída antes de que las fotos llegaran llegaría con `photos: []` — eso es «sin noticia de fotos», no
  «bórralas todas» (la regla vive en los dos motores).

Colecciones que el modelo ya nombra y el prototipo todavía no escribe: `tenants`, `brands`, `users`,
`servicePoints`, `fabrics`, `furniture`, `settings` (hoy viven en los packs) y las dos que vienen con el
asistente: `conversations` y `knowledge`. Se conectan cuando toque — la forma ya está aquí.

El paso a paso del despliegue (Atlas + Netlify): `docs/despliegue-netlify.md`.
