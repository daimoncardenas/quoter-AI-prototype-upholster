import { chromium } from 'playwright';
import { PHOTOS_DB } from './client.mjs';
import { openAdmin, setTags } from './helpers.mjs';
const D = 'file://' + process.cwd() + '/generated/';
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
  await page.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
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
await page.click('[data-set-status="En gestión"]');
check('a non-final status moves forward',
  await page.evaluate(id => Store.get('quotes', id.trim()).status, quoteId), 'En gestión');
await page.click('#quoteModal [data-close]');
await page.click('button[data-page="dashboard"]');
check('advancing a quote moves the donut legend',
  await page.evaluate(() => [+document.getElementById('legNew').textContent, +document.getElementById('legProgress').textContent]),
  [2, 3]);

console.log('\nQUOTE CYCLE — non-final statuses move freely, closing needs confirmation and locks');
await page.click('button[data-page="quotes"]');
await page.click(`[data-quote="${quoteId}"]`);
await page.click('[data-set-status="Nueva"]');
check('and back',
  await page.evaluate(id => Store.get('quotes', id.trim()).status, quoteId), 'Nueva');
await page.click('[data-set-status="Cotizada"]');
check('reaches Cotizada — the only status closing is offered from',
  await page.evaluate(id => Store.get('quotes', id.trim()).status, quoteId), 'Cotizada');
await page.waitForSelector('#quoteStatusControl [data-close-status]');
check('closing buttons only appear once Cotizada',
  await page.$$eval('#quoteStatusControl [data-close-status]', els => els.map(e => e.dataset.closeStatus).sort()),
  ['Aceptada', 'Rechazada']);

// Dismissing the confirmation must leave the case exactly as it was.
page.once('dialog', d => d.dismiss());
await page.click('[data-close-status="Aceptada"]');
check('dismissing the close confirmation keeps the case open, unchanged',
  await page.evaluate(id => { const q = Store.get('quotes', id.trim()); return [q.status, !!q.closedAt]; }, quoteId),
  ['Cotizada', false]);

// Confirming closes it for good.
page.once('dialog', d => d.accept());
await page.click('[data-close-status="Rechazada"]');
check('confirming stamps status and closedAt',
  await page.evaluate(id => { const q = Store.get('quotes', id.trim()); return [q.status, typeof q.closedAt]; }, quoteId),
  ['Rechazada', 'string']);
await page.waitForSelector('#quoteStatusControl [data-set-status]', { state: 'detached' });
check('the status control disappears once closed — no buttons left, admin included',
  await page.evaluate(() => !document.querySelector('#quoteStatusControl [data-set-status],#quoteStatusControl [data-close-status]')),
  true);
check('a Store-level attempt to change the status is refused, not just hidden in the UI',
  await page.evaluate(id => { const q = Store.get('quotes', id.trim()); q.status = 'Nueva';
    try { Store.put('quotes', q); return 'did not throw'; } catch (err) { return err.message; } }, quoteId),
  'Esta cotización ya está cerrada; el estado no se puede modificar.');
check('and the stored status really did not change',
  await page.evaluate(id => Store.get('quotes', id.trim()).status, quoteId), 'Rechazada');

console.log('\nCOMMENTS — allowed at any status (closed included), append-only, never editable');
check('an empty comment is refused from the UI',
  await page.evaluate(id => (Store.get('quotes', id.trim()).comments || []).length, quoteId), 0);
await page.click('#commentForm button[type=submit]');
check('and nothing was added',
  await page.evaluate(id => (Store.get('quotes', id.trim()).comments || []).length, quoteId), 0);
const meName = await page.evaluate(() => me.name);
await page.fill('#commentText', 'Nota de seguimiento tras el cierre.');
await page.click('#commentForm button[type=submit]');
await page.waitForFunction(id => (Store.get('quotes', id.trim()).comments || []).length === 1, quoteId);
await page.waitForSelector('#quoteComments .activity li');
check('the comment carries author, date and text, oldest first',
  await page.evaluate(id => Store.get('quotes', id.trim()).comments[0].text, quoteId),
  'Nota de seguimiento tras el cierre.');
const commentBlock = await page.textContent('#quoteComments');
check('the author shows on a closed quote too',
  commentBlock.includes(meName) && commentBlock.includes('Nota de seguimiento'), true);
