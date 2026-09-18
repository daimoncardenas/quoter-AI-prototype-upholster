/* El catálogo de puntos de atención que alimenta el "Punto de atención" del
 * cotizador: las cuatro tiendas reales del cliente activo (clients/mediterranea/
 * por defecto), agrupadas por ciudad
 * en el desplegable. Antes cada vendedor escribía sus zonas como texto libre
 * y el selector salía de la unión de esos textos; ahora el backoffice
 * administra los puntos y los vendedores los cubren por id, igual que ya
 * pasaba con sellerId en quotes. */
import { chromium } from 'playwright';
import { client, PHOTOS_DB, userEmail, emailFor } from './client.mjs';
import { openAdmin, openWizard } from './helpers.mjs';
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
async function wizardTo(step, opts = {}) {
  await page.setInputFiles('#furniturePhoto', png);
  await page.waitForFunction(() => state.photos.length >= 3);
  if (step >= 2) await page.click('#nextButton');
  if (step >= 3) { await page.fill('#width','210'); await page.fill('#height','85'); await page.fill('#depth','90'); await page.click('#nextButton'); }
  if (step >= 4) { if (opts.city) await page.selectOption('#city', opts.city); await page.click('#nextButton'); }
  if (step >= 5) { await page.click('#analyzeButton'); await page.waitForFunction(() => state.analyzed); await page.click('#nextButton'); }
  if (step >= 6) await page.click('#nextButton');
}
/* Envía una cotización completa eligiendo el punto dado (por value o por
 * label), sin tocar el store previo — así una escena puede montarse sobre lo
 * que dejó la anterior. */
async function submitQuote(cityOption) {
  await openWizard(page, D);
  await wizardTo(5, { city: cityOption });
  await page.click('#fabricGrid .fabric-card:nth-child(1)');
  await page.click('#nextButton');
  await page.fill('#fullName','Cliente Prueba');
  await page.fill('#email','prueba@example.com');
  await page.fill('#phone','3000000000');
  await page.check('#consent');
  await page.click('#nextButton');
  await page.waitForSelector('#successState:not([hidden])');
  return (await page.textContent('#requestNumber')).trim();
}
const cityOptionTexts = () => page.$$eval('#city option', els => els.map(o => o.textContent));
const cityGroups = () => page.$$eval('#city optgroup', gs => gs.map(g => ({
  label: g.label, options: [...g.querySelectorAll('option')].map(o => o.textContent)
})));
// El texto de advertencia se repite si varios puntos la muestran a la vez, así
// que hay que mirar la fila del punto en cuestión, no la tabla entera.
const pointRowText = id => page.$eval(`[data-edit-point="${id}"]`, el => el.closest('tr').textContent);
async function newPoint(name, city) {
  await page.click('button[data-page="points"]');
  await page.click('#newPoint');
  await page.fill('#pointForm [name=name]', name);
  await page.fill('#pointForm [name=city]', city);
  await page.click('#pointForm button.primary');
  return page.evaluate(n => Store.all('servicePoints').find(p => p.name === n).id, name);
}

console.log('\nLOS CUATRO PUNTOS SE AGRUPAN POR CIUDAD, Y "OTRA CIUDAD" QUEDA AL FINAL');
await fresh('index.html');
check('el grupo de Bogotá trae las tres tiendas, en orden',
  await cityGroups(),
  [
    { label: 'Bogotá', options: ['12 de Octubre','Patio Bonito','Primera de Mayo'] },
    { label: 'Cali', options: ['Cali'] }
  ]);
const cityOptions = await page.$$eval('#city option', els => els.map(o => ({ text: o.textContent, value: o.value })));
check('"Otra ciudad" es la última opción, fuera de los grupos', cityOptions[cityOptions.length - 1].text, 'Otra ciudad');
check('y no lleva id de punto de atención', cityOptions[cityOptions.length - 1].value, '');
const otraId = await submitQuote('Otra ciudad');
check('la solicitud queda sin punto de atención',
  await page.evaluate(id => Store.get('quotes', id).servicePointId, otraId), '');
check('y sin vendedor asignado',
  await page.evaluate(id => Store.get('quotes', id).sellerId, otraId), '');
check('la pantalla de éxito no promete un asesor',
  (await page.textContent('#successSeller')).trim(), '');

