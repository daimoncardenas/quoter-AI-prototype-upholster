# Desplegar el prototipo en Netlify (con la base en Mongo Atlas)

Tres cosas: el cluster de Atlas, las variables del sitio y el despliegue. El repositorio no guarda ningún
secreto: la cadena de Atlas y la llave de DeepSeek viven en `.env` (local, ignorado por git) y en las
variables de entorno del sitio.

## 1. El cluster de Atlas (una sola vez, ~5 minutos)

1. Cuenta en https://cloud.mongodb.com → **Create** → **M0 (FREE)**. La demo es chica: sobra.
2. **Database Access** → *Add New Database User* → usuario y contraseña. La contraseña no se comparte por
   chat ni se pega en el repositorio: va a `.env` y a Netlify.
3. **Network Access** → *Add IP Address* → **Allow access from anywhere** (`0.0.0.0/0`). Las funciones de
   Netlify no tienen IP fija; la contraseña del usuario es la que protege el cluster.
4. **Connect** → *Drivers* → copia la cadena `mongodb+srv://…`.

## 2. La cadena, en dos lugares y nunca en el repositorio

- **En tu equipo** (para probar): pégala en `.env`:

      MONGODB_URI=mongodb+srv://…
      MONGODB_DB=aci            # opcional: por defecto «aci»

  Y corre la prueba de ida y vuelta:

      node tools/mongo-prueba.mjs

  Debe terminar en **TODO PASA** (escribe una cotización de prueba con su foto en un negocio aparte
  —`prueba.base.`—, la lee de vuelta y la borra). Si falla, el detalle dice por dónde.

- **En Netlify**: *Site configuration* → *Environment variables*:

  | Variable | Para qué |
  | --- | --- |
  | `MONGODB_URI` | la cadena de Atlas (sin ella `/api/quotes` contesta 503 y lo dice) |
  | `MONGODB_DB` | el nombre de la base (por defecto `aci`) |
  | `CLIENT` | qué pack se genera (p. ej. `CARDYRAM`) |
  | `DEEPSEEK_API_KEY` | la IA por API (opcional: sin ella la página usa lo suyo) |
  | `NPM_FLAGS` | `--omit=dev` — no instalar Playwright en el build (es de las pruebas) |

## 3. El sitio

1. https://app.netlify.com → *Add new site* → *Import an existing project* → GitHub → este repositorio.
2. Netlify lee `netlify.toml` del repo: comando `npm run generate`, publica `generated/`, funciones en
   `netlify/functions/`. No hay que configurar nada a mano.
3. *Deploy site*.

## 4. Qué queda vivo (y qué no cambia)

- `/` → el cotizador · `/admin.html` → el backoffice (logins de demo del set compartido).
- `/api/quotes` → la función de la base contra Atlas · `/__ia/*` → la puerta de DeepSeek.
- Sin `MONGODB_URI` la función contesta 503 **y lo dice**: la página sigue con su copia del navegador —
  nunca inventa.
- Abierto como archivo (doble clic) el prototipo sigue andando igual, con la copia del navegador.
- Las suites (`npm test`) corren contra SQLite (la base de casa): en Netlify no se corren — es despliegue.
