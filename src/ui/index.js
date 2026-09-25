/* LA PUERTA DE LA INTERFAZ (src/ui): modales, confirmaciones y avisos.
 *
 * Igual que `src/tenant/`, se asoma por `window.UI` mientras el resto siga siendo scripts clásicos: la
 * página llama a `UI.confirmar(...)` / `UI.toast(...)` y no necesita saber cómo están hechos.
 */
/* Imports CON NOMBRE, nunca `import * as`: en el paquete los módulos se aplanan en un script y un
 * espacio de nombres deja de existir (docs/arquitectura-frontend.md). */
import { confirmar, engancharConfirmacion, resolver, hayConfirmAbierto, cerrarTodos } from './modal.js';
import { mostrar, esconder } from './toast.js';

export const UI = {
  modal: { confirmar: confirmar, enganchar: engancharConfirmacion, resolver: resolver, hayConfirmAbierto: hayConfirmAbierto, cerrarTodos: cerrarTodos },
  toast: { mostrar, esconder }
};

if (typeof window !== 'undefined') {
  window.UI = UI;
  /* El modal de confirmación engancha sus propios botones cuando la página ya está armada. */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => engancharConfirmacion());
  else engancharConfirmacion();
}
