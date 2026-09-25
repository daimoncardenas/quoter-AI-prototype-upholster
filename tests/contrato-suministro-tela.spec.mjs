/* CONTRATO — «Suministro de tela»: cada rama de su tarjeta contra el JSON de su contrato.
 *
 * La suite de UNA línea (sola, fuera de `npm test`): carga los contratos de shared/contracts/ cuya
 * rama empieza en esta línea —las siete del suministro: compra → (reventa · taller ×2 · mueble ×3) y
 * el pedido—, comprueba los datos (las entradas recorren el catálogo, las líneas indirectas salen de
 * ahí, ninguna rama queda sin contrato, las acciones estándar coinciden) y camina CADA rama en el
 * wizard renderizado comparando el espejo paso por paso en las dos direcciones: el paso declarado
 * está en el wizard con su brain/id/ask, cada control declarado existe dentro de su paso, y ningún
 * control del paso se queda sin declarar. Diseño: docs/contrato-conversacional.md.
 *
 *   node tests/contrato-suministro-tela.spec.mjs
 */
import { correrSuiteDeContrato } from './contratos.mjs';

process.exit(await correrSuiteDeContrato('suministro-tela', 'Suministro de tela') ? 1 : 0);
