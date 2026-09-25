/* LA IA POR API — el proveedor de DeepSeek: la puerta y el cableado de la página.
 *
 * Dos mitades, porque son dos responsabilidades distintas:
 *
 *  1 · LA PUERTA (tools/ia-api.mjs) contra un DeepSeek DE MENTIRA: que la llave no viaje nunca al
 *      navegador (ni en el cuerpo ni en una cabecera), que el modelo y las reglas del proyecto
 *      viajen en la petición, que sin llave no se prometa nada y que un error del servicio NO se
 *      convierta en una respuesta del asistente.
 *  2 · LA PÁGINA servida por http: la nota del chat que dice la verdad de la API, la respuesta que
 *      se muestra cuando pasa el cerco y la que NO se muestra cuando lo rompe (ahí responde el
 *      cerebro simulado), la historia que se conserva entre turnos, la mirada de la foto (con su
 *      sonda de verdad) y la recomendación. Nada de esto sale a la red: la puerta va interceptada.
 *
 * La cadena de `npm test` NO toca internet: `page.route` contesta por la API.
 *
 *   node tests/assistant-api.spec.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { PHOTOS_DB } from './client.mjs';
import { openWizard, elegirMueble } from './helpers.mjs';
import { atenderIA } from '../tools/ia-api.mjs';

let fails = 0;
const check = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)); };

/* Una espera que corre en NODE (no en la página): una función pasada a `waitForFunction` se ejecuta
 * dentro del navegador, así que no puede ver los arreglos de este archivo — la primera versión de
 * esta spec se cayó con un `ReferenceError: pedidos is not defined` en la página por eso mismo. */
async function esperarQue(condicion, ms = 6000){
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) { if (condicion()) return true; await new Promise(r => setTimeout(r, 100)); }
  return condicion();
}

/* ─────────────────────────────────────────────────────────────────────────────
 * 1 · La puerta, con un DeepSeek de mentira
 * ───────────────────────────────────────────────────────────────────────────── */
const LLAVE = 'sk-de-prueba-no-es-una-llave';
const recibidas = [];
let upstream = { estado: 200, cuerpo: { choices: [{ message: { content: 'Respuesta de mentira.' } }], usage: { total_tokens: 7 } } };
const falso = createServer((req, res) => {
  let cuerpo = '';
  req.on('data', t => { cuerpo += t; });
  req.on('end', () => {
    recibidas.push({ url: req.url, cabeceras: req.headers, cuerpo });
    res.writeHead(upstream.estado, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(upstream.cuerpo));
  });
});
await new Promise(r => falso.listen(0, '127.0.0.1', r));
const BASE_FALSA = `http://127.0.0.1:${falso.address().port}`;

let claveDePaso = LLAVE;
const puerta = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  atenderIA(req, res, url, { clave: claveDePaso, baseUrl: BASE_FALSA })
    .catch(err => { res.writeHead(500); res.end(JSON.stringify({ error: String(err) })); });
});
await new Promise(r => puerta.listen(0, '127.0.0.1', r));
const PUERTA = `http://127.0.0.1:${puerta.address().port}`;

const pedir = async (ruta, opciones = {}) => {
  const r = await fetch(PUERTA + ruta, opciones);
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch { /* a veces no es JSON */ }
  return { estado: r.status, json, texto, cabeceras: Object.fromEntries(r.headers) };
};

