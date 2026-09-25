/* LA CONVERSACIÓN CON EL MODELO: entiende, reformula, y el contrato sigue mandando.
 *
 * Spec del turno con la API (docs/contrato-conversacional.md, docs/ia-por-api.md). El modelo va de
 * mentira (`page.route` contesta por la puerta `/__ia/*`), y lo que se comprueba es lo que el dueño
 * pidió al ver la primera versión: «the AI repeat the same phrase every moment until I complete
 * this.. the idea is can interact with human... and rephrase». Es decir:
 *
 *   · el modelo habla en sus palabras (no una frase del guion) y el cliente puede charlar
 *   · lo que el modelo propone se aplica SOLO si el contrato lo acepta (una medida imposible NO
 *     entra al formulario, aunque el modelo la diga)
 *   · en cada turno el modelo recibe LO QUE FALTA (el contrato) y la instrucción de no repetirse
 *   · el respaldo sin API no dice la misma pregunta dos veces igual
 *
 *   node tests/conversacion-api.spec.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { PHOTOS_DB } from './client.mjs';

let fails = 0;
const check = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)); };

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };
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
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.stack || e)));
const pedidos = [];
let turnos = [];   // lo que el modelo "contesta" en orden
await p.route('**/__ia/**', async route => {
  const req = route.request();
  const url = new URL(req.url());
  if (url.pathname === '/__ia/estado') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ api: true, modelo: 'deepseek-flash' }) });
  let cuerpo = null; try { cuerpo = req.postDataJSON(); } catch { /* sin cuerpo */ }
  pedidos.push((cuerpo && cuerpo.mensajes || []).map(m => m.content).join('\n'));
  const content = turnos.shift() || '{"decir": "Listo, seguimos.", "valores": {}}';
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content, modelo: 'deepseek-flash' }) });
});
await p.goto(S + 'index.html');
await p.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
await p.waitForFunction(() => /API de DeepSeek/.test(document.querySelector('.chat-sim-note').textContent), null, { timeout: 6000 }).catch(() => {});

const responder = async (texto) => { await p.fill('#vozInput', texto); await p.press('#vozInput', 'Enter'); await p.waitForTimeout(900); };
const ultimoDicho = () => p.innerText('#vozMessages .message:last-child');

console.log('\nEL MODELO HABLA EN SUS PALABRAS (no lee el guion)');
await p.click('#vozFab');
await p.waitForTimeout(400);
turnos = [
  '{"decir": "¡Qué bueno! Un sofá retapizado queda como nuevo. ¿De qué mueble hablamos exactamente?", "valores": {"linea": "retapizado"}}',
  '{"decir": "Perfecto, una poltrona. Cuéntame de tus fotos cuando quieras.", "valores": {"mueble": "Poltrona"}}'
];
await responder('hola, quiero retapizar mi sofá');
check('la respuesta del modelo es la que se muestra, no una del guion',
  /queda como nuevo/.test(await p.innerText('#vozMessages')), true);
check('y lo que propuso entró al formulario (la línea)',
  await p.evaluate(() => state.service && state.service.id), 'retapizado');
await responder('mejor es una poltrona, se me olvidaba');
check('y en el turno siguiente el mueble propuesto llega al estado',
  await p.evaluate(() => state.furniture), 'Poltrona');
check('y la charla del cliente no la contesta el guion', /poltrona/i.test(await p.innerText('#vozMessages')), true);

console.log('\nEL CONTRATO MANDA: UNA MEDIDA IMPOSIBLE NO ENTRA, AUNQUE EL MODELO LA DIGA');
turnos = ['{"decir": "Anoté 5000 de ancho, ¿te parece?", "valores": {"medidas": {"width": 5000, "height": 85, "depth": 90}}}'];
await responder('el ancho es 5000');
check('el campo queda vacío: el contrato no acepta esa medida',
  await p.evaluate(() => [document.getElementById('width').value, document.getElementById('height').value, document.getElementById('depth').value]),
  ['', '', '']);