check('there is no edit or delete control for a comment',
  await page.evaluate(() => !document.querySelector('#quoteComments [data-edit-comment],#quoteComments [data-delete-comment]')),
  true);
check('Store.addComment itself refuses an empty/whitespace comment',
  await page.evaluate(id => { try { Store.addComment(id.trim(), { author: 'x', text: '   ' }); return 'did not throw'; }
    catch (err) { return err.message; } }, quoteId),
  'El comentario no puede quedar vacío');

console.log('\nTHE LOCK HOLDS EVEN WITHOUT closedAt — a status-final row that never got the timestamp');
// Simulates a row that reached a final status some other way (a hand-edited
// pack, an import) and never went through setQuoteStatus, so it never got
// closedAt — isQuoteClosed() must still treat it as closed from the status
// alone. A fresh context keeps this from disturbing quoteId's own state above.
const lockCtx = await browser.newContext();
const lockPage = await lockCtx.newPage();
await openAdmin(lockPage, D);
const lockResult = await lockPage.evaluate(() => {
  const q = Store.all('quotes')[0]; // any fresh seed row
  const forced = { ...q, status: 'Aceptada' };
  delete forced.closedAt;
  Store.put('quotes', forced); // allowed: the row was not closed before this write
  const results = {};
  try { Store.put('quotes', { ...forced, status: 'Nueva' }); results.put = 'did not throw'; }
  catch (err) { results.put = err.message; }
  try { Store.setQuoteStatus(forced.id, 'Nueva'); results.setQuoteStatus = 'did not throw'; }
  catch (err) { results.setQuoteStatus = err.message; }
  return { id: String(forced.id), stillNoClosedAt: !Store.get('quotes', forced.id).closedAt, results };
});
check('the row really has no closedAt (this is the case under test)', lockResult.stillNoClosedAt, true);
check('Store.put refuses a status change on a status-final row with no closedAt',
  lockResult.results.put, 'Esta cotización ya está cerrada; el estado no se puede modificar.');
check('Store.setQuoteStatus refuses it too',
  lockResult.results.setQuoteStatus, 'Esta cotización ya está cerrada; el estado no se puede modificar.');
await lockPage.click('button[data-page="quotes"]');
await lockPage.click(`[data-quote="${lockResult.id}"]`);
await lockPage.waitForSelector('#quoteModal.open');
await lockPage.waitForSelector('#quoteStatusControl .modal-hint');
check('the detail modal renders no status pills for it either, closedAt or not',
  await lockPage.evaluate(() => !document.querySelector('#quoteStatusControl [data-set-status],#quoteStatusControl [data-close-status]')),
  true);
check('and the locked message does not print "el undefined" when closedAt is missing',
  (await lockPage.textContent('#quoteStatusControl')).includes('undefined'), false);
await lockCtx.close();

console.log('\nDASHBOARD METRICS — match what Store actually holds, per statusClass/funnel/cycle');
await page.click('#quoteModal [data-close]');
await page.click('button[data-page="dashboard"]');
const expected = await page.evaluate(() => {
  const qs = Store.all('quotes');
  const by = s => qs.filter(q => q.status === s).length;
  const cerradas = by('Aceptada') + by('Rechazada');
  const conCotizacion = by('Cotizada') + cerradas;
  const cerradasConFecha = qs.filter(q => q.closedAt);
  // q.date is a local calendar day; parse it as local midnight (matching
  // admin.html), not UTC midnight, or this expectation drifts from what the
  // page actually shows outside UTC.
  const avgDays = cerradasConFecha.length
    ? cerradasConFecha.reduce((s, q) => s + Math.max(0, (new Date(q.closedAt) - new Date(q.date + 'T00:00:00')) / 86400000), 0) / cerradasConFecha.length
    : null;
  return {
    funnel: [by('Nueva'), by('En gestión'), by('Cotizada'), by('Aceptada'), by('Rechazada')],
    closed: cerradas,
    closedPct: qs.length ? Math.round(cerradas / qs.length * 100) : 0,
    acceptRate: conCotizacion ? Math.round(by('Aceptada') / conCotizacion * 100) : null,
    avgDays
  };
});
check('the funnel legend matches Store for all five statuses',
  await page.evaluate(() => ['legNew', 'legProgress', 'legSent', 'legAccepted', 'legRejected'].map(id => +document.getElementById(id).textContent)),
  expected.funnel);
