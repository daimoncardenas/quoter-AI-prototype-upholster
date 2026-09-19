/* Servidor del spike: existe por una sola razón — el navegador solo expone el modelo local en un
 * contexto seguro. file:// no lo es; http://127.0.0.1 sí. No tiene dependencias ni nada que ver con el
 * producto: sirve esta carpeta.
 *
 *   node spikes/001-ia-local-navegador/serve.mjs        → http://127.0.0.1:4173
 */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';

const PORT = Number(process.env.PORT) || 4173;
const raiz = new URL('.', import.meta.url);
const tipos = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };

/* Lo único que se sirve de fuera de esta carpeta: el catálogo compartido, para no copiarlo (una sola
 * fuente para los motivos). Nada más del repo queda expuesto. */
const prestados = { '/shared/service-lines.json': new URL('../../shared/service-lines.json', raiz) };

createServer(async (req, res) => {
  const pedido = new URL(req.url, 'http://x').pathname;
  /* Lo que la página produzca (respuestas del modelo, veredictos del cerco) llega aquí y se guarda:
   * así se puede leer desde fuera del navegador, sin tocar el navegador de nadie. */
  if (pedido === '/guardar' && req.method === 'POST') {
    const trozos = [];
    for await (const t of req) trozos.push(t);
    const cuerpo = Buffer.concat(trozos).toString('utf8');
    const nombre = `resultado-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    try { JSON.parse(cuerpo); await writeFile(new URL(nombre, raiz), cuerpo); }
    catch { await writeFile(new URL(nombre.replace('.json', '.txt'), raiz), cuerpo); }
    console.log(`  guardado: ${nombre} (${cuerpo.length} bytes)`);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, archivo: nombre }));
    return;
  }
  const archivo = pedido === '/' ? 'index.html' : pedido.replace(/^\/+/, '');
  const ext = archivo.slice(archivo.lastIndexOf('.'));
  try {
    const cuerpo = await readFile(prestados['/' + archivo] || new URL(archivo, raiz));
    res.writeHead(200, { 'content-type': tipos[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(cuerpo);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`no está: ${archivo}`);
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Spike 001 en http://127.0.0.1:${PORT}  (contexto seguro: el navegador sí expone el modelo local)`);
  console.log(`  Desde Windows (Chrome): http://localhost:${PORT} — WSL reenvía el puerto.\n`);
});
