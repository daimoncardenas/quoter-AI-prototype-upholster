import { chromium } from 'playwright';
import { openAdmin, setTags } from './helpers.mjs';
const D = 'file://' + process.cwd() + '/';
const png = ['1','2','3'].map(n=>new URL(`./fixture-sofa-${n}.png`, import.meta.url).pathname);

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
  await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('med-photos'); });
  if (file === 'admin.html') { await openAdmin(page, D); } else { await page.goto(D + file); }
}
// El modelo por componentes da decimales, y la UI los escribe con coma; un
// rango cuyos extremos coinciden se imprime una sola vez.
const priceMatchesRate = rate => page.evaluate(r => {
  const num = t => Number(t.trim().replace(',', '.'));
  const p = document.getElementById('metersRange').textContent.split('–').map(num);
  const [mn, mx] = p.length > 1 ? p : [p[0], p[0]];
  const esperado = mn === mx ? Store.money(mn * r)
                             : `${Store.money(mn * r)} – ${Store.money(mx * r)}`;
  return document.getElementById('priceRange').textContent === esperado;
}, rate);
async function wizardTo(step, opts = {}) {
  await page.setInputFiles('#furniturePhoto', png);
  await page.waitForFunction(() => state.photos.length >= 3);
  if (step >= 2) await page.click('#nextButton');
  if (step >= 3) { await page.fill('#width','210'); await page.fill('#height','85'); await page.fill('#depth','90'); await page.click('#nextButton'); }
  if (step >= 4) { if (opts.city) await page.selectOption('#city', opts.city); await page.click('#nextButton'); }
  if (step >= 5) { await page.click('#analyzeButton'); await page.waitForFunction(() => state.analyzed); await page.click('#nextButton'); }
  if (step >= 6) await page.click('#nextButton');
}

console.log('\nCATALOG — backoffice is the single source of truth');
await fresh('index.html');
await wizardTo(5);
check('wizard shows the backoffice catalog, not its own hardcoded 3',
  (await page.$$eval('.fabric-card-body > b', els => els.map(e => e.textContent.split(' · ')[0]))).sort(),
  ['Bouclé Capri','Lino Verona','Náutica Bari','Terciopelo Roma','Velvet Siena']);
check('inactive fabric (Milo Protect) is hidden from customers',
  await page.$$eval('.fabric-card-body > b', els => els.some(e => e.textContent.includes('Milo Protect'))), false);

console.log('\nCREATE A TELA IN THE BACKOFFICE -> IT APPEARS IN THE COTIZADOR');
await openAdmin(page, D);
await page.click('button[data-page="fabrics"]');
await page.click('#newFabric');
await page.fill('#fabricForm [name=name]', 'Lino Toscana');
await page.fill('#fabricForm [name=collection]', 'Naturales 2026');
await page.fill('#fabricForm [name=price]', '97000');
await page.fill('#fabricForm [name=colorName]', 'Humo');
await page.fill('#fabricForm [name=tags]', 'Lavable, Antimanchas');
await page.click('#fabricForm button.primary');
check('backoffice confirms the save', (await page.textContent('#toast')).includes('cotizador'), true);

await page.goto(D + 'index.html');
await wizardTo(5);
check('the new tela is offered to the customer',
  await page.$$eval('.fabric-card-body > b', els => els.some(e => e.textContent.includes('Lino Toscana'))), true);
await page.click('.fabric-card:has-text("Lino Toscana")');
check('and it prices at the rate the backoffice set (97.000/m)',
  await priceMatchesRate(97000), true);

console.log('\nSETTINGS — waste/margin set in the backoffice drive the estimate');
const before = await page.evaluate(() => estimate());
await openAdmin(page, D);
await page.click('button[data-page="settings"]');
await page.fill('#setWaste','0'); await page.fill('#setMargin','0');
await page.click('#saveSettings');
await page.goto(D + 'index.html');
await wizardTo(5);
const after = await page.evaluate(() => estimate());
check('zeroing waste+margin lowers the metres (was 12%+8% uplift)', after[1] < before[1], true);
check('and the uplift maths is the 1.21x we configured',
  Math.abs((before[1]/after[1]) - 1.21) < 0.12, true);

