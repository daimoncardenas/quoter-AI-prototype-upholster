/* LA PUERTA DEL NÚCLEO (src/app) — corte 6.
 *
 * `window.App` es lo que index.html ve del núcleo: el estado (state.js) y el bus del asistente
 * (events.js). El estado también viaja por su nombre (`state`), porque el script del paquete comparte
 * ámbito con la página y las specs lo leen por `evaluate` desde el corte 4.
 */
import { state, FURNITURE_INICIAL } from './state.js';
import { conectarElBus } from './events.js';

window.App = {
  estado: state,
  inicial: FURNITURE_INICIAL,
  eventos: { conectar: conectarElBus }
};
