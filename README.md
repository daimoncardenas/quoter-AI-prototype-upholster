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
| `clients/macizo/` | **Diseño real, datos placeholder** — marca, colores, tipografía y logo tomados de macizocolombia.com (2026-09-14); los datos de demo (usuarios, telas, vendedores) siguen inventados; ver `clients/macizo/README.md` |

## Agregar un cliente nuevo

Copiar `clients/mediterranea/` a `clients/<slug>/` y reemplazar cada valor:

- `client.json` — nombre, textos, `theme` (colores), `fonts` (tipografía), `logo`,
  contraseña de demo, dominio de correo
- `seed.json` — telas, usuarios (sin `hash`, se calcula solo), vendedores,
  puntos de atención, cotizaciones
- `logo.png` o `logo.svg`

No hace falta tocar ninguna plantilla ni herramienta — `CLAUDE.md` tiene el
contrato completo del pack.

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
