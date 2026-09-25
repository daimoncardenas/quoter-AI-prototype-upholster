/* La puerta a la API de DeepSeek, del lado del servidor de desarrollo.
 *
 * Vive aquí y no en la página por una razón sola: LA LLAVE NO PUEDE VIAJAR AL NAVEGADOR. Una
 * página que lleva DEEPSEEK_API_KEY en su código se entrega con la llave dentro, y el paquete de
 * este prototipo se comparte a mano. La llave vive en .env (ignorado por git, como CLIENT) y la lee
 * este módulo; el navegador solo ve texto ya redactado por el modelo.
 *
 * El otro motivo es CORS: la página es un origen distinto y api.deepseek.com no manda cabeceras
 * para llamadas desde el navegador. Por la misma puerta local pasa la foto de la mirada (base64),
 * que ya viene reducida a 1024 px desde el navegador (`fotoPequeña`).
 *
 * Rutas (montadas por tools/dev.mjs, solo en 127.0.0.1 y solo sobre http(s)):
 *   GET  /__ia/estado  -> {api: bool, modelo}          ¿hay llave en este equipo?
 *   POST /__ia/chat    -> {content, uso}               {mensajes, pensar?, temperatura?}
 *
 * Diseño y criterios: docs/ia-por-api.md.
 */
import { loadDotEnv } from './env.mjs';

export const MODELO = 'deepseek-flash';
const BASE_POR_DEFECTO = 'https://api.deepseek.com';
/* El cuerpo lleva la foto en base64 (~33 % más grande que el JPEG). La mirada manda ~1024 px, unos
 * cientos de KB; 24 MiB deja aire para varias imágenes sin volverse un agujero de memoria. */
const LIMITE_CUERPO = 24 * 1024 * 1024;

/* `.env` primero, el entorno del shell encima: la invocación concreta manda sobre el archivo, igual
 * que con CLIENT (tools/env.mjs). Una llave en blanco se lee como "no hay llave". */
export function claveDeDeepSeek(){
  const delArchivo = loadDotEnv().DEEPSEEK_API_KEY;
  return String(process.env.DEEPSEEK_API_KEY || delArchivo || '').trim();
}

export const baseDeDeepSeek = () =>
  String(process.env.DEEPSEEK_BASE_URL || BASE_POR_DEFECTO).replace(/\/+$/, '');

/* Una llamada al modelo. Los mensajes van en el formato de OpenAI (que es el de DeepSeek) tal como
 * los armó la página, y aquí solo se fijan las reglas del proyecto: modelo flash, sin streaming y
 * SIN modo de pensamiento (viene encendido y con esfuerzo alto; un chat de atención al cliente no
 * puede pagar esa latencia — la palanca queda en `pensar` para el próximo feature). */
export async function llamarAlModelo({ mensajes, pensar = false, temperatura, clave, baseUrl, fetchImpl = globalThis.fetch }){
  if (!clave) { const e = new Error('sin llave'); e.codigo = 'SIN_LLAVE'; throw e; }
  if (!Array.isArray(mensajes) || !mensajes.length) { const e = new Error('sin mensajes'); e.codigo = 'CUERPO'; throw e; }

  const cuerpo = { model: MODELO, messages: mensajes, stream: false, thinking: { type: pensar ? 'enabled' : 'disabled' } };
  if (!pensar && typeof temperatura === 'number') cuerpo.temperature = temperatura;

  const r = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${clave}` },
    body: JSON.stringify(cuerpo)
  });
  const crudo = await r.text();
  let datos = null; try { datos = JSON.parse(crudo); } catch { /* un error puede no ser JSON */ }

  if (!r.ok) {
    const detalle = (datos && datos.error && datos.error.message) || crudo.slice(0, 300) || `HTTP ${r.status}`;
    const e = new Error(`DeepSeek ${r.status}: ${detalle}`);
    e.codigo = 'SERVICIO'; e.estado = r.status;
    throw e;
  }
  const contenido = datos && datos.choices && datos.choices[0] && datos.choices[0].message
    && datos.choices[0].message.content;
  if (typeof contenido !== 'string' || !contenido.trim()) {
    const e = new Error('DeepSeek: respuesta sin contenido'); e.codigo = 'VACIA'; throw e;
  }
  return { content: contenido, uso: (datos && datos.usage) || null };
}

/* Junta el cuerpo del POST con un tope: una petición sin fin no puede quedarse con la memoria del
 * servidor (el navegador es de casa, pero un error de bucle es un error de bucle). */
function leerCuerpo(req){
  return new Promise((resolve, reject) => {
    let total = 0; const partes = [];
    req.on('data', trozo => {
      total += trozo.length;
      if (total > LIMITE_CUERPO) { const e = new Error('cuerpo demasiado grande'); e.codigo = 'GRANDE'; req.destroy(); reject(e); return; }
      partes.push(trozo);
    });
    req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
    req.on('error', reject);
  });
}

const responder = (res, estado, datos) => {
  const cuerpo = JSON.stringify(datos);
  res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(cuerpo);
};

/* `url.pathname` empieza por /__ia/. Devuelve true si la petición era de la IA (haya contestado o
 * no), para que el servidor no siga buscando el archivo en generated/. */
export async function atenderIA(req, res, url, { clave = claveDeDeepSeek(), baseUrl = baseDeDeepSeek(), fetchImpl } = {}){
  const ruta = url.pathname;

  if (ruta === '/__ia/estado') {
    if (req.method !== 'GET' && req.method !== 'HEAD') { responder(res, 405, { error: 'método no permitido' }); return true; }
    responder(res, 200, { api: Boolean(clave), modelo: MODELO });
    return true;
  }

  if (ruta !== '/__ia/chat') { responder(res, 404, { error: 'ruta de IA desconocida' }); return true; }

  if (req.method !== 'POST') { responder(res, 405, { error: 'método no permitido' }); return true; }
  if (!clave) {
    /* Sin llave el producto NO inventa: la página lee {api:false} y usa los proveedores de siempre. */
    responder(res, 501, { error: 'Falta DEEPSEEK_API_KEY en .env (ver docs/ia-por-api.md)' });
    return true;
  }

  let cuerpo;
  try { cuerpo = JSON.parse(await leerCuerpo(req) || '{}'); }
  catch (err) {
    responder(res, err.codigo === 'GRANDE' ? 413 : 400, { error: 'cuerpo ilegible: ' + err.message });
    return true;
  }

  try {
    const { content, uso } = await llamarAlModelo({
      mensajes: cuerpo.mensajes, pensar: Boolean(cuerpo.pensar), temperatura: cuerpo.temperatura,
      clave, baseUrl, fetchImpl
    });
    responder(res, 200, { content, uso, modelo: MODELO });
  } catch (err) {
    if (err.codigo === 'SIN_LLAVE') { responder(res, 501, { error: 'sin llave' }); return true; }
    if (err.codigo === 'CUERPO') { responder(res, 400, { error: err.message }); return true; }
    /* El error del servicio se cuenta tal cual (el dueño tiene que poder ver un 402 sin saldo o un
     * 429), pero NUNCA se convierte en una respuesta del asistente: de eso se encarga la página. */
    responder(res, err.estado && err.estado >= 400 && err.estado < 500 ? 502 : 503, { error: err.message });
  }
  return true;
}
