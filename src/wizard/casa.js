/* EL PUENTE DEL TALLER (src/wizard) — la misma idea que src/backoffice/casa.js.
 *
 * Mientras el núcleo del cotizador siga dentro de index.html (corte 6), los módulos del wizard tienen
 * que ver `state`, el motor de pasos y el catálogo. En vez de repartir el puente por cada módulo, se
 * guarda UNA vez y cada archivo lee de aquí: cuando el núcleo sea modular, este archivo desaparece.
 */
let taller = null;
export function guardarElTaller(laPagina) { taller = laPagina; return true; }
export function elTaller() { return taller; }
