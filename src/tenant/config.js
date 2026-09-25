/* LA MARCA CONTRATADA (el «tenant/brand»), como DATO.
 *
 * Nada de aquí está escrito a mano por cliente: el generador escribe `config.generated.js` con lo que
 * declara el paquete (`clients/<slug>/client.json`) y este módulo lo expone con nombres claros para que el
 * resto del código pida la marca en vez de leer una variable suelta o —peor— un texto literal.
 *
 * Regla de la casa: si un valor cambia entre clientes, vive en el paquete y se lee de aquí. Un `if` por
 * cliente es un error, no una solución (lo vigila tests/clients.spec.mjs).
 */
/* El empaquetador pega todos los módulos en UN script: los nombres de nivel superior no pueden
 * repetirse entre archivos. Por eso el import va con alias y la exportación tiene el nombre público. */
/* El nombre público `TENANT` lo declara `config.generated.js` (el generador): aquí se USA, no se
 * re-declara ni se le pone alias — en el paquete todos los módulos son UN script, y un alias dejaría el
 * nombre sin declarar. */
import { TENANT } from './config.generated.js';

/* Cómo se llama la casa (su nombre visible, no el del producto). */
export function nombreVisible() { return TENANT.displayName || TENANT.name || ''; }

/* El nombre corto, para rincones apretados (el pie, la barra). */
export function nombreCorto() { return TENANT.shortName || nombreVisible(); }

/* Cómo se llama la asistente en ESTA marca (Lía, o lo que el paquete diga). */
export function nombreDeLaAsistente() {
  return (TENANT.assistant && (TENANT.assistant.name || TENANT.assistant.displayName)) || 'la asistente';
}

/* El namespace del almacén: lo usa el store para no mezclar dos marcas en el mismo navegador. */
export function namespace() { return TENANT.namespace || ''; }

/* El correo desde el que sale la copia al cliente. */
export function correoRemitente() { return TENANT.senderEmail || ''; }

/* Los modos visuales del paquete (hoy: claro/oscuro por `colorMode`). */
export function modoDeColor() { return TENANT.colorMode || 'light'; }
