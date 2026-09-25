/* LA CASA (src/backoffice) — el puente de la transición, en UN solo sitio.
 *
 * Mientras el núcleo siga siendo un script clásico, las vistas no pueden importar el almacén, los avisos
 * ni los helpers: la página se los pasa a mano con `conectar…(casa)`. Ese objeto vive aquí, para que cada
 * vista lo pida y ninguna tenga que declarar su propia copia (dos vistas declarando `casa` en el mismo
 * script aplanado es un choque — y el empaquetador lo rechaza, con razón).
 *
 * Cuando el núcleo sea modular, este archivo se borra y las vistas importan lo que necesiten.
 */
let casa = null;

export function guardarCasa(laCasaDeLaPagina) {
  casa = laCasaDeLaPagina || null;
  return !!casa;
}

export function laCasa() {
  return casa || (typeof window !== 'undefined' ? window.Casa : null);
}