check('closed cases and their % match Store',
  await page.evaluate(() => [+document.getElementById('metricClosed').textContent, document.getElementById('metricClosedPct').textContent]),
  [expected.closed, `${expected.closedPct}% del total`]);
check('acceptance rate matches Store (over Cotizada+Aceptada+Rechazada)',
  await page.textContent('#metricAcceptRate'),
  expected.acceptRate === null ? '—' : `${expected.acceptRate}%`);
check('average days to close matches Store',
  await page.textContent('#metricAvgDays'),
  expected.avgDays === null ? '—' : `${expected.avgDays.toFixed(1).replace('.', ',')} días`);

console.log('\nDASHBOARD METRICS — hand-computed from Mediterránea\'s seed, pinned to Bogotá');
// The check above trusts the same formula the page uses, so it cannot catch
// a wrong formula. This one is arithmetic done by hand against
// clients/mediterranea/seed.json's 6 seeded quotes, in a FRESH context (pure
// seed, nothing this suite created) pinned to America/Bogota so the
// local-midnight parsing of q.date is deterministic regardless of the host's
// own timezone.
//   statuses: Nueva x2, En gestión x2, Cotizada x0, Aceptada x1 (COT-1038),
//             Rechazada x1 (COT-1037)
//   cerradas = 1 + 1 = 2 of 6            -> round(2/6*100)  = 33% del total
//   conCotizacion = 0 Cotizada + 2 cerradas = 2
//   acceptRate = round(1/2*100)          = 50%
//   avgDays:
//     COT-1038: 2026-09-02T00:00-05:00 -> 2026-09-05T16:45:00-05:00
//               = 3d 16h45m = 3 + 16.75/24 = 3.6979166... days
//     COT-1037: 2026-09-01T00:00-05:00 -> 2026-09-04T10:10:00-05:00
//               = 3d 10h10m = 3 + 10.1666.../24 = 3.4236111... days
//     mean = (3.6979166... + 3.4236111...) / 2 = 3.5607638... -> toFixed(1) = "3,6"
const bogotaMetrics = await browser.newContext({ timezoneId: 'America/Bogota', locale: 'es-CO' });
const metricsPage = await bogotaMetrics.newPage();
await openAdmin(metricsPage, D);
await metricsPage.click('button[data-page="dashboard"]');
check('closed cases and % — hand-computed from the seed, not the formula',
  await metricsPage.evaluate(() => [+document.getElementById('metricClosed').textContent, document.getElementById('metricClosedPct').textContent]),
  [2, '33% del total']);
check('acceptance rate — hand-computed from the seed',
  await metricsPage.textContent('#metricAcceptRate'), '50%');
check('average days to close — hand-computed from the seed, Bogotá timezone',
  await metricsPage.textContent('#metricAvgDays'), '3,6 días');
await bogotaMetrics.close();

console.log('\nPER-SELLER CYCLE TABLE — matches Store for a seller with a closed case');
const sellerExpected = await page.evaluate(() => {
  const s = Store.get('sellers', 3); // Paula Gómez — has the seeded rejected quote
  const mine = quotesAll().filter(q => quoteIsFor(q, { sellerId: s.id, name: s.name }));
  const cot = mine.filter(q => ['Cotizada', 'Aceptada', 'Rechazada'].includes(q.status)).length;
  const cer = mine.filter(q => Store.isQuoteClosed(q)).length;
  const ace = mine.filter(q => q.status === 'Aceptada').length;
  return [s.name, String(mine.length), String(cot), String(cer), String(ace)];
});
check('the row for that seller matches, cell by cell',
  await page.$eval(`#sellerCycleRows tr:has-text("${sellerExpected[0]}")`, tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim())),
  sellerExpected);
check('the per-seller table is visible for this admin session',
  await page.isVisible('#sellerCycleTablePanel'), true);
// A seller's own dashboard hides the per-seller table entirely — see
// auth.spec.mjs's role-scoping section for that check with a real seller
// session (this suite only ever runs as the admin).

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
await night.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
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

console.log('\nUPGRADE — los tres planes, en orden, con precios y conteos exactos');
await openAdmin(page, D);
await page.click('button[data-page="upgrade"]');
check('Planes es la pestaña activa por defecto, con sus tarjetas visibles y Paquetes oculto',
  await page.evaluate(() => ({
    selected: document.getElementById('tabPlanes').getAttribute('aria-selected'),
    planesHidden: document.getElementById('panelPlanes').hidden,
    paquetesHidden: document.getElementById('panelPaquetes').hidden
  })),
  { selected: 'true', planesHidden: false, paquetesHidden: true });
