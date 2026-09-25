/* LA IA, COMO FUNCIÓN DE NETLIFY — /__ia/*.
 *
 * La misma puerta que el servidor de desarrollo (tools/ia-api.mjs): la llave de DeepSeek vive en la
 * variable de entorno del sitio y NUNCA viaja al navegador. Sin llave, la función contesta con la
 * verdad ({api:false} / 501) y la página usa sus proveedores de siempre — el producto no inventa.
 */
import { atenderIA } from '../../tools/ia-api.mjs';
import { aNode } from '../../tools/netlify-adaptador.mjs';

export const config = { path: '/__ia/*' };

export default async (reqWeb) => {
  const { req, res, url, terminado } = await aNode(reqWeb);

  try {
    await atenderIA(req, res, url);
  } catch (err) {
    res.writeHead(500).end(JSON.stringify({ error: 'la IA estalló: ' + err.message }));
  }

  const r = await terminado;
  return new Response(r.cuerpo, { status: r.estado, headers: r.cabeceras });
};
