/* LA PUERTA DEL ASISTENTE (src/assistant) — para que la página no sepa de archivos.
 *
 * `window.Asistente` es lo que index.html ve; hoy solo la voz (el cerebro sigue como script propio
 * `AssistantBrain` y la presencia se muda en este mismo corte).
 */
import { hablarConLaVoz, encenderElMicrofonoDelAsistente, apagarElMicrofonoDelAsistente, conectarLaVoz } from './voice.js';
import { empezarLaPresencia } from './presence.js';

window.Asistente = {
  voz: {
    hablar: hablarConLaVoz, encender: encenderElMicrofonoDelAsistente,
    apagar: apagarElMicrofonoDelAsistente, conectar: conectarLaVoz
  },
  /* `empezarLaPresencia` es ASÍNCRONA (espera el `load` de la página, como cuando era un módulo
   * aparte): el arranque no espera por ella, y un tropiezo inesperado se ve en la consola en vez de
   * quedarse en un rechazo silencioso. */
  presencia: {
    empezar: () => empezarLaPresencia().catch(err => { console.error('[asistente] la presencia no arrancó:', err); })
  }
};
