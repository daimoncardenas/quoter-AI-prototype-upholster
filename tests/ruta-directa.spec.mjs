/* La ruta de la línea (docs/flujo-de-suministro.md): la primera pregunta del recorrido.
 *
 * «Compra directa» es el atajo del que llega con la referencia y los metros: sin mueble, sin
 * medidas, sin fotos, sin recomendación — y la cantidad declarada NO lleva el alza del taller
 * (desperdicio y margen son de lo que se calcula, no de lo que el cliente ya sabe). */
import { chromium } from 'playwright';
import { PHOTOS_DB } from './client.mjs';
import { openWizard, openAdmin, elegirAtencion } from './helpers.mjs';
const D = 'file://' + process.cwd() + '/generated/';

let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${name}` + (ok?'':`\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
};
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));

const abrir = async () => { await page.goto(D + 'index.html'); };
const fresh = async (file = 'index.html') => {
  await page.goto(D + file);
  await page.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
  /* Sin atajos: esta suite elige la línea y la ruta a mano (openWizard pasa de largo el paso de la
   * ruta, que es justo lo que aquí se prueba). */
  if (file === 'admin.html') { await openAdmin(page, D); } else { await abrir(); }
};
const estado = () => page.evaluate(() => ({
  paso: state.step, ruta: state.ruta,
  visibles: pasosVisibles(),
  movil: document.getElementById('mobileStep').textContent,
  titulo: document.getElementById('mobileTitle').textContent,
}));
const avanzar = async () => {
  const antes = await page.evaluate(() => state.step);
  await page.click('#nextButton');
  await page.waitForFunction(x => state.step !== x, antes).catch(() => {});
  await page.waitForTimeout(120);
};

console.log('\nLA PRIMERA PREGUNTA: SÓLO LAS LÍNEAS QUE DECLARAN RUTAS');
await fresh();
await page.evaluate(() => Store.saveSettings({ plan: 'Business', disabledLines: [] }));
await fresh();
await page.click('#serviceGrid .service-choice:has-text("Suministro de tela")');
await page.waitForTimeout(200);
await avanzar();
check('entrar a suministro abre la pregunta de la ruta, con la clásica ya elegida',
  await page.evaluate(() => {
    const paso = document.getElementById('routeStep');
    const cards = [...paso.querySelectorAll('.service-choice')].map(c => [c.querySelector('b').textContent, c.classList.contains('selected')]);
    return [paso.classList.contains('active'), state.ruta, cards];
  }),
  [true, 'mueble', [['Mueble o proyecto', true], ['Compra directa', false]]]);

console.log('\nCOMPRA DIRECTA: LA REFERENCIA Y LA CANTIDAD, Y NADA MÁS');
await page.click('#routeGrid .service-choice:has-text("Compra directa")');
await page.waitForTimeout(150);
check('la ruta corta deja el recorrido en cinco pasos (mueble, medidas, fotos y revisión fuera)',
  (await estado()).visibles, [0, 18, 19, 16, 15]);
await avanzar();
check('y «Continuar» cae en la referencia, no en el mueble',
  [(await estado()).paso, (await estado()).movil, (await estado()).titulo],
  [19, 'Paso 3 de 5', 'Tu referencia y cantidad']);
check('el paso del mueble no existe para esta ruta (ni sus fotos)',
  await page.evaluate(() => [
    pasosVisibles().includes(1),
    document.getElementById('uploadZone').hidden,
    !!document.querySelector('.wizard-step[data-step="1"].active'),
  ]), [false, true, false]);

/* Velvet Siena: 119.000/m, se vende en múltiplos de 0,5 m con pedido mínimo de 2 m. */
await page.click('#directGrid .fabric-card:has-text("Velvet Siena")');
await page.fill('#directQty', '21.3');
await page.waitForTimeout(120);
check('la cantidad declarada se cobra en la unidad comercial de la tela (21,3 → 21,5 m)',
  await page.evaluate(() => [document.getElementById('metersRange').textContent,
                             billable().facMin, billable().facMax]),
  ['21,5', 21.5, 21.5]);
