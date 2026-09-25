/* «Completar pedido» (docs/flujo-de-suministro.md): el faltante de una compra anterior. Se busca la
 * solicitud —en lo que este navegador tiene guardado, o la busca un asesor en el sistema— y su
 * referencia se trae a la lista para escribir el faltante.
 *
 * Lo que NO se finge: ni el lote ni la continuidad del color. Nadie los declaró, así que los
 * confirma un asesor. */
import { chromium } from 'playwright';
import { PHOTOS_DB } from './client.mjs';
import { elegirAtencion, continuar } from './helpers.mjs';
const D = 'file://' + process.cwd() + '/generated/';

let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${name}` + (ok?'':`\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
};
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => { errs.push(String(e)); console.log('  PAGEERROR:', String(e).split('\n')[0]); });
page.on('console', m => { if (m.type() === 'error') console.log('  CONSOLA:', String(m.text()).slice(0, 200)); });

const fresh = async () => {
  await page.goto(D + 'index.html');
  await page.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
  await page.goto(D + 'index.html');
};
const avanzar = async () => {
  const antes = await page.evaluate(() => state.step);
  await continuar(page);
  await page.waitForFunction(x => state.step !== x, antes).catch(() => {});
  await page.waitForTimeout(120);
};

console.log('\nCOMPLETAR PEDIDO: BUSCAR EL ANTERIOR Y TRAER SU REFERENCIA');
await fresh();
await page.evaluate(() => Store.saveSettings({ plan: 'Business', disabledLines: [] }));
await fresh();
await page.click('#serviceGrid .service-choice:has-text("Suministro de tela")');
await page.waitForTimeout(200);
await avanzar();
await page.click('#routeGrid .service-choice:has-text("Completar pedido anterior")');
await page.waitForTimeout(200);
check('el carril del pedido pone la búsqueda antes de la lista',
  await page.evaluate(() => [pasosVisibles(), state.proposito, state.saber]), [[0, 18, 21, 20, 16, 15], null, null]);
await avanzar();
/* Sin decir CUÁL es el pedido este paso no deja seguir: el asesor no tendría qué buscar y el
 * faltante quedaría sin base. (El dueño lo encontró con una captura: pasaba en blanco.) */
check('el paso del pedido no avanza en blanco',
  await (async () => {
    const antes = await page.evaluate(() => state.step);
    await continuar(page);
    await page.waitForTimeout(150);
    return await page.evaluate(x => [state.step === x, document.getElementById('pedidoBusca').value,
                                     document.getElementById('pedidoError').textContent],
                               antes);
  })(),
  [true, '', 'Escribe el número de la solicitud o la referencia del pedido que vas a completar.']);
await page.fill('#pedidoBusca', 'COT-0000');
await page.click('#pedidoBuscar');
await page.waitForTimeout(150);
check('una solicitud que no está en este navegador no se inventa: lo dice y un asesor la busca',
  await page.evaluate(() => [state.step, !document.getElementById('pedidoError').hidden,
    document.getElementById('pedidoHallado').hidden, pedidoBase]),
  [21, true, true, null]);
await page.fill('#pedidoBusca', 'COT-1042');
await page.click('#pedidoBuscar');
await page.waitForTimeout(150);
check('y la que sí está trae su referencia y su fecha',
  await page.evaluate(() => [document.getElementById('pedidoHallado').hidden,
    document.getElementById('pedidoHalladoTexto').textContent,
    pedidoBase && pedidoBase.id]),
  [false, 'Pedido COT-1042 · Lino Verona · 2026-09-04. Traemos su referencia: escribe el faltante.', 'COT-1042']);
await avanzar();
check('la lista nace con la referencia del pedido anterior y el faltante en blanco',
  await page.evaluate(() => [state.step,
    document.querySelector('#listRows .list-fabric').selectedOptions[0].textContent,
    document.querySelector('#listRows .list-metros').value]),
  [20, 'Lino Verona · Arena', '']);
await page.fill('#listRows .list-metros', '12');
await page.waitForTimeout(150);
check('el faltante se calcula con la regla de esa tela (12 m, sin mínimos que la muevan)',
  await page.evaluate(() => {
    const f = valorDeLaLista()[0];
    return [f.declarado, f.facturable, f.valorTotal[0]];
  }), [12, 12, 12 * 89000]);
await avanzar();
check('y la letra chica dice quién confirma el lote y la continuidad',
  await page.evaluate(() => [...document.querySelectorAll('#estimateAssumptions li')].map(li => li.textContent).pop()),
  'Un asesor confirma disponibilidad y lote antes de cortar.');
await avanzar();
await page.selectOption('#entrega', 'asesor');
await page.fill('#fullName', 'Iván Peralta');
await page.fill('#email', 'ivan@ejemplo.com');
await page.fill('#phone', '3005551212');
await elegirAtencion(page);
await page.check('#consent');
await avanzar();
await page.waitForSelector('#successState:not([hidden])');
const id = (await page.textContent('#requestNumber')).trim();
check('la solicitud del faltante guarda el pedido del que viene y su única referencia',
  await page.evaluate(i => {
    const q = Store.get('quotes', i);
    return [q.ruta, q.entrega, q.pedidoDe, q.lista.map(f => [f.fabricName, f.declarado, f.facturable, f.valorTotal])];
  }, id),
  ['pedido', 'asesor', { id: 'COT-1042', fabricName: 'Lino Verona' },
   [['Lino Verona · Arena', 12, 12, [12 * 89000, 12 * 89000]]]]);
console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'none'));
console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
