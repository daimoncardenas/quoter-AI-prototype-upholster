/* LA PUERTA DE LA MARCA: `Tenant` reúne lo del paquete (config) y el tema, y se asoma a `window`
 * mientras el resto del código siga siendo scripts clásicos.
 *
 * Por qué el puente: la app todavía es un script grande dentro de la página más `store.js`; pasar TODO a
 * módulos de un golpe es el desastre que se quiere evitar. Así, este corte entra sin tocar nada: los
 * módulos son de verdad (import/export), y quien los necesite los pide por `window.Tenant` hasta que le
 * toque su propio corte. Cuando el núcleo sea modular, el puente se borra y nadie más se entera.
 */
import { TENANT, nombreVisible, nombreCorto, nombreDeLaAsistente, namespace, correoRemitente, modoDeColor } from './config.js';
import { VARIABLES, leer, leerTodas, aplicar, restaurar } from './theme.js';

export const Tenant = {
  config: TENANT,
  theme: { VARIABLES, leer, leerTodas, aplicar, restaurar },
  nombreVisible: nombreVisible,
  nombreCorto: nombreCorto,
  nombreDeLaAsistente: nombreDeLaAsistente,
  namespace: namespace,
  correoRemitente: correoRemitente,
  modoDeColor: modoDeColor
};

if (typeof window !== 'undefined') window.Tenant = Tenant;
