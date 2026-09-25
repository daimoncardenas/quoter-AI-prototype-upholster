# La IA por API: DeepSeek detrás del asistente

El dueño, el 24 de septiembre de 2026:

> «first step is change the implementation AI... we need now API deepseek for our prototype because
> we will need more power for the next feature»

Hasta hoy el único modelo real era el del navegador (Gemini Nano, `LanguageModel`), y su techo se ve
en lo que costó arrancarle: una mirada de foto sujeta a una bandera y a una descarga de cuatro gigas,
una recomendación que a veces no llega, y una conversación que solo existe en el Chrome de quien ya
tiene el modelo. El prototipo necesita un modelo con más agencia, y este documento fija cómo entra sin
romper nada de lo que ya funciona.

## La decisión: el modelo por API, detrás del asistente y nunca en su lugar

Sigue en pie el contrato de siempre (`docs/contexto-del-modelo.md`): **el modelo redacta, el cerebro
simulado propone acciones y el cerco (`assistant-fence.js`) juzga CADA turno**; si un turno lo rompe,
responde la respuesta preparada del cerebro. Lo único que cambia es de dónde salen las palabras.

## Por qué la llamada NO sale del navegador

- **La llave no puede viajar al cliente.** Una página que lleva `DEEPSEEK_API_KEY` en su código se
  entrega con la llave dentro: cualquiera la lee en el paquete, y con ella gasta el saldo del dueño.
  La llave vive en `.env` (ignorado por git, como `CLIENT`) y la lee **el servidor de desarrollo**.
- **El navegador no puede hablar con `api.deepseek.com` aunque quisiera**: la página es un origen
  distinto y el servicio no manda cabeceras CORS para llamadas desde el navegador.
- **La demo de doble clic no tiene servidor.** `file://` no puede llevar un proxy, así que el
  paquete de doble clic sigue con respuestas preparadas — exactamente la regla que ya existe para el
  modelo del navegador (`references/ia-local-navegador.md`: sin contexto seguro, no hay modelo).

Así que el puente es una ruta del servidor de desarrollo: `POST /__ia/chat` y `GET /__ia/estado`,
montadas por `tools/dev.mjs` desde `tools/ia-api.mjs`. La ruta no se sirve en `file://` (no existe),
y el servidor escucha en `127.0.0.1`, como todo lo demás del proyecto.

## Los tres proveedores, en este orden

`proveedorIA()` devuelve cuál le pone palabras al asistente en este equipo y en este momento:

1. **`api`** — DeepSeek. Se elige cuando la página se sirve por `http` (o `https`), hay contexto
   seguro y `GET /__ia/estado` contestó `{api:true}` (es decir: hay llave en `.env`).
2. **`local`** — el modelo del navegador (Gemini Nano), como hasta hoy: sirve sin llave y sin red, y
   es el modo de un equipo que ya bajó el modelo. Su nota del chat no cambia ni una palabra.
3. **Ninguno** — el cerebro simulado responde en todo (la demo de doble clic, un equipo sin modelo y
   sin llave). Es el mismo modo «respuestas simuladas» de siempre.

El modo se decide al cargar y la **nota del panel dice la verdad de cada uno**; la de la API es nueva
y dice lo que pasa de verdad con lo que el cliente escribe — que sale del equipo hacia el servicio.
Nunca más la frase «lo que escribas no sale de este equipo» con la API contestando: sería mentira.

## El contrato: una sesión, dos formas

Los dos proveedores se esconden detrás de una sola pieza, para que las tres funciones que hoy usan el
modelo no sepan cuál está detrás:

    sesionDelProveedor(sistema, opciones)  ->  { pedir({texto, imagen}), soltar() }

- `pedir` devuelve el texto crudo del modelo (el cerco lo juzga afuera, como siempre).
- `imagen` es opcional y viaja como `{blob, dataUrl}`: el proveedor del navegador la manda como Blob
  (lo que su API espera), la API como `image_url` en base64. La foto ya se reduce en el navegador
  (`fotoPequeña`, 1024 px), así que el cuerpo de la llamada no crece.