console.log('\nSUBMIT A QUOTE -> IT LANDS IN THE BACKOFFICE, WITH THE PHOTO');
await fresh('index.html');
await wizardTo(4, { city: '12 de Octubre' });
await page.click('#analyzeButton'); await page.waitForFunction(() => state.analyzed);
await page.click('#nextButton');
await page.click('.fabric-card:has-text("Velvet Siena")');
await page.click('#nextButton');
await page.fill('#fullName','Natalia Peña');
await page.fill('#email','natalia@example.com');
await page.fill('#phone','3001234567');
await page.check('#consent');
await page.click('#nextButton');
await page.waitForSelector('#successState:not([hidden])');
const quoteId = await page.textContent('#requestNumber');
check('customer gets a request number', /^COT-\d+$/.test(quoteId), true);
check('and is told who will contact them (auto-assign by point: 12 de Octubre -> Laura)',
  (await page.textContent('#successSeller')).includes('Laura Méndez'), true);

await openAdmin(page, D);
await page.click('button[data-page="quotes"]');
const row = await page.textContent('#quoteRows');
check('the quote appears in the backoffice table', row.includes(quoteId), true);
check('with the customer name', row.includes('Natalia Peña'), true);
check('the chosen fabric', row.includes('Velvet Siena'), true);
check('and routed to the right seller', row.includes('Laura Méndez'), true);
// The name is a label; the id is the link. Renaming an adviser used to detach
// their whole history, because a quote only ever knew them by name.
check('the quote is linked to the adviser by id, not only by name',
  await page.evaluate(id => Store.get('quotes', id.trim()).sellerId, quoteId), 1);
await page.click('button[data-page="sellers"]');
await page.click('[data-edit-seller="1"]');
await page.fill('#sellerForm [name=name]', 'Laura Méndez Ruiz');
await page.click('#sellerForm button.primary');
await page.click('button[data-page="quotes"]');
check('renaming her carries that quote with her instead of orphaning it',
  (await page.textContent('#quoteRows')).includes('Laura Méndez Ruiz'), true);

await page.click(`[data-quote="${quoteId}"]`);
await page.waitForSelector('#quoteModal.open');
check('the detail carries the photo the customer uploaded',
  await page.$eval('#quoteDetail', el => !!el.querySelector('img')), true);
check('and the measurements', (await page.textContent('#quoteDetail')) !== null &&
  await page.$$eval('#quoteDetail input', els => els.some(i => i.value === '210 × 85 × 90 cm')), true);

console.log('\nDASHBOARD — derived, not decorative');
await page.click('#quoteModal [data-close]');
await page.click('button[data-page="dashboard"]');
check('total reflects real quotes (6 seed + 1 new)', await page.textContent('#statTotal'), '7');
await page.click('button[data-page="quotes"]');
await page.click(`[data-quote="${quoteId}"]`);
await page.click('#advanceQuote');
await page.click('button[data-page="dashboard"]');
check('advancing a quote moves the donut legend',
  await page.evaluate(() => [+document.getElementById('legNew').textContent, +document.getElementById('legProgress').textContent]),
  [2, 3]);

console.log('\nDEACTIVATE A TELA -> IT LEAVES THE COTIZADOR');
await page.click('button[data-page="fabrics"]');
await page.click('[data-toggle-fabric]:has-text("Desactivar")');
const deactivated = await page.evaluate(() => Store.all('fabrics').filter(f=>!f.active).map(f=>f.name));
await page.goto(D + 'index.html');
await wizardTo(5);
check('a deactivated tela disappears for customers',
  await page.$$eval('.fabric-card-body > b', (els, names) => els.every(e => !names.includes(e.textContent.split(' · ')[0])), deactivated),
  true);

console.log('\nEDIT AN EXISTING PRICE IN THE BACKOFFICE -> THE COTIZADOR REPRICES');
await openAdmin(page, D);
await page.click('button[data-page="fabrics"]');
// Pick whichever tela is still active at this point — an earlier section
// deactivated one, so the name cannot be hardcoded.
const target = await page.evaluate(() => {
  const f = Store.all('fabrics').find(x => x.active);
  return { id: f.id, name: f.name, oldPrice: f.price };
});
await page.click(`[data-edit-fabric="${target.id}"]`);
check('the edit modal opens with the price the catalogue holds',
  await page.inputValue('#fabricForm [name=price]'), String(target.oldPrice));
await page.fill('#fabricForm [name=price]', '31500');
await page.click('#fabricForm button.primary');
check('the catalogue keeps the edited price, not a duplicate row',
  await page.evaluate(n => Store.all('fabrics').filter(f => f.name === n).map(f => f.price), target.name),
  [31500]);

await page.goto(D + 'index.html');
await wizardTo(5);
await page.click(`.fabric-card:has-text("${target.name}")`);
check('the customer sees the edited rate on the card',
  (await page.textContent('.fabric-card.selected .fabric-card-body small')).includes(await page.evaluate(() => Store.money(31500))),
  true);
