/* EL TURNO CON MODELO — y el paso manda (dueño, 25/09: «no respeta los pasos», «se salta cosas»).
 *
 * Igual que `conversacion-api.spec.mjs`, el modelo va DE MENTIRA por `page.route` (la suite no sale a
 * internet), pero aquí el modelo es el MALO de las sesiones del dueño: el que se adelanta a otro paso,
 * el que repite la misma frase, el que dice «Anotado» sin que nada haya entrado y el que contesta con
 * un rótulo suelto («Cantidad»). Lo que se comprueba es que NADA de eso le llegue al cliente:
 *
 *   · su frase adelantada NO sale: sale la pregunta del paso que toca
 *   · la misma frase dos veces seguidas no se repite igual
 *   · «Anotado: …» del modelo se cae (los recibos son del sistema)
 *   · un rótulo suelto se cambia por la pregunta del paso
 *   · y el wizard no se mueve de su paso mientras le falte algo
 *
 *   node tests/asistente-paso-modelo.spec.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { PHOTOS_DB } from './client.mjs';

let fails = 0;
const check = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
};

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const RAIZ = resolve('generated');
const sitio = createServer(async (req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (ruta === '/') ruta = '/index.html';
  const archivo = resolve(RAIZ, '.' + ruta);
  if (!archivo.startsWith(RAIZ + sep)) { res.writeHead(403).end('Forbidden'); return; }
  try { const cuerpo = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(cuerpo); }
  catch { res.writeHead(404).end('Not found'); }
});
await new Promise(r => sitio.listen(0, '127.0.0.1', r));
const S = `http://127.0.0.1:${sitio.address().port}/`;

const b = await chromium.launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e && e.stack || e)));
let turnos = [];
await p.route('**/__ia/**', async route => {
  const url = new URL(route.request().url());
  if (url.pathname === '/__ia/estado') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ api: true, modelo: 'deepseek-flash' }) });
  const content = turnos.shift() || '{"decir": "Listo, seguimos.", "valores": {}}';
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content, modelo: 'deepseek-flash' }) });
});
await p.goto(S + 'index.html');
await p.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
await p.click('#vozFab');
await p.waitForTimeout(500);

const responder = async (texto) => {
  await p.fill('#vozInput', texto); await p.press('#vozInput', 'Enter');
  for (let k = 0; k < 40; k++) { await p.waitForTimeout(300);
    const libre = await p.evaluate(() => ({ turno: !!voz.turno, hablando: !!vozAudio.hablando }));
    if (!libre.turno && !libre.hablando) break; }
  await p.waitForTimeout(200);
};
const burbujas = () => p.evaluate(() => [...document.querySelectorAll('#vozMessages .message.bot')].map(m => m.textContent.replace(/\s+/g, ' ').trim()));
const ultima = async () => (await burbujas()).slice(-1)[0] || '';
const estado = () => p.evaluate(() => {
  const c = ACI.losCamposDelPaso();
  return { paso: c ? c.paso : null,
    fila: [...document.querySelectorAll('.piezas-lista .pieza-fila [data-medida]')].map(e => e.dataset.medida + '=' + e.value).join(' '),
    piezas: (state.piezas || []).length };
});

try {
  /* ── 1 · el turno normal: el modelo habla en sus palabras y la línea entra ────────────────────── */
  turnos = ['{"decir": "Con gusto, eso es un retapizado. ¿Cuál es el primer mueble?", "valores": {"linea": "retapizado"}}'];
  await responder('necesito retapizar unos muebles');
  check('el modelo habla en sus palabras', /retapizado/.test(await ultima()) && /primer mueble/.test(await ultima()), true);

  /* ── 2 · el mueble ─────────────────────────────────────────────────────────────────────────────── */
  turnos = ['{"decir": "Perfecto, un sofá. ¿Me pasas las medidas: ancho, alto y largo?", "valores": {"mueble": "Sofá"}}'];
  await responder('es un sofá');
  const dos = await estado();
  check('el mueble quedó en la tabla', dos.piezas >= 1, true);

  /* ── 3 · las medidas: el número entra donde el cotizador lo acepta (el intercambio) ───────────── */
  turnos = ['{"decir": "Con eso voy. ¿Me subes las fotos del sofá en la zona de fotos?", "valores": {"medidas": {"ancho": 100, "alto": 90, "largo": 160}}}'];
  await responder('de largo 160 de ancho 100 y de alto 90');
  check('sus tres medidas entran (160 al ancho, 90 al alto, 100 al fondo)', (await estado()).fila, 'width=160 height=90 depth=100');
  check('y su frase (que pide las fotos) sí sale: es del paso', /fotos/.test(await ultima()), true);

  /* ── 4 · LA FRASE ADELANTADA NO SALE: pide la ciudad con las fotos pendientes ─────────────────── */
  turnos = ['{"decir": "¿En qué ciudad estás? Así completo tu atención.", "valores": {}}'];
  await responder('listo');
  const adelantada = await ultima();
  check('no pregunta la ciudad con el paso a medias', /ciudad/i.test(adelantada), false);
  check('sale la pregunta del paso (las fotos)', /foto/i.test(adelantada), true);

  /* ── 5 · la misma frase dos veces seguidas no se repite igual ─────────────────────────────────── */
  const antes = await ultima();
  turnos = ['{"decir": "¿En qué ciudad estás? Así completo tu atención.", "valores": {}}'];
  await responder('ya las subí');
  check('no repite la misma frase, una tras otra', (await ultima()) === antes, false);

  /* ── 6 · el «Anotado: …» del modelo se cae (los recibos son del sistema) ──────────────────────── */
  turnos = ['{"decir": "Anotado: Bogotá.", "valores": {}}'];
  await responder('sigo');
  check('no dice «Anotado: Bogotá» (nada había entrado)', /Anotado:\s*Bogotá/i.test(await ultima()), false);

  /* ── 7 · un rótulo suelto se cambia por la pregunta del paso ──────────────────────────────────── */
  turnos = ['{"decir": "Cantidad", "valores": {}}'];
  await responder('porfa');
  const rotulo = await ultima();
  check('no contesta con un rótulo suelto', /^\s*Cantidad\s*$/i.test(rotulo), false);
  check('y dice lo del paso (las fotos), no un rótulo', /foto/i.test(rotulo), true);

  /* ── 8 · el wizard se quedó en su paso: le faltan las fotos ───────────────────────────────────── */
  const fin = await estado();
  check('el wizard sigue en el paso del mueble (nada se saltó)', fin.paso, 1);
  check('sin errores de página', errs, []);
} finally {
  await b.close();
  sitio.close();
}

if (fails) { console.log(`FALLAS: ${fails}`); process.exit(1); }
console.log('TODO PASA — el turno con modelo respeta el paso');
