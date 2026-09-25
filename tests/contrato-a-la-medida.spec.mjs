/* CONTRATO — «Muebles a la medida»: su rama (con los dos asks —materiales y tapizado— y el paso de
 * la fabricación) contra el JSON de su contrato.
 *
 * La suite de UNA línea (sola, fuera de `npm test`): comprueba los datos del contrato y camina su
 * rama en el wizard renderizado comparando el espejo paso por paso en las dos direcciones —el paso
 * declarado con su brain/id/ask, cada control declarado dentro de su paso, y ningún control del paso
 * sin declarar (los asks cuentan como un campo: su interior es data del catálogo)—.
 * Diseño: docs/contrato-conversacional.md.
 *
 *   node tests/contrato-a-la-medida.spec.mjs
 */
import { correrSuiteDeContrato } from './contratos.mjs';

process.exit(await correrSuiteDeContrato('a-la-medida', 'Muebles a la medida') ? 1 : 0);
