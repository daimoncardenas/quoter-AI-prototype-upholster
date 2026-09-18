import { chromium } from 'playwright';
import { PHOTOS_DB } from './client.mjs';
import { openAdmin, openWizard } from './helpers.mjs';
const D = 'file://' + process.cwd() + '/generated/';
const F = n => new URL(`./fixture-sofa-${n}.png`, import.meta.url).pathname;
const TRES = ['1','2','3'].map(F);
// 463×259: por debajo del umbral de 600 px que marca runReview(). Vive en el
// repo a propósito — antes apuntaba a una caché fuera del proyecto y se rompía
// sola cuando esa caché se limpiaba.
const CHICA = F('baja');
let fails = 0;
const check = (n, got, want) => { const ok = JSON.stringify(got)===JSON.stringify(want); if(!ok)fails++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${n}` + (ok?'':`\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)); };
const b = await chromium.launch(); const page = await b.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
const fresh = async () => { await page.goto(D+'index.html');
  await page.evaluate((db)=>{localStorage.clear();indexedDB.deleteDatabase(db)}, PHOTOS_DB);
  await openWizard(page, D); };
// Wait for the count to GROW, not just to reach files.length — a second upload
// onto an already-full-enough strip would otherwise satisfy the wait instantly
// and assert before FileReader finished.
const subir = async files => {
  const antes = await page.evaluate(()=>state.photos.length);
  const max = await page.evaluate(()=>photoLimits().max);
  const meta = Math.min(antes + files.length, max);
  await page.setInputFiles('#furniturePhoto', files);
  await page.waitForFunction(n=>state.photos.length>=n, meta, {timeout:5000}).catch(()=>{}); };

console.log('\nEL MÍNIMO SON 3 FOTOS');
await fresh();
check('arranca sin fotos', await page.evaluate(()=>state.photos.length), 0);
await subir([F('1')]);
await page.click('#nextButton');
check('con 1 no deja avanzar', await page.evaluate(()=>state.step), 1);
check('y dice cuántas faltan', await page.textContent('#photoError'), 'Agrega 2 fotos más: necesitamos al menos 3.');
await subir([F('2')]);
await page.click('#nextButton');
check('con 2 tampoco', await page.evaluate(()=>state.step), 1);
check('el mensaje se ajusta', await page.textContent('#photoError'), 'Agrega 1 foto más: necesitamos al menos 3.');
await subir([F('3')]);
check('el error se limpia al llegar al mínimo', await page.isVisible('#photoError'), false);
await page.click('#nextButton');
check('con 3 avanza', await page.evaluate(()=>state.step), 9);

console.log('\nEL MÁXIMO SON 7');
await fresh();
await subir(['1','2','3','1','2','3','1','2','3'].map(F));      // 9 de una
check('recorta al máximo configurado', await page.evaluate(()=>state.photos.length), 7);
check('y lo explica', (await page.textContent('#photoError')).includes('el máximo es 7'), true);
check('el contador lo muestra', await page.textContent('.photo-count'), '7 de 7');
check('deshabilita el botón de seleccionar', await page.isDisabled('#selectPhoto'), true);
await page.setInputFiles('#furniturePhoto', [F('1')]);
await page.waitForTimeout(250);
check('un intento extra no suma', await page.evaluate(()=>state.photos.length), 7);
check('y avisa por qué', (await page.textContent('#photoError')).includes('Ya alcanzaste el máximo'), true);

console.log('\nSE PUEDEN QUITAR');
check('hay 7 miniaturas', await page.evaluate(()=>document.querySelectorAll('.photo-thumb').length), 7);
await page.click('.photo-thumb button');
check('quitar una deja 6', await page.evaluate(()=>state.photos.length), 6);
check('el botón vuelve a habilitarse', await page.isDisabled('#selectPhoto'), false);
check('el contador acompaña', await page.textContent('.photo-count'), '6 de 7');

console.log('\nEL PASO 4 REPORTA EL CONJUNTO');
await fresh();
await subir(TRES);
await page.click('#nextButton');
await page.fill('#width','210');await page.fill('#height','85');await page.fill('#depth','90');
await page.click('#nextButton'); await page.click('#nextButton');
check('el resumen cuenta las fotos',
  (await page.textContent('#aiSummary')).includes('3 adjuntas'), true);
await page.click('#analyzeButton'); await page.waitForFunction(()=>state.analyzed);
check('el chequeo habla de las 3',
  await page.textContent('#analysisChecks div:first-child b'), '3 fotografías recibidas');
check('y confirma la resolución', await page.evaluate(()=>runReview()[0].ok), true);

console.log('\nUNA DE BAJA RESOLUCIÓN ENTRE VARIAS');
await fresh();
await subir([F('1'), F('2'), CHICA]);
await page.click('#nextButton');
await page.fill('#width','210');await page.fill('#height','85');await page.fill('#depth','90');
await page.click('#nextButton'); await page.click('#nextButton');
await page.click('#analyzeButton'); await page.waitForFunction(()=>state.analyzed);
check('la señala sin descartar el resto', await page.evaluate(()=>{
  const c=runReview()[0];
  return !c.ok && c.detail.includes('463×259') && c.title.startsWith('3 ');}), true);

