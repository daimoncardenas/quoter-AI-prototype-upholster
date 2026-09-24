# La mano en el paso de insumos: cantidades estimadas, declaradas aproximadas

Dueño, 23/09, mirando el paso «¿Qué se le cambia por dentro?» del retapizado:

> «obviusly client dont know this inputs... the please.. put a hand aside of a page and when the user
> push this ... Assistant can fill this inputs how recommendation... according of measures... and
> standard... Assitant have warning to client these measures are approximattly values...»

## La forma

- **Una mano al lado de las filas**, pegada al borde del paso y sólo en el paso de insumos (o sea,
  sólo en las líneas que declaran `asks:["insumos"]`). En el retapizado es el paso 17.
- Al pulsarla, el asistente escribe las cantidades en las filas **vacías**: lo que el cliente ya
  escribió no se pisa, y la frase lo dice («dejé como estaban las que ya tenías»).
- Las filas que él escribió quedan marcadas **`aprox.`** hasta que el cliente toque esa fila: ahí el
  número pasa a ser suyo y la marca se va.
- La frase va por **dos superficies con el mismo texto**, como los errores: su burbuja con el
  asistente encendido y la línea del paso con el asistente apagado. Con los insumos el error no
  aplica (nadie se equivocó): es una propuesta, y se anota igual en la conversación.

## De dónde salen los números (dos vías, la misma vara)

1. **Con plantilla de despiece** (hoy: el sofá) — las caras del despiece que el motor ya calcula
   (`FURNITURE_TEMPLATES`, `store.js`): el asiento y el espaldar por sus medidas, y la tela completa
   por la suma de las piezas. La cobertura manda: con «solo asiento y respaldo» se estima eso.
2. **Sin plantilla** — las medidas declaradas (ancho, alto, fondo) más los metros base del mueble
   (los del backoffice) con el rendimiento de un rollo de 1,4 m: **0,8 m² de superficie por metro**.
   Es la aproximación declarada, no una medida de taller.

Tabla de estándares — **DEMO declarado**, en el catálogo (`shared/service-lines.json` →
`lines[].insumos[].standard`):

| Insumo | Regla | Sobre el sofá de 210 × 85 × 90, 3 puestos |
|---|---|---|
| Espuma | asiento + espaldar, redondeado al m² | 3 m² |
| Cinchas | una banda cada 7 cm, de frente a atrás | 22 m |
| Grapas | una caja por cada 12 m² de tela | 1 caja |
| Hilo | un rollo por cada 6 m² de tela | 2 rollos |
| Pegante | un kilo por cada 4 m² de tela | 3 kg |

Los **precios no se tocan**: los sigue poniendo el taller en su lista y siguen congelándose en la
solicitud. Los estándares también son del taller y viven en el catálogo; el backoffice todavía no
tiene editor para ellos (queda como sugerencia, no como entrega).

## Lo que NO entra (dicho, no olvidado)

- **El chat no sabe llenarlas todavía**: pedírselo por conversación devuelve su respuesta de siempre.
  La mano es el único camino, y así se reporta.
- La mano no toca la estimación por su cuenta: escribe en los mismos controles y dispara los mismos
  eventos que una edición a mano, y la suma sale de ahí (el asistente no tiene poderes extra).

## Criterios de aceptación (sus palabras)

- «put a hand aside of a page» → la mano existe, está al lado de las filas y sólo en ese paso.
- «when the user push this ... Assistant can fill this inputs how recommendation» → al pulsarla, las
  filas vacías quedan escritas.
- «according of measures... and standard» → los números salen de las medidas del mueble y de la tabla
  de estándares (los dos caminos de arriba).
- «Assitant have warning to client these measures are approximattly values» → la frase lo dice y las
  filas que él escribió quedan marcadas `aprox.` hasta que el cliente las toque.

Verificación: `node tests/retapizado-trabajo.spec.mjs` (bloque «LA MANO ESTIMA LAS CANTIDADES…»).
