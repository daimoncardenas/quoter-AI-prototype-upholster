/* Servidor del spike: sirve la RAÍZ del repo (el cerco real vive en /assistant-fence.js) y la
 * página del spike. Es de usar y tirar: no toca generated/ ni el servidor de desarrollo.
 *
 *   node spikes/002-el-modelo-mira-la-foto/serve.mjs   →  http://127.0.0.1:4174/spikes/002-el-modelo-mira-la-foto/
 *
 * Chrome del cliente (153 ✓) y por http://127.0.0.1: el modelo local solo existe en contexto seguro.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep, normalize } from 'node:path';

const ROOT = resolve('.');
const PORT = Number(process.env.PORT) || 4174;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = resolve(ROOT, '.' + normalize(p));
  if (!file.startsWith(ROOT + sep)) { res.writeHead(403).end('fuera'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('no está: ' + p); }
}).listen(PORT, '127.0.0.1', () => console.log(`spike 002 en http://127.0.0.1:${PORT}/spikes/002-el-modelo-mira-la-foto/`));
