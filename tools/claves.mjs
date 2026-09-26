/* LAS CLAVES DEL CAJÓN — camelCase en el código, snake_case en la base (dueño, 25/09).
 *
 * El código escribe como habla (`quantityLabel`, `pedidoDe`); la base guarda como un almacén de datos
 * (`quantity_label`, `pedido_de`). El cajón `data` de una cotización es lo único que cruza entero, así
 * que al guardar sus claves se vuelven snake y al leer vuelven camel: lo que se ve en Atlas es dato
 * limpio y lo que recibe la página es EXACTAMENTE el JSON que mandó.
 *
 * Solo cambian las CLAVES, jamás los valores (un «COT-1043» o un nombre con mayúsculas no se tocan).
 */
const aSnake = clave => String(clave)
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
  .toLowerCase();

const aCamel = clave => String(clave).replace(/_([a-z0-9])/g, (m, c) => c.toUpperCase());

const enProfundidad = (dato, transformar) => {
  if (Array.isArray(dato)) return dato.map(x => enProfundidad(x, transformar));
  if (dato && typeof dato === 'object') {
    const salida = {};
    for (const [clave, valor] of Object.entries(dato)) salida[transformar(clave)] = enProfundidad(valor, transformar);
    return salida;
  }
  return dato;
};

export const clavesASnake = dato => enProfundidad(dato, aSnake);
export const clavesACamel = dato => enProfundidad(dato, aCamel);