console.log('\nLA PUERTA: LA LLAVE NO VIAJA, Y SIN LLAVE NO SE PROMETE NADA');
{
  const estado = await pedir('/__ia/estado');
  check('con llave, la puerta dice que la API está lista y con qué modelo',
    [estado.estado, estado.json.api, estado.json.modelo], [200, true, 'deepseek-flash']);

  const chat = await pedir('/__ia/chat', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mensajes: [{ role: 'user', content: 'hola' }] }) });
  check('y el chat contesta el texto del modelo', [chat.estado, chat.json.content], [200, 'Respuesta de mentira.']);

  /* Lo que el proyecto fija por su cuenta: el modelo, sin streaming y SIN modo de pensamiento (viene
   * encendido y con esfuerzo alto; un chat de atención al cliente no paga esa latencia). */
  const enviado = JSON.parse(recibidas.at(-1).cuerpo);
  check('la petición va al modelo del proyecto, sin streaming y sin pensar',
    [enviado.model, enviado.stream, enviado.thinking], ['deepseek-flash', false, { type: 'disabled' }]);
  check('y con la llave puesta en su cabecera (del lado del servidor)',
    recibidas.at(-1).cabeceras.authorization, `Bearer ${LLAVE}`);

  /* La regla que sostiene todo el diseño: el navegador NUNCA ve la llave. */
  const enCuerpo = chat.texto.includes(LLAVE);
  const enCabeceras = Object.entries(chat.cabeceras).some(([k, v]) => String(v).includes(LLAVE));
  check('y la llave no aparece ni en el cuerpo ni en una cabecera de la respuesta',
    [enCuerpo, enCabeceras], [false, false]);

  /* La palanca del próximo feature: con `pensar`, el modo de pensamiento se enciende. */
  await pedir('/__ia/chat', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mensajes: [{ role: 'user', content: 'piensa' }], pensar: true }) });
  check('con `pensar` el modo de pensamiento se enciende (la palanca del próximo feature)',
    JSON.parse(recibidas.at(-1).cuerpo).thinking, { type: 'enabled' });

  /* Un error del servicio se cuenta como error: jamás se convierte en una respuesta del asistente. */
  upstream = { estado: 402, cuerpo: { error: { message: 'Insufficient Balance' } } };
  const sinSaldo = await pedir('/__ia/chat', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mensajes: [{ role: 'user', content: 'hola' }] }) });
  check('un error del servicio llega como error, con su motivo, y sin contenido que mostrar',
    [sinSaldo.estado !== 200, sinSaldo.json.content === undefined, /Insufficient Balance/.test(sinSaldo.texto)],
    [true, true, true]);
  upstream = { estado: 200, cuerpo: { choices: [{ message: { content: 'Respuesta de mentira.' } }] } };

  /* Sin llave: la página lee {api:false} y usa los proveedores de siempre. */
  claveDePaso = '';
  const apagada = await pedir('/__ia/estado');
  const chatMudo = await pedir('/__ia/chat', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mensajes: [{ role: 'user', content: 'hola' }] }) });
  check('sin llave, la puerta lo dice y el chat queda cerrado (501)',
    [apagada.json.api, chatMudo.estado], [false, 501]);
  check('y el cuerpo de ese 501 no lleva ninguna llave ni contenido de modelo',
    [chatMudo.json.content === undefined, chatMudo.texto.includes('DEEPSEEK_API_KEY')], [true, true]);
  claveDePaso = LLAVE;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * 2 · La página, servida por http, con la puerta interceptada
 * ───────────────────────────────────────────────────────────────────────────── */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const RAIZ = resolve('generated');
const sitio = createServer(async (req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (ruta === '/') ruta = '/index.html';
  const archivo = resolve(RAIZ, '.' + ruta);
  if (!archivo.startsWith(RAIZ + sep)) { res.writeHead(403).end('Forbidden'); return; }
  try {
    const cuerpo = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(cuerpo);
  } catch { res.writeHead(404).end('Not found'); }
});
await new Promise(r => sitio.listen(0, '127.0.0.1', r));
const S = `http://127.0.0.1:${sitio.address().port}/`;

const b = await chromium.launch();
const errs = [];
const pedidos = [];          // lo que la página mandó a la API (para comprobarlo después)
let respuestas = {};         // lo que la API contesta en cada caso

/* El DeepSeek de mentira de la página: contesta según el encargo (mirada, recomendación, chat). */
async function abrirPagina(){
  const p = await b.newPage();
  p.on('pageerror', e => errs.push('api: ' + e));
  await p.route('**/__ia/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === '/__ia/estado') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ api: true, modelo: 'deepseek-flash' }) });
    }
    let cuerpo = null; try { cuerpo = req.postDataJSON(); } catch { /* cuerpo ilegible */ }
    pedidos.push({ cuerpo, cabeceras: req.headers() });
    const mensajes = (cuerpo && cuerpo.mensajes) || [];
    const sistema = String((mensajes[0] && mensajes[0].content) || '');
    /* La pregunta es el ÚLTIMO mensaje del cliente — no todo el cuerpo: el prompt de la casa nombra
     * «transporte» en sus reglas, así que buscar ahí dentro convertiría todo turno en el de prueba. */
    const ultimo = mensajes.filter(m => m.role === 'user').at(-1) || {};
    const pregunta = typeof ultimo.content === 'string' ? ultimo.content : JSON.stringify(ultimo.content);
    let content = respuestas.chat || 'En tu cotización de tapicería te ayudo con la tela y las medidas que registraste.';
    if (/veMueble/.test(sistema)) content = respuestas.mirada || '{"veMueble": true, "frase": "Veo un sofá de dos puestos tapizado en tela clara."}';
    else if (/"orden"/.test(sistema)) content = respuestas.orden || '{"orden": ["3","5","2","1","4"], "razon": "La Bouclé Capri te va por el uso y el estilo que declaraste."}';
    else if (/transporte/i.test(pregunta)) content = respuestas.promesa || 'Sí, te lo recogemos sin costo y con garantía de un año';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content, modelo: 'deepseek-flash' }) });
  });
  return p;
}

