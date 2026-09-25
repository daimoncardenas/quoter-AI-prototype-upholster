/* LA PUERTA DEL BACKOFFICE (src/backoffice): una vista por archivo.
 *
 * Igual que `src/tenant/` y `src/ui/`, se asoma por `window.Backoffice` mientras la página siga siendo un
 * script clásico. El paquete (tools/bundle.mjs) pega estos módulos dentro de la página, así que los
 * nombres de nivel superior no se repiten entre archivos.
 */
import { pintarPuntos, conectarPuntos } from './puntos.js';
import { pintarVendedores, conectarVendedores } from './vendedores.js';
import { pintarTelas, conectarTelas } from './telas.js';
import { pintarAlcance, cargarAjustes, marcarSucio, conectarAjustes } from './ajustes.js';
import { pintarServicios, pintarObra, pintarMiAci, conectarServicios } from './servicios.js';
import { pintarResumen, conectarResumen } from './resumen.js';
import { pintarCotizaciones, conectarCotizaciones } from './cotizaciones.js';

export const Backoffice = {
  puntos: { pintar: pintarPuntos, conectar: conectarPuntos },
  vendedores: { pintar: pintarVendedores, conectar: conectarVendedores },
  telas: { pintar: pintarTelas, conectar: conectarTelas },
  ajustes: { pintarAlcance: pintarAlcance, cargarAjustes: cargarAjustes, marcarSucio: marcarSucio, conectar: conectarAjustes },
  servicios: { pintarServicios: pintarServicios, pintarObra: pintarObra, pintarMiAci: pintarMiAci, conectar: conectarServicios },
  resumen: { pintarResumen: pintarResumen, conectar: conectarResumen },
  cotizaciones: { pintar: pintarCotizaciones, conectar: conectarCotizaciones }
};

if (typeof window !== 'undefined') window.Backoffice = Backoffice;