check('y el paso de la estimación explica de dónde sale el número',
  await page.evaluate(() => [...document.querySelectorAll('#estimateAssumptions li')].map(li => li.textContent)),
  await page.evaluate(() => {
    const q = billable();
    return [`Motivo: Suministro de tela`, `Cantidad declarada: 21,3 m`,
            'Sin desperdicio ni margen de taller: esa alza es de lo que se calcula, no de lo que ya sabes.',
            `Consumo facturable: ${rangoM(q.facMin, q.facMax)} m`,
            `Tela: Velvet Siena · Petróleo a ${money(state.fabric.price)} / m`,
            ...q.razones];
  }));

console.log('\nLA CANTIDAD DECLARADA NO LLEVA EL ALZA DEL TALLER');
const conAlza = await page.evaluate(() => linePrice(billable()).total);
await openAdmin(page, D);
await page.click('button[data-page="settings"]');
await page.fill('#setWaste', '0'); await page.fill('#setMargin', '0');
await page.click('#saveSettings');
await page.goto(D + 'index.html');
await page.click('#serviceGrid .service-choice:has-text("Suministro de tela")');
await avanzar();
await page.click('#routeGrid .service-choice:has-text("Compra directa")');
await page.waitForTimeout(150);
await avanzar();
await page.click('#directGrid .fabric-card:has-text("Velvet Siena")');
await page.fill('#directQty', '21.3');
await page.waitForTimeout(150);
check('con desperdicio y margen en cero la estimación es la MISMA (no los llevaba)',
  await page.evaluate(() => linePrice(billable()).total), conAlza);
check('y el motor lo dice: modelo «declarada», no «componentes»',
  await page.evaluate(() => billable().consumo.modelo), 'declarada');

console.log('\nUNA TELA DE ROLLO SE PIDE EN ROLLOS');
await page.evaluate(() => { const f = Store.get('fabrics', 6); f.active = true; Store.put('fabrics', f); renderAllOptions(); });
await page.waitForTimeout(200);
await page.click('#directGrid .fabric-card:has-text("Milo Protect")');
await page.waitForTimeout(150);
check('la unidad del campo pasa a rollos y lo dice la tarjeta',
  await page.evaluate(() => [document.getElementById('directUnit').textContent,
                              document.getElementById('directQtyLabel').textContent.trim()]),
  ['', 'Número de rollos']);
await page.fill('#directQty', '2');
await page.waitForTimeout(150);
check('dos rollos de 30 m son 60 m declarados, y el rollo se cobra completo',
  await page.evaluate(() => {
    const q = billable(), d = cantidadDeclarada();
    return [d.valor, d.rollos, q.facMin, q.facMax, q.compra ? undefined : undefined];
  }).then(r => r.slice(0, 4)), [60, 2, 60, 60]);

console.log('\nLA ESTIMACIÓN, EL CIERRE Y LA SOLICITUD');
await page.click('#directGrid .fabric-card:has-text("Velvet Siena")');
await page.fill('#directQty', '21.3');
await page.waitForTimeout(150);
await avanzar();
check('la estimación del suministro sale con la cantidad declarada y su rango',
  await page.evaluate(() => [state.step, document.getElementById('priceRange').textContent !== '—',
                             document.getElementById('estimateAssumptions').textContent.includes('Cantidad declarada')]),
  [16, true, true]);
await avanzar();
check('el cierre pregunta cómo llega la tela (sólo en una línea con rutas)',
  await page.evaluate(() => [state.step, !document.getElementById('entregaField').hidden]),
  [15, true]);
await page.selectOption('#entrega', 'envio');
await page.fill('#fullName', 'Marta Ruiz');
await page.fill('#email', 'marta@ejemplo.com');
await page.fill('#phone', '3001234567');
await elegirAtencion(page);
await page.check('#consent');
await avanzar();
await page.waitForSelector('#successState:not([hidden])');
const id = (await page.textContent('#requestNumber')).trim();
check('la solicitud guarda su ruta, la cantidad declarada y la entrega',
  await page.evaluate(i => {
    const q = Store.get('quotes', i);
    return [q.ruta, q.cantidadDeclarada, q.entrega, q.billing.modelo, q.estimate.inputs.answers &&
            Object.keys(q.estimate.inputs.answers).length];
  }, id), ['directa', { valor: 21.3, unidad: 'm', rollos: null, rollLengthM: null }, 'envio', 'declarada', 0]);

console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'none'));
console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