console.log('\nLA PÁGINA CON LA API: LA NOTA DICE LA VERDAD Y EL CERCO SIGUE MANDANDO');
{
  respuestas = {};
  const p = await abrirPagina();
  await p.goto(S + 'index.html');
  await p.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
  await p.waitForFunction(() => /API de DeepSeek/.test(document.querySelector('.chat-sim-note').textContent), null, { timeout: 5000 }).catch(() => {});
  const nota = await p.innerText('.chat-sim-note');
  check('con la API, la nota del chat lo dice y dice que lo escrito sale del equipo',
    [/API de DeepSeek/.test(nota), /se envía a ese servicio/.test(nota), /no sale de este equipo/.test(nota)], [true, true, false]);
  if (!/API de DeepSeek/.test(nota)) console.log('        nota: ' + nota);

  /* Primer turno: contesta la API y su texto se muestra (la respuesta habla del negocio: si no, el
   * cerco la tumba por tema y responde el cerebro — que es justo lo que prueba el turno de abajo). */
  await p.evaluate(() => openChat());
  await p.evaluate(() => askAssistant('hola, ¿qué telas tienen?'));
  await p.waitForFunction(() => /te ayudo con la tela/.test(document.getElementById('messages').innerText), null, { timeout: 5000 }).catch(() => {});
  check('la respuesta de la API se muestra cuando pasa el cerco',
    (await p.innerText('#messages')).includes('te ayudo con la tela'), true);

  /* Segundo turno: la historia viaja con la petición (la API no tiene sesión con memoria). */
  const cuantasCharla = () => pedidos.filter(x => { const s = String(((x.cuerpo || {}).mensajes || [])[0] && x.cuerpo.mensajes[0].content || ''); return !/veMueble|"orden"/.test(s); }).length;
  await p.evaluate(() => askAssistant('¿y para mascotas?'));
  await esperarQue(() => cuantasCharla() >= 2);
  const charla = pedidos.filter(x => { const s = String(((x.cuerpo || {}).mensajes || [])[0] && x.cuerpo.mensajes[0].content || ''); return !/veMueble|"orden"/.test(s); });
  const ultimo = charla.at(-1) || { cuerpo: { mensajes: [] } };
  const roles = ultimo.cuerpo.mensajes.map(m => m.role).join(',');
  check('la historia de la conversación viaja en cada turno (system, user, assistant, user)',
    [roles, JSON.stringify(ultimo.cuerpo.mensajes).includes('¿qué telas tienen?')], ['system,user,assistant,user', true]);
  check('y la llave no viaja desde la página: las peticiones salen sin Authorization',
    charla.every(x => !x.cabeceras.authorization), true);

  /* El turno que rompe el cerco: promete transporte → responde el cerebro simulado, no la API. */
  await p.evaluate(() => askAssistant('¿ustedes hacen transporte?'));
  await p.waitForTimeout(1200);
  const conPromesa = await p.innerText('#messages');
  check('un turno que promete transporte no se muestra: responde el cerebro simulado',
    [!conPromesa.includes('te lo recogemos sin costo'), /Estás en «/.test(conPromesa)], [true, true]);
  if (conPromesa.includes('te lo recogemos')) console.log('        mensajes: ' + conPromesa.replace(/\n/g, ' | ').slice(0, 300));
  await p.close();
}

