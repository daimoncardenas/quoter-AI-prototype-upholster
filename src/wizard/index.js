/* LA PUERTA DEL WIZARD (src/wizard) — para que la página no sepa de archivos.
 *
 * `window.Wizard` es lo que index.html ve; el día que el núcleo sea modular, esto es lo único que
 * queda apuntando a módulos y la página se vuelve una cáscara.
 */
import { pintarElMueble } from './mueble.js';
import { pintarLaCompra, pintarLaLinea, pintarElProposito, pintarElSaber, conectarLaCompra } from './compra.js';

window.Wizard = {
  mueble: { pintar: pintarElMueble },
  compra: { pintarTodo: pintarLaCompra, pintarLinea: pintarLaLinea, pintarProposito: pintarElProposito, pintarSaber: pintarElSaber, conectar: conectarLaCompra }
};
