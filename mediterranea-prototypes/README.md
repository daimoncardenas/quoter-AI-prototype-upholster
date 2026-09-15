# mediterranea-prototypes

## Entregar el prototipo

Las fuentes (`index.html`, `admin.html`, `store.js`) no llevan protección: son
para trabajar. Lo que se envía al cliente se genera:

    npm run build          # llave nueva
    npm run build -- --key=XXXXX-XXXXX-XXXXX-XXXXX

Salen `dist/index.html` y `dist/admin.html`: autocontenidos (store.js va dentro),
de doble clic, y con el prototipo cifrado con AES-256-GCM. La llave se deriva con
PBKDF2-SHA256 a 310.000 iteraciones y **no está en los archivos** — se manda por
correo, aparte. Si se pierde, se vuelve a construir con una nueva.

Una llave abre las dos páginas: queda guardada en el navegador del cliente, así
que se escribe una sola vez. El login del backoffice sigue siendo aparte.

`npm test` incluye `tests/sealed.spec.mjs`, que comprueba sobre los bytes del
paquete que ni el catálogo, ni los precios, ni los vendedores, ni la llave viajan
en claro.