console.log('\nLA MIRADA Y LA RECOMENDACIÓN, POR LA API');
{
  respuestas = {};
  const p = await abrirPagina();
  await p.goto(S + 'index.html');
  await p.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
  await openWizard(p, S);
  await elegirMueble(p, 'Sofá');
  await p.setInputFiles('#furniturePhoto', ['1','2','3'].map(n => new URL(`./fixture-sofa-${n}.png`, import.meta.url).pathname));
  await p.waitForFunction(() => state.photos.length >= 3);
  await p.click('#nextButton');
  await p.evaluate(() => {
    document.getElementById('width').value = '210';
    document.getElementById('height').value = '85';
    document.getElementById('depth').value = '90';
    const s = document.querySelector('.wizard-step[data-brain="REVIEW"]');
    showStep(+s.dataset.step);
  });
  await p.click('#analyzeButton');
  await p.waitForFunction(() => state.analyzed);
  /* La mirada: primero la sonda (un píxel blanco) y después la foto de verdad, las dos por la API. */
  await p.waitForFunction(() => /sofá de dos puestos/.test(document.getElementById('visionNote').innerText), null, { timeout: 8000 }).catch(() => {});
  const fila = await p.innerText('#visionNote').catch(() => '');
  check('con la API, la revisión dice lo que ve en la foto', fila.includes('sofá de dos puestos'), true);
  check('y con el mueble a la vista la fila va en verde (sin aviso)',
    await p.evaluate(() => { const d = document.querySelector('#visionNote > div'); return d ? d.classList.contains('warn') : null; }), false);
  check('y la fila va firmada por ella, no como juicio de la casa', /lía/i.test(fila), true);

  /* La sonda de la mirada gasta la PRIMERA llamada con imagen y va con un píxel, no con la foto: la
   * capacidad se paga una vez por carga, con la imagen mínima. La foto de verdad va después. */
  const conImagen = pedidos.filter(x => JSON.stringify(x.cuerpo).includes('image_url'));
  const urlDe = x => (JSON.stringify(x.cuerpo).match(/"url":"(data:image\/jpeg;base64,[^"]*)"/) || [])[1] || '';
  const sonda = conImagen[0] || { cuerpo: { mensajes: [] } };
  const laFoto = conImagen.find(x => /veMueble/.test(String(x.cuerpo.mensajes[0].content))) || { cuerpo: { mensajes: [] } };
  check('la API recibió la foto como image_url en base64 (no una pregunta a ciegas)',
    /"image_url":\{"url":"data:image\/jpeg;base64,/.test(JSON.stringify(laFoto.cuerpo.mensajes)), true);
  check('y la sonda de capacidad, antes que la foto, va con un píxel (no con la foto del cliente)',
    [conImagen.length >= 2, /Contesta solo «ok»/.test(String(sonda.cuerpo.mensajes[0].content)), urlDe(sonda).length < 2000, urlDe(laFoto).length > urlDe(sonda).length],
    [true, true, true, true]);
  const sistemaMirada = String(laFoto.cuerpo.mensajes[0].content);
  const declarado = await p.evaluate(() => [...document.querySelectorAll('#aiSummary dl>div')]
    .map(d => d.querySelector('dt').textContent + ': ' + d.querySelector('dd').textContent));
  check('y lo declarado en el cotizador viaja entero con la mirada',
    declarado.length > 0 && declarado.every(x => sistemaMirada.includes('- ' + x)), true);

  /* La recomendación: la API ordena el catálogo y solo puede reordenar lo que existe. */
  await p.evaluate(() => { document.getElementById('style').value = 'Moderno';
    document.getElementById('color').value = 'Grises'; document.getElementById('budget').value = '160000';
    const s = document.querySelector('.wizard-step[data-brain="RECOMMENDATION"]'); showStep(+s.dataset.step); });
  await p.evaluate(() => { ordenDeLaIA = null; recomendandoIA = false; state.fabric = null; recomendarConIA(); });
  await p.waitForFunction(() => /Bouclé Capri/.test(document.getElementById('aiPick').innerText), null, { timeout: 10000 }).catch(() => {});
  const reco = await p.evaluate(() => ({ fila: document.getElementById('aiPick').innerText,
    primeraTela: (document.querySelector('#fabricGrid .fabric-card b') || {}).textContent || '',
    telas: document.getElementById('fabricGrid').hidden }));
  check('la recomendación de la API se muestra y la parrilla vuelve con su orden',
    [/Bouclé Capri/.test(reco.fila), reco.telas, reco.primeraTela.length > 0], [true, false, true]);
  if (!/Bouclé Capri/.test(reco.fila)) console.log('        fila: ' + reco.fila.slice(0, 200));
  await p.close();
}

await b.close();
sitio.close(); puerta.close(); falso.close();

if (errs.length) { console.log('\nErrores de página:'); for (const e of errs) console.log('  ' + e); }
const total = fails + errs.length;
console.log(total ? `\n${total} FALLO(S)` : '\nALL PASS');
process.exit(total ? 1 : 0);
