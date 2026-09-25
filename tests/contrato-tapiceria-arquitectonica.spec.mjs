/* CONTRATO — «Tapicería arquitectónica»: su rama —la línea sin mueble— contra el JSON de su
 * contrato.
 *
 * El bloque de fotos se muda al primer paso de su cotización (index.html, reubicarLaSubida) porque
 * no hay paso de mueble: en su rama las fotos viven en el paso del ask `superficie`, y el contrato
 * lo declara así. La suite de UNA línea (sola, fuera de `npm test`) comprueba los datos del contrato
 * y camina su rama comparando el espejo paso por paso en las dos direcciones. Diseño:
 * docs/contrato-conversacional.md.
 *
 *   node tests/contrato-tapiceria-arquitectonica.spec.mjs
 */
import { correrSuiteDeContrato } from './contratos.mjs';

process.exit(await correrSuiteDeContrato('tapiceria-arquitectonica', 'Tapicería arquitectónica') ? 1 : 0);
