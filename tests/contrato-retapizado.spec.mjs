/* CONTRATO — «Retapizado de muebles»: su rama (el recorrido completo, con el paso de los insumos)
 * contra el JSON de su contrato.
 *
 * La suite de UNA línea (sola, fuera de `npm test`): comprueba los datos del contrato y camina su
 * rama en el wizard renderizado comparando el espejo paso por paso en las dos direcciones —el paso
 * declarado con su brain/id/ask, cada control declarado dentro de su paso, y ningún control del paso
 * sin declarar—. Diseño: docs/contrato-conversacional.md.
 *
 *   node tests/contrato-retapizado.spec.mjs
 */
import { correrSuiteDeContrato } from './contratos.mjs';

process.exit(await correrSuiteDeContrato('retapizado', 'Retapizado de muebles') ? 1 : 0);