console.log('\nLA SOLICITUD GUARDA "CIUDAD · PUNTO", NO SOLO EL NOMBRE DEL PUNTO');
const caliQuoteId = await submitQuote('Cali');
check('la etiqueta combina ciudad y punto',
  await page.evaluate(id => Store.get('quotes', id).city, caliQuoteId), 'Cali · Cali');
await openAdmin(page, D);
await page.click('button[data-page="quotes"]');
check('y el backoffice la muestra así', (await page.textContent('#quoteRows')).includes('Cali · Cali'), true);

console.log('\nCREAR UN PUNTO -> APARECE; PAUSARLO -> DESAPARECE; EL ORDEN LO REORDENA');
await fresh('admin.html');
const auroraId = await newPoint('Zona Aurora', 'Ciudad Aurora');
check('el backoffice confirma que el cotizador ya lo usa',
  (await page.textContent('#toast')).includes('cotizador'), true);

await openWizard(page, D);
check('el punto nuevo aparece en el selector, con su propia ciudad como grupo',
  (await cityGroups()).some(g => g.label === 'Ciudad Aurora' && g.options.includes('Zona Aurora')), true);

await openAdmin(page, D);
await page.click('button[data-page="points"]');
await page.click(`[data-edit-point="${auroraId}"]`);
await page.selectOption('#pointForm [name=active]', 'false');
await page.click('#pointForm button.primary');
await openWizard(page, D);
check('pausarlo lo saca del selector', (await cityOptionTexts()).includes('Zona Aurora'), false);

await openAdmin(page, D);
await page.click('button[data-page="points"]');
// 12 de Octubre (orden 1) y Patio Bonito (orden 2) intercambian su orden
// dentro del mismo grupo de Bogotá.
await page.click('[data-edit-point="sp-12-de-octubre"]');
await page.fill('#pointForm [name=order]', '2');
await page.click('#pointForm button.primary');
await page.click('[data-edit-point="sp-patio-bonito"]');
await page.fill('#pointForm [name=order]', '1');
await page.click('#pointForm button.primary');
await openWizard(page, D);
const bogotaGroup = (await cityGroups()).find(g => g.label === 'Bogotá');
check('cambiar el orden reordena el grupo', bogotaGroup.options, ['Patio Bonito','12 de Octubre','Primera de Mayo']);

console.log('\nSIN VENDEDOR ACTIVO AVISA; VINCULAR UNO LO QUITA; Y ASIGNA LA SOLICITUD');
await openAdmin(page, D);
const multiId = await newPoint('Zona Multi', 'Ciudad Multi');
check('un punto activo sin vendedor muestra la advertencia',
  (await pointRowText(multiId)).includes('Sin vendedor activo'), true);

await page.click('button[data-page="sellers"]');
await page.click('[data-edit-seller="1"]');   // Laura Méndez
await page.check(`#sellerPointChecks input[value="${multiId}"]`);
await page.click('#sellerForm button.primary');
await page.click('button[data-page="points"]');
check('vincular un vendedor activo quita la advertencia',
  (await pointRowText(multiId)).includes('Sin vendedor activo'), false);

const multiQuoteId = await submitQuote('Zona Multi');
check('la solicitud se asigna automáticamente al vendedor que cubre el punto',
  await page.evaluate(id => { const q = Store.get('quotes', id); return [q.sellerId, q.servicePointId]; }, multiQuoteId),
  [1, multiId]);
check('y la pantalla de éxito lo dice', (await page.textContent('#successSeller')).includes('Laura Méndez'), true);

console.log('\nRENOMBRAR UN PUNTO PROPAGA AL SELECTOR Y A LAS SOLICITUDES, SIN DESVINCULAR AL VENDEDOR');
await openAdmin(page, D);
await page.click('button[data-page="points"]');
await page.click(`[data-edit-point="${multiId}"]`);
await page.fill('#pointForm [name=name]', 'Zona Multi Renombrada');
await page.click('#pointForm button.primary');

await openWizard(page, D);
const renamedOptions = await cityOptionTexts();
check('el selector muestra el nombre nuevo', renamedOptions.includes('Zona Multi Renombrada'), true);
check('y ya no el viejo', renamedOptions.includes('Zona Multi'), false);
check('el vendedor sigue vinculado por id, no por nombre',
  await page.evaluate(id => Store.get('sellers', 1).servicePointIds.includes(id), multiId), true);

await openAdmin(page, D);
await page.click('button[data-page="quotes"]');
check('la solicitud ya enviada muestra el nombre nuevo en el backoffice',
  (await page.textContent('#quoteRows')).includes('Ciudad Multi · Zona Multi Renombrada'), true);

