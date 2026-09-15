# upholster-prototype-quoter

Cotizador de telas para tapicería, de marca blanca: un mismo código, muchos
clientes. Qué cliente se renderiza lo decide `CLIENT`.

## Elegir cliente

    cp .env.example .env     # ya trae CLIENT=MEDITERRANEA
    npm run dev              # servidor local en http://localhost:3000

`npm run dev` renderiza el cliente activo, lo sirve en
`http://localhost:3000/` (cotizador) y `http://localhost:3000/admin.html`
(backoffice), y la terminal indica qué `CLIENT` está corriendo. Al
guardar un cambio en las plantillas, en `clients/` o en `.env`, vuelve a
renderizar y recarga el navegador. Cambiar `CLIENT` en `.env` cambia de cliente
sin reiniciar, salvo que se haya arrancado con `CLIENT=...` en la terminal: ese
valor manda y los cambios en `.env` se ignoran. `PORT=4000 npm run dev` usa otro
puerto.

Sin servidor, `npm run generate` solo escribe `generated/index.html`,
`admin.html` y `store.js`, listos para abrir con doble clic; es lo que usan los
tests. `generated/` se ignora en git: se regenera, no se versiona. Para probar
otro cliente sin tocar `.env`:

    CLIENT=MACIZO npm run dev

Un `CLIENT` que no exista falla explicando qué clientes hay disponibles bajo
`clients/`.

## Clientes disponibles

| Slug | Estado |
|------|--------|
| `clients/mediterranea/` | Real — reproduce la marca y los datos originales de Mediterránea Insumos tal cual |
| `clients/macizo/` | **Diseño real, datos placeholder** — marca, colores, tipografía y logo tomados de macizocolombia.com (2026-09-14); los datos de demo (telas, puntos de atención, cotizaciones) siguen inventados; los usuarios son los compartidos; ver `clients/macizo/README.md` |
| `clients/intertelas/` | **Diseño real, datos placeholder** — marca, colores, tipografía y logo tomados de intertelas.com (2026-09-15); prospecto de CARDYRAM, prototipo privado de demostración; los datos de demo (telas, puntos de atención, cotizaciones) siguen inventados; los usuarios son los compartidos; usa `colorMode: "inverted"` (ver más abajo); ver `clients/intertelas/README.md` |

## Agregar un cliente nuevo

Copiar `clients/mediterranea/` a `clients/<slug>/` y reemplazar cada valor:

- `client.json` — nombre, textos, `theme` (colores), `fonts` (tipografía), `logo`,
  y opcionalmente `colorMode` (ver abajo)
- `seed.json` — telas, vendedores (solo `servicePointIds` y cantidad de cotizaciones;
  el nombre y el correo son compartidos, ver abajo), puntos de atención, cotizaciones
- `logo.png` o `logo.svg`

Los usuarios de demo del backoffice (correos y contraseña) **son los mismos para
todos los clientes** — viven en `shared/demo-users.json`, no en cada pack. No hace
falta tocar ninguna plantilla ni herramienta para un cliente nuevo — `CLAUDE.md` tiene
el contrato completo del pack.

## Modos de color

`client.json` → `colorMode` elige, por cliente, entre `"normal"` (por defecto —
el look de siempre) e `"inverted"` (invierte claro/oscuro: lo que antes era
oscuro/marca queda blanco con texto de marca, y lo que antes era blanco queda
del color de marca con texto blanco). Cada modo es un CSS en `modes/<modo>.css`
que se inyecta al final de la hoja de estilos de cada página — no hace falta
tocar las plantillas. `modes/inverted.css` no tiene ningún color de ningún
cliente hardcodeado, solo usa las variables de paleta que ya define cada
plantilla (`--ink`, `--accent`, `--line`, ...), así que sirve para cualquier
cliente que active ese modo. `colorMode: "inverted"` además requiere
`logo.fileOnLight` en `client.json` → `logo`: una variante del logo que se lea
sobre fondo blanco (el header/sidebar quedan blancos en ese modo). Agregar un
modo nuevo es soltar `modes/<nombre>.css` (solo con variables de paleta) y
poner `colorMode: "<nombre>"` en el pack — `tools/client-pack.mjs` valida el
valor solo y avisa qué modos existen si el nombre está mal escrito.

## Entregar el prototipo

Las fuentes (`index.html`, `admin.html`, `store.js`) son **plantillas**
compartidas entre todos los clientes, sin datos de ningún cliente adentro y
sin protección: son para trabajar, no para abrir directo. Lo que se envía al
cliente se genera:

    npm run build          # llave nueva
    npm run build -- --key=XXXXX-XXXXX-XXXXX-XXXXX

`build` primero renderiza `generated/` para el `CLIENT` activo y después
empaqueta. Salen `dist/index.html` y `dist/admin.html`: autocontenidos
(store.js va dentro) y de doble clic.

> **Cifrado desactivado por ahora.** `dist/` sale **sin cifrar**: se abre directo,
> sin llave, y no es la entrega final. `build` lo avisa con el mensaje
> `SIN CIFRAR`. Las llamadas de cifrado están comentadas en `tools/build.mjs`.

Con el cifrado activado, el prototipo va cifrado con AES-256-GCM. La llave se
deriva con PBKDF2-SHA256 a 310.000 iteraciones y **no está en los archivos**: se
manda por correo, aparte. Si se pierde, se vuelve a construir con una nueva. Una
llave abre las dos páginas: queda guardada en el navegador del cliente, así que
se escribe una sola vez. El login del backoffice sigue siendo aparte.

`npm test` incluye `tests/sealed.spec.mjs`, que comprueba sobre los bytes del
paquete que ni el catálogo, ni los precios, ni los vendedores, ni la llave viajan
en claro. Mientras el cifrado esté desactivado, esa prueba se salta.