check('and the estimate is recomputed at the new rate',
  await priceMatchesRate(31500), true);
await page.click('#nextButton');
check('and the step-6 summary quotes the same edited rate',
  await page.evaluate(() => {
    const [mn, mx] = estimate();
    const f = n => Store.money(n);
    return document.getElementById('summaryPrice').textContent === `${f(mn*31500)} – ${f(mx*31500)}`;
  }), true);

console.log('\nEDIT THE BUDGET BRACKETS -> THE COTIZADOR OFFERS THEM');
await openAdmin(page, D);
await page.click('button[data-page="settings"]');
await setTags(page, '#setBudgets', ['30000','40000','50000']);
await page.click('#saveSettings');
await page.goto(D + 'index.html');
await page.setInputFiles('#furniturePhoto', png);
await page.waitForFunction(() => state.photos.length >= 3);
/* n cortes son n+1 tramos. La versión anterior emitía n opciones y se comía el
 * corte más alto: con 30/40/50 el cliente leía "Más de $40.000" y los $50.000
 * no aparecían en ninguna etiqueta. */
// Store.money mete un espacio duro después del $, así que la expectativa se
// arma con la misma función y no a mano.
check('the budget dropdown follows the backoffice, not hardcoded brackets',
  await page.$$eval('#budget option', els => els.map(e => e.textContent)),
  await page.evaluate(() => {
    const m = Store.money;
    return [`Hasta ${m(30000)}`, `Entre ${m(30000)} y ${m(40000)}`,
            `Entre ${m(40000)} y ${m(50000)}`, `Más de ${m(50000)}`];
  }));
check('every configured cut point is named, the top one included',
  await page.$$eval('#budget option', els => els.map(e => e.value)),
  ['30000', '40000', '50000', '']);
// "Más de" no tiene tope: con value vacío, recommend() no marca nada como
// sobre presupuesto. Antes llevaba el corte más alto y topaba en silencio.
check('the open-ended bracket really is open-ended',
  await page.evaluate(() => {
    const s = document.getElementById('budget');
    s.value = ''; renderFabrics();
    return document.querySelectorAll('.fabric-card.over-budget').length;
  }), 0);

/* A quote is written by one page and read by another, so the date has to survive
 * the trip. It used to be stored as the UTC day and re-read as UTC midnight,
 * which in Colombia (UTC-5) is 19:00 the day before. The two errors cancelled
 * out after 19:00, so the bug only showed in daylight. This pins both halves at
 * 20:30 Bogotá — the hour where the writer used to jump to the next day. */
console.log('\nTHE DATE THE COTIZADOR WRITES IS THE DATE THE BACKOFFICE SHOWS');
const bogota = await browser.newContext({ timezoneId: 'America/Bogota', locale: 'es-CO' });
const night = await bogota.newPage();
const nightErrs = []; night.on('pageerror', e => nightErrs.push(String(e)));
await night.clock.setFixedTime(new Date('2026-09-06T20:30:00-05:00'));

await night.goto(D + 'index.html');
await night.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('med-photos'); });
await night.goto(D + 'index.html');
await night.setInputFiles('#furniturePhoto', png);
await night.waitForFunction(() => state.photos.length >= 3);
await night.click('#nextButton');
await night.waitForSelector('[data-step="2"].active');
await night.fill('#width', '210'); await night.fill('#height', '85'); await night.fill('#depth', '90');
await night.click('#nextButton');
await night.waitForSelector('[data-step="3"].active');
await night.click('#nextButton');
await night.waitForSelector('[data-step="4"].active');
await night.click('#analyzeButton');
await night.waitForSelector('#analysisChecks:not([hidden])');
await night.click('#nextButton');
await night.waitForSelector('[data-step="5"].active');
await night.click('#fabricGrid .fabric-card:nth-child(1)');
await night.click('#nextButton');
await night.waitForSelector('[data-step="6"].active');
await night.fill('#fullName', 'Prueba Nocturna');
await night.fill('#email', 'noche@ejemplo.com');
await night.fill('#phone', '3001112233');
await night.check('#consent');
await night.click('#nextButton');
await night.waitForSelector('#successState:not([hidden])', { timeout: 30000 });

const nightId = (await night.textContent('#requestNumber')).trim();
check('a quote sent at 20:30 is dated the customer\'s day, not the UTC one',
  await night.evaluate(id => Store.get('quotes', id).date, nightId), '2026-09-06');

