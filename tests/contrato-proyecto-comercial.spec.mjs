/* CONTRATO — «Proyecto comercial»: su rama (sin medidas ni preferencias, con los asks de boq y
 * obra) contra el JSON de su contrato.
 *
 * La suite de UNA línea (sola, fuera de `npm test`): comprueba los datos del contrato y camina su
 * rama en el wizard renderizado comparando el espejo paso por paso en las dos direcciones. Diseño:
 * docs/contrato-conversacional.md.
 *
 *   node tests/contrato-proyecto-comercial.spec.mjs
 */
import { correrSuiteDeContrato } from './contratos.mjs';

process.exit(await correrSuiteDeContrato('proyecto-comercial', 'Proyecto comercial') ? 1 : 0);
