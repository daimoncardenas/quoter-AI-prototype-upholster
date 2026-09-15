/* Local dev server: renders the active client into generated/, serves it on
 * http://127.0.0.1:PORT, and re-renders + reloads the browser whenever a
 * template, a client pack or .env changes.
 *
 * The live-reload hook and the "which client is this" badge are injected into
 * the HTTP response only. generated/ on disk stays exactly what
 * `npm run generate` writes, because the test suite and `npm run build` read it.
 *
 * Bound to 127.0.0.1 on purpose: the backoffice login hashes with
 * crypto.subtle, which browsers only expose on secure contexts (localhost
 * counts, a LAN IP over plain http does not).
 *
 *   npm run dev                          -> CLIENT from .env, port 3000
 *   CLIENT=MACIZO PORT=4000 npm run dev  -> env var wins; .env edits are then ignored
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { generate } from './generate.mjs';
import { resolveClient } from './env.mjs';

const OUT_DIR = 'generated';
const ROOT = resolve(OUT_DIR);
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 3000;
const CLIENT_FROM_SHELL = Boolean(process.env.CLIENT);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

let current = null;   // { clientEnv, slug, displayName } of the last good render
let lastError = null; // message of the last failed render, cleared on success
const listeners = new Set();

function render() {
  try {
    const clientEnv = resolveClient();
    const { slug, client } = generate(clientEnv, OUT_DIR);
    const next = { clientEnv: clientEnv.toUpperCase(), slug, displayName: client.displayName };
    if (current && current.slug !== next.slug) {
      console.log(`  Switched client: ${current.clientEnv} -> ${next.clientEnv} (${next.displayName})`);
    }
    current = next;
    lastError = null;
    return true;
  } catch (err) {
    lastError = err.message;
    console.error(`\n  Render failed: ${err.message}`);
    if (current) console.error('  Still serving the last good output.\n');
    return false;
  }
}

function broadcast(event, data = '') {
  const payload = `event: ${event}\ndata: ${String(data).replace(/\n/g, ' ')}\n\n`;
  for (const res of listeners) res.write(payload);
}

/* Dev-only overlay: a small badge naming the rendered client, plus the
 * EventSource that reloads the page after a re-render. JSON is escaped so a
 * display name can never close the <script> tag. */
function devSnippet() {
  const info = JSON.stringify({ ...current, error: lastError }).replace(/</g, '\\u003c');
  return `<script>(function(){
  var d = ${info};
  var b = document.createElement('div');
  b.id = '__dev-client-badge';
  b.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;padding:4px 8px;border-radius:4px;font:600 11px/1.4 system-ui,sans-serif;color:#fff;pointer-events:none';
  function paint(err) {
    b.textContent = err ? 'DEV · render failed: ' + err : 'DEV · CLIENT=' + d.clientEnv + ' · ' + d.displayName;
    b.style.background = err ? 'rgba(170,20,20,.92)' : 'rgba(0,0,0,.72)';
  }
  paint(d.error);
  document.body.appendChild(b);
  var es = new EventSource('/__dev/events');
  es.addEventListener('reload', function () { location.reload(); });
  es.addEventListener('failed', function (e) { paint(e.data); });
})();</script>`;
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/__dev/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    listeners.add(res);
    req.on('close', () => listeners.delete(res));
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (pathname === '/') pathname = '/index.html';

  const file = resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  let body;
  try {
    body = await readFile(file);
  } catch (err) {
    const missing = err.code === 'ENOENT' || err.code === 'EISDIR';
    res.writeHead(missing ? 404 : 500).end(missing ? 'Not found' : 'Internal error');
    return;
  }

  const type = TYPES[extname(file)] || 'application/octet-stream';
  if (extname(file) === '.html') {
    const html = body.toString('utf8');
    const snippet = devSnippet();
    body = html.includes('</body>') ? html.replace('</body>', () => snippet + '</body>') : html + snippet;
  }
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

if (!render()) process.exit(1);

let timer = null;
function scheduleRender(reason) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    console.log(`  Changed: ${reason}`);
    if (render()) broadcast('reload');
    else broadcast('failed', lastError);
  }, 120);
}

// Watch the directory, not the files: editors save by rename, which would
// silently detach a watcher bound to the original file.
const ROOT_FILES = new Set(['index.html', 'admin.html', 'store.js', '.env']);
watch('.', (event, filename) => {
  if (filename && ROOT_FILES.has(String(filename))) scheduleRender(filename);
});
watch('clients', { recursive: true }, (event, filename) => scheduleRender(`clients/${filename ?? ''}`));

// Proxies and some browsers drop idle event streams; a comment line keeps it open.
setInterval(() => { for (const res of listeners) res.write(': ping\n\n'); }, 30000).unref();

const server = createServer((req, res) => {
  handle(req, res).catch(err => {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end('Internal error');
  });
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use. Try: PORT=${PORT + 1} npm run dev\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log(`
  Dev server · CLIENT=${current.clientEnv} (${current.displayName})
  Quoter:     http://localhost:${PORT}/
  Backoffice: http://localhost:${PORT}/admin.html

  Watching index.html, admin.html, store.js, clients/ and .env.
  Save a change and the browser reloads. Ctrl+C to stop.`);
  if (CLIENT_FROM_SHELL) {
    console.log('  CLIENT comes from the shell, so editing .env will not switch clients.');
  }
  console.log('');
});