console.log('\nTODAS LLEGAN AL BACKOFFICE');
await fresh();
await subir(TRES);
await page.click('#nextButton');
await page.fill('#width','210');await page.fill('#height','85');await page.fill('#depth','90');
await page.click('#nextButton'); await page.click('#nextButton');
await page.click('#analyzeButton'); await page.waitForFunction(()=>state.analyzed);
await page.click('#nextButton'); await page.click('#nextButton');
await page.waitForFunction(()=>state.step===16);   // el paso de la estimación
await page.click('#nextButton');
await page.waitForFunction(()=>state.step===15);   // cierre: contacto y resumen
await page.fill('#fullName','Natalia Peña');await page.fill('#email','n@example.com');
await page.fill('#phone','3001234567');await page.check('#consent');
await page.click('#nextButton');
await page.waitForSelector('#successState:not([hidden])');
const id = await page.textContent('#requestNumber');
check('la cotización guarda 3 ids de foto',
  await page.evaluate(i=>(Store.get('quotes',i).photoIds||[]).length, id), 3);
await openAdmin(page, D);
await page.click('button[data-page="quotes"]');
await page.click(`[data-quote="${id}"]`);
await page.waitForSelector('#quoteModal.open');
await page.waitForTimeout(400);
check('el detalle muestra las 3',
  await page.evaluate(()=>document.querySelectorAll('#quoteDetail .quote-gallery img').length), 3);

console.log('\nLAS FOTOS SE ABREN EN GRANDE — y la que falta se nombra');
/* La miniatura de 118 px no deja leer un daño, y hasta ahora el clic sobre la foto no hacía nada. */
await page.click('#quoteDetail .quote-gallery button[data-photo="0"]');
await page.waitForSelector('#photoModal.open');
const primera = await page.evaluate(() => ({
  src: document.getElementById('photoModalImg').src,
  counter: document.getElementById('photoCounter').textContent,
  alt: document.getElementById('photoModalImg').alt,
  focoEnCierre: document.activeElement === document.querySelector('#photoModal [data-close]'),
}));
check('la primera foto se abre en grande, con su contador y el foco en el cierre',
  [primera.src.startsWith('data:image/'), primera.counter, primera.alt.includes('COT-'), primera.focoEnCierre],
  [true, '1 / 3', true, true]);
await page.click('#photoNext');
check('«Siguiente» pasa a la segunda sin cerrar nada',
  await page.evaluate(() => document.getElementById('photoCounter').textContent), '2 / 3');
await page.keyboard.press('ArrowRight');
check('y el teclado también', await page.evaluate(() => document.getElementById('photoCounter').textContent), '3 / 3');
check('en la última, «Siguiente» se apaga', await page.isDisabled('#photoNext'), true);
await page.keyboard.press('Escape');
check('Esc cierra el visor y deja el detalle abierto',
  await page.evaluate(() => ({
    visor: document.getElementById('photoModal').classList.contains('open'),
    detalle: document.getElementById('quoteModal').classList.contains('open'),
  })), { visor: false, detalle: true });
/* Una foto que ya no está en este navegador no desaparece de la galería: se nombra. */
await page.evaluate(async (qid) => {
  const q = Store.get('quotes', qid.trim());
  await Photos.remove(q.photoIds[1]);
}, id);
await page.click('#quoteModal [data-close]');
await page.click(`[data-quote="${id}"]`);
await page.waitForSelector('#quoteModal.open');
await page.waitForTimeout(400);
check('el hueco de la que falta se explica y la galería conserva el orden',
  await page.$$eval('#quoteDetail .quote-gallery > *', els => els.map(e => e.tagName === 'BUTTON' ? 'foto' : 'hueco')),
  ['foto', 'hueco', 'foto']);
check('y el detalle dice cuántas faltan',
  await page.$$eval('#quoteDetail .modal-hint', els => els.some(e => /1 de 3 fotografías no están en este navegador/.test(e.textContent))), true);
check('quedan dos botones, cada uno abre la suya', await page.$$eval('#quoteDetail .quote-gallery button', els => els.length), 2);

console.log('\nEL RANGO ES CONFIGURABLE');
await page.click('#quoteModal [data-close]');
// fresh() limpia localStorage, así que los ajustes van después, no antes
await fresh();
await page.evaluate(()=>Store.saveSettings({minPhotos:2,maxPhotos:4}));
await subir([F('1'), F('2')]);
await page.click('#nextButton');
check('con el mínimo en 2, dos alcanzan', await page.evaluate(()=>state.step), 9);
await page.click('#backButton');
await subir(['3','1'].map(F));
check('y el máximo en 4 se respeta', await page.evaluate(()=>state.photos.length), 4);
await page.setInputFiles('#furniturePhoto', [F('2')]);
await page.waitForTimeout(250);
check('no acepta una quinta', await page.evaluate(()=>state.photos.length), 4);

console.log('\nerrores de pagina: ' + (errs.length?errs.join(' | '):'ninguno'));
console.log(fails?`\n${fails} FALLAN`:'\nTODO PASA');
await b.close(); process.exit(fails?1:0);
