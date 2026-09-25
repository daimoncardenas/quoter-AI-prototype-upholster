/* CONTRATO — «Reparación y restauración»: la línea que se alcanza de dos maneras.
 *
 * Su tarjeta propia solo se pinta con mantenimiento apagado (una línea que otra usa como camino no
 * pinta tarjeta: index.html, renderServiceOptions); con todo encendido se llega por el camino
 * «Reparación y restauración» de la tarjeta de mantenimiento, que MANDA A ESTA LÍNEA (catálogo:
 * `rutas` con `line`). Las dos entradas están en el contrato y las dos se caminan: el wizard queda en
 * la misma línea —`reparacion`— con los mismos pasos, que es lo que el contrato declara.
 *
 * La suite de UNA línea (sola, fuera de `npm test`). Diseño: docs/contrato-conversacional.md.
 *
 *   node tests/contrato-reparacion.spec.mjs
 */
import { correrSuiteDeContrato } from './contratos.mjs';

process.exit(await correrSuiteDeContrato('reparacion', 'Reparación y restauración') ? 1 : 0);
