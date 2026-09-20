/* Consumo estimado -> cantidad de compra -> cantidad facturable.
 * Three numbers that are only equal when a fabric sells in fine increments
 * with no minimum, and that people confuse constantly. */
import { chromium } from 'playwright';
import { PHOTOS_DB } from './client.mjs';
import { openAdmin, openWizard, elegirAtencion } from './helpers.mjs';
const D = 'file://' + process.cwd() + '/generated/';
const png = ['1','2','3'].map(n => new URL(`./fixture-sofa-${n}.png`, import.meta.url).pathname);

let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${name}` + (ok?'':`\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
};
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));

async function fresh(file) {
  await page.goto(D + file);
  await page.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
  if (file === 'admin.html') { await openAdmin(page, D); } else { await page.goto(D + file); }
}
async function wizardTo(step) {
  await page.setInputFiles('#furniturePhoto', png);
  await page.waitForFunction(() => state.photos.length >= 3);
  if (step >= 2) await page.click('#nextButton');
  if (step >= 3) { await page.fill('#width','210'); await page.fill('#height','85'); await page.fill('#depth','90'); await page.click('#nextButton'); }
  if (step >= 4) await page.click('#nextButton');
  if (step >= 5) { await page.click('#analyzeButton'); await page.waitForFunction(() => state.analyzed); await page.click('#nextButton'); }
  if (step >= 6) await page.click('#nextButton');
}
// [consumo, compra, facturable, sobrante] for one fabric at one consumption.
const q = (fabricId, meters) => page.evaluate(([id, m]) => {
  const r = Store.quantities(Store.get('fabrics', id), m);
  return [r.consumo, r.compra, r.facturable, r.sobrante];
}, [fabricId, meters]);
const razones = (fabricId, meters) => page.evaluate(([id, m]) =>
  Store.quantities(Store.get('fabrics', id), m).razones, [fabricId, meters]);

console.log('\nTHE THREE QUANTITIES ARE NOT THE SAME NUMBER');
await fresh('index.html');
// Lino Verona: 0.10 m increments, no supplier minimum, remainder reusable.
check('fine increments: the customer pays what the sofa eats, rounded up',
  await q(1, 9.68), [9.68, 9.7, 9.7, 0.02]);
// 9.68/0.1 is 96.80000000000001 in binary floating point. Without the epsilon
// this rounds to 9.8 — a whole extra increment invented by the CPU.
check('and the rounding is not eaten by floating point',
  await q(1, 9.7), [9.7, 9.7, 9.7, 0]);

// Velvet Siena sells in half metres.
check('half-metre increments round the bill up, not the consumption',
  await q(2, 9.68), [9.68, 10, 10, 0.32]);
check('and the customer is told why',
  await razones(2, 9.68), ['Se vende en múltiplos de 0,5 m.']);

console.log('\nMINIMUMS');
// Velvet Siena also carries a 2 m minimum order.
check('a small job is lifted to the minimum order',
  await q(2, 1.2), [1.2, 2, 2, 0.8]);
check('never billing more than is bought',
  await page.evaluate(() => {
    const r = Store.quantities(Store.get('fabrics', 2), 1.2);
    return r.facturable <= r.compra;
  }), true);
check('and the reason names the minimum',
  (await razones(2, 1.2)).includes('El pedido mínimo de esta tela es de 2 m.'), true);

// Terciopelo Roma: supplier ships no less than 25 m and the offcut is dead stock.
check('a supplier minimum on a non-reusable fabric lands on the customer',
  await q(5, 9.68), [9.68, 25, 25, 15.32]);
check('and that is exactly when it must be explained, not billed in silence',
  await razones(5, 9.68),
  ['El proveedor no despacha menos de 25 m de esta tela.',
   'El sobrante de esta tela no vuelve al inventario, así que se cotiza completo.']);

// Milo Protect only comes in whole 30 m rolls.
check('a roll-only fabric buys whole rolls',
  await q(6, 9.68), [9.68, 30, 30, 20.32]);
check('and two rolls when one is not enough',
  await q(6, 31), [31, 60, 60, 29]);

// The leftover is measured against consumption, not against the invoice —
// otherwise it reads 0 in precisely the cases worth showing.
check('the leftover is real fabric, not an accounting difference',
  await page.evaluate(() => {
    const r = Store.quantities(Store.get('fabrics', 5), 9.68);
    return [r.sobrante, r.compra - r.consumo === r.sobrante];
  }), [15.32, true]);

console.log('\nA FABRIC WITH NO RULES STILL QUOTES');
check('defaults fill in for a tela created before the rules existed',
  await page.evaluate(() => {
    const r = Store.quantities({ id: 99, name: 'Sin reglas', price: 50000 }, 4.44);
    return [r.consumo, r.facturable, r.razones.length];
  }), [4.44, 4.5, 0]);

console.log('\nTHE BACKOFFICE SETS THE RULE, THE COTIZADOR OBEYS IT');
await fresh('admin.html');
check('the roll width is gone from the global settings, it belongs to the tela',
  await page.evaluate(() => !!document.getElementById('setRoll')), false);