- La sesión de la API **conserva la historia** en su propio arreglo de mensajes: DeepSeek no tiene
  sesión con memoria, la memoria la lleva la página. El estado del cotizador sigue viajando en CADA
  turno (`estadoDelCotizador`), así que el cambio de línea o de medidas no necesita recrear nada — y
  el reset de línea suelta la sesión igual que hoy (`resetProjectForLine`).

## El modelo y sus perillas

- **`deepseek-flash`** (DeepSeek-V4.1-Flash): contexto de 1M, visión incluida y la mitad de precio
  que `deepseek-v4-pro` — que además **no** acepta imágenes. Con flash, las tres cosas que hoy piden
  modelo (charla, mirada y recomendación) salen por la misma puerta.
- **`thinking` apagado por defecto.** El modo de pensamiento viene encendido y con esfuerzo alto; para
  un chat de atención al cliente eso es latencia y tokens de más. La ruta manda
  `{"thinking":{"type":"disabled"}}` y acepta `pensar:true` (con `reasoning_effort`) para cuando el
  próximo feature necesite la cabeza completa — que es, palabra del dueño, la razón de este cambio.
- **La mirada no se promete sin probarla.** Con el modelo del navegador la capacidad se comprobaba
  mirando un píxel de verdad, porque hay navegadores que aceptan la sesión y rechazan la imagen. Con
  la API el mismo criterio, un nivel más arriba: la sonda manda una imagen de 1×1 y solo entonces la
  fila se pinta; si la API no acepta la imagen, la fila lo dice con el mismo texto honesto de hoy.

## Qué NO cambia

- El cerco juzga cada turno y el cerebro simulado responde cuando lo rompe.
- La espera con puntos, el bloqueo de «Continuar» mientras la mirada trabaja y el tope de la
  recomendación (`TOPE_RECOMENDACION_MS`) siguen siendo del producto, no del proveedor.
- La atribución es de ella por su nombre (`asistenteNombre()`, `etiquetaIA()`): la tecnología no se
  anuncia en la copy del cliente.
- `npm test` no toca la red: el spec nuevo apaga la ruta con `page.route` y el proxy se prueba contra
  un DeepSeek de mentira.

## Criterios de aceptación (y dónde se prueban)

- `tests/assistant-api.spec.mjs` (nuevo, en la cadena): la nota del chat dice la verdad de la API,
  la respuesta de la API se muestra cuando pasa el cerco y NO se muestra cuando lo rompe (responde el
  cerebro), la mirada pinta su fila con la respuesta de la API, la recomendación ordena por lo que
  contestó la API, y sin llave (`{api:false}`) el producto se comporta como hoy.
- El proxy, por su lado: sin llave contesta `501` y **nunca** devuelve la llave ni en el cuerpo ni en
  una cabecera; con llave reenvía a `{base}/chat/completions` con `model: deepseek-flash`,
  `thinking:{type:'disabled'}` y la cabecera `Authorization` puesta; un error del servicio no se
  convierte en una respuesta del asistente.
- `tests/assistant-ia-local.spec.mjs`, `tests/review.spec.mjs` y `tests/recommend.spec.mjs` siguen
  verdes sin tocarlos: en `file://` no hay proveedor de API, así que su camino es el de siempre.

## Pendiente declarado

- **La demo empaquetada** (`npm run build` → `dist/`, de doble clic) no tiene API: no hay servidor
  donde esconder la llave. El día que la demo necesite el modelo, la puerta tendría que viajar con el
  paquete (un mini-servidor local) y esa es decisión del dueño, no de este cambio.
- **Costo**: cada turno de chat son unos miles de tokens de estado; una mirada, hasta 1024 tokens de
  imagen. Con `deepseek-flash` en horario valle son fracciones de centavo por conversación, pero el
  saldo es del dueño y la demo no avisa cuando se acaba.