check('exactamente tres planes, en orden Essential/Professional/Business',
  await page.$$eval('#plansGrid .plan-card h2', els => els.map(e => e.textContent)),
  ['Essential', 'Professional', 'Business']);
check('cada precio se arma con Store.money, no a mano',
  await page.$$eval('#plansGrid .plan-price', els => els.map(e => e.textContent)),
  await page.evaluate(() => [299000, 699000, 1290000].map(n => Store.money(n) + ' COP / mes')));
check('conteo de ítems — Essential: 17 incluye + 13 límites, Professional: 15, Business: 11',
  await page.$$eval('#plansGrid .plan-card', cards => cards.map(c => {
    const lists = c.querySelectorAll('.plan-list');
    return { incluye: lists[0].children.length, limites: lists[1] ? lists[1].children.length : 0 };
  })),
  [{ incluye: 17, limites: 13 }, { incluye: 15, limites: 0 }, { incluye: 11, limites: 0 }]);
check('el aviso de integraciones aparece bajo las tarjetas',
  await page.textContent('#plansNote'),
  'La activación de integraciones, los cargos de proveedores externos y los costos de uso no están incluidos en la licencia mensual, salvo que se indique expresamente en la propuesta comercial.');

const planStates = () => page.evaluate(() => [...document.querySelectorAll('#plansGrid .plan-card')].map(c => {
  const btn = c.querySelector('.plan-cta button');
  const label = c.querySelector('.plan-current-label');
  return { name: c.querySelector('h2').textContent, current: c.classList.contains('current'),
    label: label ? label.textContent : null, cta: btn.textContent, disabled: btn.disabled };
}));

console.log('\nUPGRADE — por defecto Essential es el plan actual');
check('Essential: etiqueta "Plan actual" y botón deshabilitado; Professional/Business ofrecen mejorar',
  await planStates(),
  [
    { name: 'Essential', current: true, label: 'Plan actual', cta: 'Tu plan actual', disabled: true },
    { name: 'Professional', current: false, label: null, cta: 'Mejorar a Professional', disabled: false },
    { name: 'Business', current: false, label: null, cta: 'Mejorar a Business', disabled: false }
  ]);

console.log('\nUPGRADE — cambiar de plan pide confirmación con el precio, y cancelar no cambia nada');
let dialogMsg = '';
page.once('dialog', d => { dialogMsg = d.message(); d.dismiss(); });
await page.click('#plansGrid [data-plan="Business"]');
await page.waitForTimeout(150);
check('el diálogo menciona el plan y el precio',
  dialogMsg, `¿Confirmas el cambio al plan Business por ${await page.evaluate(() => Store.money(1290000))} COP / mes?`);
check('cancelar deja a Essential como plan actual',
  await page.evaluate(() => Store.settings().plan), 'Essential');

console.log('\nUPGRADE — confirmar el cambio actualiza el plan, avisa con el toast y persiste tras recargar');
page.once('dialog', d => d.accept());
await page.click('#plansGrid [data-plan="Business"]');
await page.waitForTimeout(150);
check('el toast confirma el nuevo plan', await page.textContent('#toast'), 'Listo, tu plan ahora es Business.');
check('Business queda como plan actual; Essential y Professional ahora ofrecen cambiar',
  await planStates(),
  [
    { name: 'Essential', current: false, label: null, cta: 'Cambiar a Essential', disabled: false },
    { name: 'Professional', current: false, label: null, cta: 'Cambiar a Professional', disabled: false },
    { name: 'Business', current: true, label: 'Plan actual', cta: 'Tu plan actual', disabled: true }
  ]);
await page.reload();
await page.waitForSelector('#appShell:not([hidden])');
await page.click('button[data-page="upgrade"]');
check('el plan elegido sobrevive a un recargo de página',
  await page.evaluate(() => Store.settings().plan), 'Business');