check('pero el modelo sí habló (la conversación no se rompe)', /5000/.test(await p.innerText('#vozMessages')), true);

console.log('\nY UNA MEDIDA BUENA ENTRA IGUAL CON LA FORMA QUE EL MODELO INVENTE (dueño, 25/09)');
/* El modelo suele proponer `medidas` con la forma que se le ocurre, no la del contrato ({campo,
 * valor}) — y antes eso SALTABA el parser: no se guardaba nada mientras la conversación decía
 * «anoto 90…» (dueño: «porque esto no está guardando los datos que le voy dando»). El parser del
 * contrato manda: entiende la frase natural del cliente y escribe por los controles. */
turnos = ['{"decir": "Listo, anoto 90 de ancho, 90 de alto y 90 de fondo.", "valores": {"medidas": {"width": 90, "height": 90, "depth": 90}}}'];
await responder('de largo 90 de alto y 90 de ancho');
await p.waitForTimeout(600);
check('la frase natural entra al formulario aunque el modelo proponga otra forma',
  await p.evaluate(() => ['width', 'height', 'depth'].map(i => document.getElementById(i).value)), ['90', '90', '90']);
check('y el recibo del sistema dice lo anotado de verdad',
  await p.evaluate(() => /Anotado:[^.]*90/.test(document.getElementById('vozMessages').innerText)), true);
check('y los insumos del taller se estiman solos: no se le preguntan al cliente',
  await p.evaluate(() => ({ estimados: insumosMarcados().length > 0,
    preguntado: /insumos del taller/i.test(document.getElementById('vozMessages').innerText) })), { estimados: true, preguntado: false });

console.log('\nEL MODELO RECIBE LO QUE FALTA Y LA ORDEN DE NO REPETIRSE');
const ultimoPedido = pedidos[pedidos.length - 1] || '';
check('el turno lleva el contrato (lo que falta, con sus campos)',
  [/LO QUE FALTA AHORA/.test(ultimoPedido), /medidas/.test(ultimoPedido)], [true, true]);
check('y la instrucción de no repetir la misma pregunta',
  [/NUNCA repitas una pregunta con las mismas palabras/.test(ultimoPedido), /"decir"/.test(ultimoPedido)], [true, true]);
check('y la regla de oro: nunca manda al formulario (todo se llena en la conversación)',
  [/JAMÁS mandes al cliente al formulario/.test(ultimoPedido), /OFRÉCELE TÚ las opciones/.test(ultimoPedido)], [true, true]);

console.log('\nY EL RESPALDO (SIN API) TAMPOCO REPITE IGUAL');
await p.evaluate(() => { /* se apaga la API: la página cae al respaldo */ });
await p.unroute('**/__ia/**');
await p.reload();
await p.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
await p.click('#vozFab');
await p.waitForTimeout(400);
const preguntas = [];
await p.fill('#vozInput', 'no te entiendo'); await p.press('#vozInput', 'Enter'); await p.waitForTimeout(700);
preguntas.push(await p.innerText('#vozMessages .message:last-child'));
await p.fill('#vozInput', 'sigo sin entender'); await p.press('#vozInput', 'Enter'); await p.waitForTimeout(700);
preguntas.push(await p.innerText('#vozMessages .message:last-child'));
check('dos veces seguidas, dos preguntas distintas (reformula)',
  [preguntas[0] !== preguntas[1], /Cuéntame qué necesitas|Sigo con esto/.test(preguntas[1])], [true, true]);
if (preguntas[0] === preguntas[1]) console.log('        repetida: ' + preguntas[0].slice(0, 120));

await p.close(); sitio.close(); await b.close();
if (errs.length) { console.log('\nErrores de página:'); for (const e of errs) console.log('  ' + e.slice(0, 300)); }
const total = fails + errs.length;
console.log(total ? `\n${total} FALLO(S)` : '\nALL PASS');
process.exit(total ? 1 : 0);