await openAdmin(night, D);
await night.click('button[data-page="quotes"]');
await night.waitForSelector('#quoteRows tr');
check('and the backoffice lists it on that same day',
  (await night.$eval(`#quoteRows tr:has(strong:text-is("${nightId}")) small`, e => e.textContent.trim())),
  '06 de sept de 2026');
// The seeds are date-only strings too, so they drifted with everything else.
check('the seeded quotes are not shifted either',
  (await night.$eval('#quoteRows tr:has(strong:text-is("COT-1042")) small', e => e.textContent.trim())),
  '04 de sept de 2026');
errs.push(...nightErrs);
await bogota.close();

console.log('\nA FABRIC IMAGE — the backoffice uploads it, the customer sees it');
await fresh('admin.html');
await page.click('button[data-page="fabrics"]');
await page.click('[data-edit-fabric="1"]');   // Lino Verona
check('a tela with no image offers to upload one',
  await page.textContent('#fabricPhotoPick'), 'Subir imagen');
await page.setInputFiles('#fabricPhotoInput', png[0]);
await page.waitForFunction(() => document.getElementById('fabricPhotoThumb').classList.contains('filled'));
check('the preview fills and the button switches to replacing it',
  await page.textContent('#fabricPhotoPick'), 'Cambiar imagen');
await page.click('#fabricForm button.primary');

// A phone photo would blow past the ~4.9 MB localStorage ceiling, so the record
// may only ever hold the id. See browser-data-layer-not-sqlite.
check('the record keeps a reference, never the image itself',
  await page.evaluate(() => Store.get('fabrics', 1).photoId), 'fabric-1');
// The fixture is a PNG; getting JPEG back proves the canvas downscale ran and
// was not tainted by the file:// origin — that is what keeps a 4 MB phone photo
// from landing in the store at full size.
check('the bytes live in IndexedDB, downscaled to JPEG',
  await page.evaluate(() => Photos.get('fabric-1').then(u => !!u && u.startsWith('data:image/jpeg'))), true);
await page.waitForSelector('#fabricGrid .fabric:has-text("Lino Verona") .swatch.has-photo');
check('the catalogue card paints the photo instead of the colour',
  await page.$eval('#fabricGrid .fabric:has-text("Lino Verona") .swatch',
    e => e.style.background.includes('url("data:image')), true);

await page.goto(D + 'index.html');
await wizardTo(5);
await page.waitForSelector('.fabric-card:has-text("Lino Verona") .swatch.has-photo', { timeout: 5000 });
check('and the customer sees that same photo on the tela card',
  await page.$eval('.fabric-card:has-text("Lino Verona") .swatch',
    e => e.style.background.includes('url("data:image')), true);

// The form has no image input of its own, so a plain edit used to rebuild the
// record without photoId — the image would vanish on any other change.
await openAdmin(page, D);
await page.click('button[data-page="fabrics"]');
await page.click('[data-edit-fabric="1"]');
await page.waitForFunction(() => document.getElementById('fabricPhotoThumb').classList.contains('filled'));
check('reopening the tela shows the image it already has',
  await page.textContent('#fabricPhotoPick'), 'Cambiar imagen');
await page.fill('#fabricForm [name=price]', '91000');
await page.click('#fabricForm button.primary');
check('editing the price does not drop the image',
  await page.evaluate(() => [Store.get('fabrics', 1).price, Store.get('fabrics', 1).photoId]),
  [91000, 'fabric-1']);

await page.click('[data-edit-fabric="1"]');
await page.waitForFunction(() => document.getElementById('fabricPhotoThumb').classList.contains('filled'));
await page.click('#fabricPhotoDrop');
check('removing it empties the preview',
  await page.textContent('#fabricPhotoPick'), 'Subir imagen');
await page.click('#fabricForm button.primary');
check('and the record stops pointing at a photo',
  await page.evaluate(() => Store.get('fabrics', 1).photoId === undefined), true);
await page.waitForSelector('#fabricGrid .fabric:has-text("Lino Verona") .swatch:not(.has-photo)');
check('the card falls back to the colour de muestra',
  await page.$eval('#fabricGrid .fabric:has-text("Lino Verona") .swatch',
    e => e.style.background.includes('linear-gradient')), true);
// The delete is fired without blocking the save, so wait for it rather than
// asserting on the same tick the card repainted.
check('and the bytes are gone from IndexedDB',
  await page.waitForFunction(() => Photos.get('fabric-1').then(u => !u), null, { timeout: 5000 })
    .then(() => true).catch(() => false), true);

console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'none'));
console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
