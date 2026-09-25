/* LA BASE, COMO FUNCIÓN DE NETLIFY — /api/*.
 *
 * Las mismas rutas que el servidor de desarrollo (tools/api.mjs): cotizaciones, seeds y fotos. Aquí el
 * motor es Mongo Atlas, obligatorio: en Netlify no hay disco donde dejar `data/quoter.db`. La cadena de
 * conexión llega por variable de entorno del sitio (MONGODB_URI) — jamás por el código (regla 9).
 */
import { laBase } from '../../tools/api.mjs';
import { aNode } from '../../tools/netlify-adaptador.mjs';

export const config = { path: '/api/*' };

export default async (reqWeb) => {
  const { req, res, url, terminado } = await aNode(reqWeb);

  let atendida = false;
  try {
    atendida = await laBase(req, res, url);
  } catch (err) {
    res.writeHead(500).end(JSON.stringify({ error: 'la base estalló: ' + err.message }));
  }
  if (!atendida) res.writeHead(404).end(JSON.stringify({ error: 'ruta de la base desconocida' }));

  const r = await terminado;
  return new Response(r.cuerpo, { status: r.estado, headers: r.cabeceras });
};
