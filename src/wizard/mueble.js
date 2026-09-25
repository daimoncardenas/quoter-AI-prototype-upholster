/* EL PASO DEL MUEBLE (src/wizard) — segunda puerta del corte 4.
 *
 * Pinta el desplegable de muebles y, de paso, deja listas las REGLAS con las que el motor calcula
 * (metros por mueble, etiqueta de la cantidad, si la cantidad escala, los rangos de medida) y limpia
 * las tarjetas del dibujo. Nada viene marcado por defecto: que el catálogo traiga «Sofá» primero no es
 * una respuesta del cliente.
 *
 * Esa lista de reglas vive en la página porque la usan también la validación y el motor: el módulo se
 * las entrega con `ponerReglasDelMueble` y sigue.
 */
import { elTaller } from './casa.js';

export function pintarElMueble() {
  const C = elTaller();
  if (!C) return false;
  const list = C.Store.activeFurniture();
  const reglas = {}, rangos = {};
  list.forEach(f => {
    reglas[f.name] = { id: f.id, meters: f.meters, label: f.quantityLabel, unit: f.unit,
                       scaleByQty: !!f.scaleByQty, widthScaled: !!f.widthScaled };
    rangos[f.name] = f.ranges;
  });
  C.ponerReglasDelMueble(reglas, rangos);
  /* Si el estado trae un mueble que ya no existe en el catálogo, se limpia; nunca se inventa uno. */
  if (C.estado.furniture && !list.some(f => f.name === C.estado.furniture)) C.estado.furniture = '';
  document.getElementById('furnitureType').value = C.estado.furniture;
  C.pintarPiezas();                    // la lista del paso: una fila por pieza, con su desplegable
  C.syncOtherFurniture();
  return true;
}