await page.click('button[data-page="fabrics"]');
await page.click('[data-edit-fabric="1"]');   // Lino Verona
check('the tela modal carries its own sale rules',
  await page.evaluate(() => {
    const f = document.getElementById('fabricForm').elements;
    return [f.rollWidthCm.value, f.saleUnit.value, f.incrementM.value,
            f.minOrderM.value, f.supplierMinM.value, f.reusableRemainder.checked];
  }), ['140','metro','0.1','1','0',true]);
await page.fill('#fabricForm [name=incrementM]', '2');
await page.fill('#fabricForm [name=minOrderM]', '12');
await page.click('#fabricForm button.primary');
check('the rule is saved on the fabric',
  await page.evaluate(() => {
    const f = Store.get('fabrics', 1);
    return [f.incrementM, f.minOrderM];
  }), [2, 12]);

await openWizard(page, D);
await wizardTo(5);
await page.click('.fabric-card:has-text("Lino Verona")');
// El sofá ya se calcula por piezas contra el ancho del rollo de esta tela.
const consumo = await page.evaluate(() => estimate());
check('the sofa consumption comes from the component model', consumo, [12.5, 14]);
check('but the customer is quoted in the multiples this tela sells in',
  await page.textContent('#metersRange'), '14');
check('and step 5 explains the jump instead of hiding it',
  [await page.isVisible('#quoteNote'), (await page.textContent('#quoteNote')).includes('múltiplos de 2 m')],
  [true, true]);
/* El precio del paso es un RANGO: la pre-cotización abre los extremos que colapsan con el margen
 * declarado de la casa (docs/precotizacion-rango.md). Se compara con el mismo helper de la app. */
check('the price follows the billed quantity, not the consumption',
  await page.textContent('#priceRange'),
  await page.evaluate(() => { const m = n => Store.money(n);
    const [lo, hi] = rangoPreliminar(14 * 89000, 14 * 89000);
    return lo === hi ? m(lo) : `${m(lo)} – ${m(hi)}`; }));

// Terciopelo Roma has a 25 m supplier minimum, which flattens both ends of the
// range onto the same number. "25-25 metros" is a number said twice.
await page.click('.fabric-card:has-text("Terciopelo Roma")');
/* Los metros que colapsan se dicen una vez («25», no «25–25»); el precio, en cambio, abre su margen
 * declarado: la tela es exacta, la pre-cotización no. */
check('a range whose ends collapse is printed once, not twice (the fabric exact, the pre-quote open)',
  [await page.textContent('#metersRange'), (await page.textContent('#priceRange')).includes('–')],
  ['25', true]);
await page.click('.fabric-card:has-text("Lino Verona")');

await page.click('#nextButton');
await page.waitForFunction(()=>state.step===16);   // el paso de la estimación
await page.click('#nextButton');
await page.waitForFunction(()=>state.step===15);   // el cierre: donde vive el resumen
check('el resumen del cierre muestra los dos números, para no confundirlos',
  [await page.textContent('#summaryConsumo'), await page.textContent('#summaryMeters')],
  ['12,5–14 m', '14 m']);

console.log('\nA SENT QUOTE IS FROZEN, NOT RECALCULATED');
await page.fill('#fullName', 'Natalia Peña');
await page.fill('#email', 'natalia@ejemplo.com');
await page.fill('#phone', '3001234567');
await elegirAtencion(page);
await page.check('#consent');
await page.click('#nextButton');
await page.waitForSelector('#successState:not([hidden])');
const quoteId = (await page.textContent('#requestNumber')).trim();
check('the solicitud carries the whole breakdown',
  await page.evaluate(id => {
    const b = Store.get('quotes', id).billing;
    return [b.consumo, b.facturable, b.compra, b.sobrante, b.modelo];
  }, quoteId), [[12.5,14],[14,14],[14,14],[1.5,0],'componentes']);

// A price list or a sale rule can change tomorrow. What was promised cannot.
await openAdmin(page, D);
await page.click('button[data-page="fabrics"]');
await page.click('[data-edit-fabric="1"]');
await page.fill('#fabricForm [name=incrementM]', '0.1');
await page.fill('#fabricForm [name=minOrderM]', '1');
await page.click('#fabricForm button.primary');
check('changing the rule afterwards does not rewrite what the client was told',
  await page.evaluate(id => Store.get('quotes', id).billing.facturable, quoteId), [14, 14]);

await page.click('button[data-page="quotes"]');
await page.click(`#quoteRows tr:has(strong:text-is("${quoteId}")) [data-quote]`);
await page.waitForSelector('#quoteModal.open');
// Scoped to #quoteDetail, not the whole #quoteModal: the modal also carries
// the status control and the comment form now, and the comment field is a
// textarea, not an input.
const detalle = await page.$$eval('#quoteDetail .field',
  els => els.map(e => [e.childNodes[0].textContent.trim(), e.querySelector('input').value]));
const fila = k => (detalle.find(([label]) => label === k) || [])[1];
// El sobrante decrece cuando el consumo sube, así que el par llega [1,0].
check('and the backoffice reads the frozen breakdown, all four numbers',
  [fila('Consumo estimado'), fila('Cantidad a comprar'), fila('Cantidad facturable'), fila('Sobrante estimado')],
  ['12,5–14 m', '14 m', '14 m', '0–1,5 m']);
check('with the reason it was quoted that way',
  (await page.textContent('.quote-reasons')).includes('múltiplos de 2 m'), true);

console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'none'));
console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
