/* EL ADAPTADOR DE NETLIFY — una petición web (Netlify Functions v2) al par req/res que ya hablan los
 * manejadores del servidor de desarrollo (`laBase`, `atenderIA`).
 *
 * El navegador no cambia: las funciones atienden las MISMAS rutas que el servidor de casa (`/api/*`,
 * `/__ia/*`), así que la página no sabe —ni tiene que saber— dónde corre su base.
 *
 * El truco es chico a propósito: `req` es un stream de Node de verdad (con method/url/headers pegados
 * encima), así que `leerCuerpo()` lo lee igual que siempre; `res` junta la respuesta y `terminado`
 * avisa cuando el manejador terminó. Nada de expreso, nada de dependencias.
 */
import { Readable } from 'node:stream';

export async function aNode(reqWeb) {
  const url = new URL(reqWeb.url);
  const cuerpo = Buffer.from(await reqWeb.arrayBuffer());

  const req = Readable.from(cuerpo.length ? [cuerpo] : []);
  req.method = reqWeb.method;
  req.url = url.pathname + url.search;
  req.headers = Object.fromEntries(reqWeb.headers);

  const trozos = [];
  let estado = 200;
  let cabeceras = { 'content-type': 'application/json; charset=utf-8' };
  let terminar;
  const terminado = new Promise(resolver => { terminar = resolver; });

  const res = {
    writeHead(code, extras) {
      estado = code;
      if (extras) for (const [k, v] of Object.entries(extras)) cabeceras[k.toLowerCase()] = v;
      return res;
    },
    setHeader(k, v) { cabeceras[k.toLowerCase()] = v; return res; },
    end(trozo) {
      if (trozo !== undefined && trozo !== null) trozos.push(Buffer.isBuffer(trozo) ? trozo : Buffer.from(String(trozo)));
      terminar();
      return res;
    },
    /* Nadie los usa hoy, pero un manejador que los llame no debe estallar. */
    on() { return res; },
    once() { return res; },
    get headersSent() { return false; }
  };

  return { req, res, url, terminado: terminado.then(() => ({ estado, cabeceras, cuerpo: Buffer.concat(trozos) })) };
}