console.log('\nUPGRADE — Paquetes: los cinco, en orden, con los precios exactos');
await page.click('#tabPaquetes');
await page.waitForTimeout(150);
check('el tab Paquetes queda seleccionado y su panel visible; Planes se oculta',
  await page.evaluate(() => ({
    paquetesSel: document.getElementById('tabPaquetes').getAttribute('aria-selected'),
    planesHidden: document.getElementById('panelPlanes').hidden,
    paquetesHidden: document.getElementById('panelPaquetes').hidden
  })),
  { paquetesSel: 'true', planesHidden: true, paquetesHidden: false });
check('el lead cambia al de Paquetes',
  await page.textContent('#upgradeLead'), 'Recarga funciones específicas sin cambiar de plan.');
check('los cinco paquetes, en orden, con el precio exacto construido con Store.money',
  await page.$$eval('#packagesGrid .package-card', cards => cards.map(c => ({
    name: c.querySelector('h2').textContent, price: c.querySelector('.package-price').textContent
  }))),
  await page.evaluate(() => [
    ['25 cotizaciones adicionales', `${Store.money(90000)} COP`],
    ['100 créditos de IA adicionales', `${Store.money(70000)} – ${Store.money(100000)} COP`],
    ['5 GB de almacenamiento adicional', `${Store.money(40000)} COP / mes`],
    ['Usuario adicional', `${Store.money(50000)} COP / mes`],
    ['Sede adicional', `${Store.money(80000)} – ${Store.money(120000)} COP / mes`]
  ].map(([name, price]) => ({ name, price }))));

console.log('\nUPGRADE — las pestañas se navegan con el teclado (flechas activan, no solo mueven el foco)');
await page.focus('#tabPlanes');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(100);
check('flecha derecha activa Paquetes y mueve el foco',
  await page.evaluate(() => ({ active: document.activeElement.id, selected: document.querySelector('[aria-selected="true"]').id })),
  { active: 'tabPaquetes', selected: 'tabPaquetes' });
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(100);
check('flecha izquierda vuelve a Planes',
  await page.evaluate(() => ({ active: document.activeElement.id, selected: document.querySelector('[aria-selected="true"]').id })),
  { active: 'tabPlanes', selected: 'tabPlanes' });
await page.click('#tabPaquetes');
await page.waitForTimeout(100);

console.log('\nUPGRADE — comprar un paquete pide confirmación, y cancelar no suma nada');
page.once('dialog', d => d.dismiss());
await page.click('#packagesGrid [data-package="extra-user"]');
await page.waitForTimeout(150);
check('sin confirmar, no aparece "Comprados" y el conteo sigue en 0',
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('#packagesGrid .package-card')].find(x => x.querySelector('h2').textContent === 'Usuario adicional');
    return { bought: c.querySelector('.package-bought') ? c.querySelector('.package-bought').textContent : null, count: (Store.settings().packages || {})['extra-user'] || 0 };
  }),
  { bought: null, count: 0 });

console.log('\nUPGRADE — confirmar la compra dos veces suma "Comprados: 2", avisa con el toast y persiste');
let pkgDialogMsg = '';
page.once('dialog', d => { pkgDialogMsg = d.message(); d.accept(); });
await page.click('#packagesGrid [data-package="extra-user"]');
await page.waitForTimeout(150);
check('el diálogo menciona el paquete y su precio exacto',
  pkgDialogMsg, `¿Confirmas la compra de Usuario adicional por ${await page.evaluate(() => Store.money(50000))} COP / mes?`);
check('el toast confirma la compra', await page.textContent('#toast'), 'Listo, agregamos Usuario adicional a tu cuenta.');
page.once('dialog', d => d.accept());
await page.click('#packagesGrid [data-package="extra-user"]');
await page.waitForTimeout(150);
check('"Comprados: 2" aparece y el botón sigue activo — es una recarga, no un toggle',
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('#packagesGrid .package-card')].find(x => x.querySelector('h2').textContent === 'Usuario adicional');
    return { bought: c.querySelector('.package-bought').textContent, disabled: c.querySelector('[data-package]').disabled };
  }),
  { bought: 'Comprados: 2', disabled: false });
await page.reload();
await page.waitForSelector('#appShell:not([hidden])');
await page.click('button[data-page="upgrade"]');
await page.click('#tabPaquetes');
await page.waitForTimeout(150);
check('el conteo de compras sobrevive a un recargo de página',
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('#packagesGrid .package-card')].find(x => x.querySelector('h2').textContent === 'Usuario adicional');
    return c.querySelector('.package-bought').textContent;
  }),
  'Comprados: 2');

console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'none'));
console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