console.log('\nELIMINAR UN PUNTO LO QUITA DE LOS VENDEDORES Y DEL SELECTOR');
const borrarId = await newPoint('Zona Borrar', 'Ciudad Borrar');
await page.click('button[data-page="sellers"]');
await page.click('[data-edit-seller="2"]');   // Andrés Rojas
await page.check(`#sellerPointChecks input[value="${borrarId}"]`);
await page.click('#sellerForm button.primary');
check('Andrés queda cubriendo el punto antes de borrarlo',
  await page.evaluate(id => Store.get('sellers', 2).servicePointIds.includes(id), borrarId), true);

await page.click('button[data-page="points"]');
await page.click(`[data-edit-point="${borrarId}"]`);
await page.click('#deletePoint');
// Deleting now opens the in-app confirm modal (askConfirm) instead of a
// native confirm() — click its "Sí, continuar" button.
await page.click('#confirmOk');
check('la ficha del vendedor pierde esa cobertura',
  await page.evaluate(id => Store.get('sellers', 2).servicePointIds.includes(id), borrarId), false);
await openWizard(page, D);
check('y desaparece del selector', (await cityOptionTexts()).includes('Zona Borrar'), false);

console.log('\nUN NAVEGADOR CON ZONAS DE TEXTO LIBRE MIGRA A PUNTOS POR ID');
await openWizard(page, D);
await page.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
await page.evaluate(({ ns, lauraEmail, customEmail }) => {
  // Forma antigua y ningún <ns>servicePoints — dispara la migración en el
  // primer read. Dos casos a la vez:
  //  - el id 1 coincide con una vendedora semilla (Laura) y sus zonas son
  //    puros nombres de las demo placeholder (con acento y mayúsculas
  //    distintas): debe quedar con la cobertura REAL de esa semilla
  //    (sp-12-de-octubre), no con un punto inventado "Bogotá Norte".
  //  - el id 103 NO es una vendedora semilla, y sus zonas son ['Chía',
  //    'Medellín'] — nombres que SÍ están en la lista de placeholders, pero
  //    la lista solo aplica a las cuatro semillas originales. Para este
  //    vendedor esos nombres son lugares reales que escribió, así que ambos
  //    deben sobrevivir como puntos nuevos y NO desaparecer en silencio.
  localStorage.setItem(ns + 'sellers', JSON.stringify([
    { id: 1, name: 'Laura Méndez', email: lauraEmail,
      zones: ['bogota norte'], active: true, quotes: 0 },
    { id: 103, name: 'Vendedor Custom', email: customEmail,
      zones: ['Chía', 'Medellín'], active: true, quotes: 0 }
  ]));
}, { ns: client.storageNamespace, lauraEmail: userEmail('u-laura'), customEmail: emailFor('custom') });
await openWizard(page, D);
const pointNamesAfterMigration = await page.evaluate(() => Store.all('servicePoints').map(p => p.name));
check('"Bogotá Norte" nunca se crea: solo la tenía una vendedora semilla, y esa se resuelve por su cobertura real',
  pointNamesAfterMigration.includes('Bogotá Norte'), false);
check('pero "Chía" y "Medellín" sí se crean: las tenía un vendedor NO semilla, para quien no son placeholders',
  ['Chía','Medellín'].every(n => pointNamesAfterMigration.includes(n)), true);
check('el total son los 4 puntos reales más los 2 que aportó el vendedor no-semilla',
  pointNamesAfterMigration.length, 6);
check('ningún vendedor conserva "zones"',
  await page.evaluate(() => Store.all('sellers').every(s => !('zones' in s))), true);
check('la vendedora semilla con solo placeholders recupera su cobertura real',
  await page.evaluate(() => Store.get('sellers', 1).servicePointIds), ['sp-12-de-octubre']);
const [chiaId, medellinId] = await page.evaluate(() => {
  const points = Store.all('servicePoints');
  return ['Chía','Medellín'].map(n => points.find(p => p.name === n).id);
});
check('el vendedor no-semilla queda con AMBOS puntos, no perdió cobertura',
  (await page.evaluate(() => Store.get('sellers', 103).servicePointIds)).slice().sort(),
  [chiaId, medellinId].sort());

const legacyQuoteId = await submitQuote('Chía');
check('la asignación automática funciona sobre datos migrados',
  await page.evaluate(id => Store.get('quotes', id).sellerId, legacyQuoteId), 103);

console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'none'));
console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
