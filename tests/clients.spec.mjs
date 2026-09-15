/* White-label smoke test for every non-Mediterránea pack (see
 * clients/<slug>/README.md — every value in these packs is invented except
 * the brand itself, sourced from the client's real site). This does not join
 * the main `npm test` chain: that suite is written against
 * clients/mediterranea/'s specific fixtures (seller names, quote counts...)
 * and only makes sense under CLIENT=MEDITERRANEA. This spec instead proves
 * the white-label pipeline itself, for EVERY other pack under clients/:
 * generation succeeds, that client's own branding shows up, its demo admin
 * can log in, nothing from any OTHER client's pack leaks into its output, and
 * the backoffice -> cotizador loop works on that pack's own demo data.
 *
 * Generates each pack into generated-<slug>/ (not generated/) so it never
 * collides with whatever the main suite has generated for CLIENT=MEDITERRANEA.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { generate } from '../tools/generate.mjs';
import { loadClientPack, listAvailableClients } from '../tools/client-pack.mjs';
import { openAdmin, setTags } from './helpers.mjs';

const PHOTOS = ['1', '2', '3'].map(n => new URL(`./fixture-sofa-${n}.png`, import.meta.url).pathname);

let fails = 0;
const check = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
};

const ALL_SLUGS = listAvailableClients();
const SLUGS = ALL_SLUGS.filter(s => s !== 'mediterranea');
if (!SLUGS.length) throw new Error('No non-mediterranea packs found under clients/ to test');

// Every pack's own distinctive markers (never allowed to leak into ANOTHER
// pack's output), collected up front so each pack's checks can assert every
// OTHER pack (including mediterranea) is absent from its own generated files.
// storageNamespace is checked single-quoted (`'med.v1.'`), matching exactly how
// store.js's `var NS = '{{STORAGE_NS}}';` renders it — the bare namespace string
// also appears, harmlessly, inside store.js's own shared migration comment
// (`"med.v1.sellers"`, a prose example predating white-labeling, present in
// EVERY client's output), so an unquoted match would false-positive on that.
const markersBySlug = {};
for (const slug of ALL_SLUGS) {
  const { client, seed } = loadClientPack(slug.toUpperCase());
  markersBySlug[slug] = [client.displayName, `'${client.storageNamespace}'`, seed.settings.senderEmail].filter(Boolean);
}

// #rrggbb -> "rgb(r, g, b)", to compare against getComputedStyle()'s format.
const hexToRgbCss = hex => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const b = await chromium.launch();

for (const slug of SLUGS) {
  const CLIENT = slug.toUpperCase();
  const OUT = `generated-${slug}`;
  console.log(`\n=== ${CLIENT} (clients/${slug}/) ===`);

  generate(CLIENT, OUT);
  const { client, seed } = loadClientPack(CLIENT);
  const D = 'file://' + process.cwd() + '/' + OUT + '/';

  console.log(`\nLA GENERACIÓN PARA ${CLIENT} NO FALLA Y NO DEJA TOKENS SIN RESOLVER`);
  const [indexHtml, adminHtml, storeJs] = ['index.html', 'admin.html', 'store.js'].map(f => readFileSync(`${OUT}/${f}`, 'utf8'));
  check('el índice no tiene {{PLACEHOLDER}} sin resolver', /\{\{\w+\}\}/.test(indexHtml), false);
  check('el backoffice no tiene {{PLACEHOLDER}} sin resolver', /\{\{\w+\}\}/.test(adminHtml), false);
  check('store.js no tiene {{PLACEHOLDER}} sin resolver', /\{\{\w+\}\}/.test(storeJs), false);

  console.log(`\nLA SALIDA DE ${CLIENT} NO FILTRA NINGÚN OTRO CLIENTE`);
  for (const otherSlug of ALL_SLUGS) {
    if (otherSlug === slug) continue;
    for (const marker of markersBySlug[otherSlug]) {
      const leaked = [indexHtml, adminHtml, storeJs].some(html => html.includes(marker));
      check(`no menciona a ${otherSlug} (${JSON.stringify(marker)})`, leaked, false);
    }
  }

  console.log(`\nLA MARCA Y EL TEMA DE ${CLIENT} APARECEN EN LA SALIDA`);
  check('el título usa el nombre del cliente', indexHtml.includes(client.meta.titleIndex), true);
  // Logos across packs may be raster (png/jpeg/webp) or svg+xml - check any
  // embedded data-URI image, not one specific mime type.
  check('el logo está embebido', /data:image\/(svg\+xml|png|jpeg|webp);base64,/.test(indexHtml), true);
  check('el color de acento del cliente está en el tema', indexHtml.includes(`--accent:${client.theme.accent}`), true);

  console.log(`\nEL ADMIN DE DEMO DE ${CLIENT} PUEDE ENTRAR`);
  const admin = seed.users.find(u => u.role === 'admin');
  const page = await b.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(D + 'admin.html');
  await page.fill('#loginEmail', admin.email);
  await page.fill('#loginPassword', client.demoPassword);
  await page.click('#loginSubmit');
  await page.waitForTimeout(350);
  check('entra con las credenciales de demo compartidas', await page.isVisible('#appShell'), true);
  check('ve su propio nombre en el topbar', await page.textContent('#meName'), admin.name);
  console.log('page errors: ' + (errs.length ? errs.join(' | ') : 'none'));
  if (errs.length) fails++;

  console.log(`\nEL COLOR MODE "${client.colorMode}" DE ${CLIENT} SE APLICÓ (topbar/header vs. panel principal)`);
  const topbarBg = await page.evaluate(() => getComputedStyle(document.querySelector('.topbar')).backgroundColor);
  const panelBg = await page.evaluate(() => getComputedStyle(document.querySelector('.panel')).backgroundColor);
  if (client.colorMode === 'inverted') {
    check('admin: el topbar es blanco (modo inverted)', topbarBg, hexToRgbCss('#ffffff'));
    check('admin: el panel principal ya no es blanco (usa el color de marca)', panelBg !== hexToRgbCss('#ffffff'), true);
  } else {
    check('admin: el topbar usa theme.ink (modo normal)', topbarBg, hexToRgbCss(client.theme.ink));
    check('admin: el panel principal es blanco (modo normal)', panelBg, hexToRgbCss('#ffffff'));
  }
  await page.close();

  const indexPage = await b.newPage();
  await indexPage.goto(D + 'index.html');
  const headerBg = await indexPage.evaluate(() => getComputedStyle(document.querySelector('.site-header')).backgroundColor);
  const shellBg = await indexPage.evaluate(() => getComputedStyle(document.querySelector('.app-shell')).backgroundColor);
  if (client.colorMode === 'inverted') {
    check('cotizador: el header es blanco (modo inverted)', headerBg, hexToRgbCss('#ffffff'));
    check('cotizador: el panel principal usa theme.ink (modo inverted)', shellBg, hexToRgbCss(client.theme.ink));
  } else {
    check('cotizador: el header usa theme.ink (modo normal)', headerBg, hexToRgbCss(client.theme.ink));
    check('cotizador: el panel principal es blanco (modo normal)', shellBg, hexToRgbCss('#ffffff'));
  }
  await indexPage.close();

  /* The product claim, per pack: what is typed in the backoffice is what the
   * cotizador shows, and what the customer submits lands in the backoffice.
   * wiring.spec/entities.spec prove it only against Mediterránea's fixtures;
   * this loop uses nothing but names the test itself creates, so it holds for
   * any pack's demo data. */
  console.log(`\nEL BACKOFFICE DE ${CLIENT} ALIMENTA SU COTIZADOR (Y AL REVÉS)`);
  const loop = await b.newPage();
  const loopErrs = [];
  loop.on('pageerror', e => loopErrs.push(String(e)));
  await loop.goto(D + 'index.html');
  await loop.evaluate(db => { localStorage.clear(); indexedDB.deleteDatabase(db); }, client.photosDbName);
  const fabricNames = () => loop.$$eval('.fabric-card-body > b', els => els.map(e => e.textContent));
  const toFabricStep = async () => {
    await loop.goto(D + 'index.html');
    await loop.setInputFiles('#furniturePhoto', PHOTOS);
    await loop.waitForFunction(() => state.photos.length >= 3);
    await loop.click('#nextButton');
    await loop.fill('#width', '210'); await loop.fill('#height', '85'); await loop.fill('#depth', '90');
    await loop.click('#nextButton');
    await loop.click('#nextButton');
    await loop.click('#analyzeButton'); await loop.waitForFunction(() => state.analyzed);
    await loop.click('#nextButton');
  };

  await openAdmin(loop, D);
  await loop.click('button[data-page="fabrics"]');
  await loop.click('#newFabric');
  await loop.fill('#fabricForm [name=name]', 'Tela Prueba Loop');
  await loop.fill('#fabricForm [name=collection]', 'Colección Prueba');
  await loop.fill('#fabricForm [name=price]', '97000');
  await loop.fill('#fabricForm [name=colorName]', 'Humo');
  await loop.click('#fabricForm button.primary');
  await toFabricStep();
  check('una tela creada en el backoffice aparece en el cotizador',
    (await fabricNames()).some(n => n.includes('Tela Prueba Loop')), true);
  await loop.click('.fabric-card:has-text("Tela Prueba Loop")');
  check('y el cotizador la cotiza al precio del backoffice',
    (await loop.textContent('.fabric-card.selected .fabric-card-body small')).includes(await loop.evaluate(() => Store.money(97000))), true);

  await openAdmin(loop, D);
  await loop.click('button[data-page="furniture"]');
  await loop.click('#newFurniture');
  const F = '#furnitureForm ';
  for (const [name, value] of Object.entries({ name: 'Puf Prueba', icon: '●', hint: 'Individual', metersMin: '2', metersMax: '3',
    quantityLabel: 'Cantidad de pufs', unitOne: 'puf', unitMany: 'pufs', wMin: '40', wMax: '90', hMin: '30', hMax: '60', dMin: '40', dMax: '90', order: '7' })) {
    await loop.fill(`${F}[name=${name}]`, value);
  }
  await loop.click(F + 'button.primary');
  await loop.goto(D + 'index.html');
  check('un mueble creado en el backoffice aparece en el cotizador',
    await loop.$$eval('.furniture-card', els => els.map(c => c.dataset.furniture).includes('Puf Prueba')), true);

  await openAdmin(loop, D);
  await loop.click('button[data-page="settings"]');
  await setTags(loop, '#setBudgets', ['30000', '40000', '50000']);
  await loop.click('#saveSettings');
  await loop.goto(D + 'index.html');
  check('los rangos de presupuesto del backoffice son los del cotizador',
    await loop.$$eval('#budget option', els => els.map(e => e.value)), ['30000', '40000', '50000', '']);

  await toFabricStep();
  await loop.click('.fabric-card:has-text("Tela Prueba Loop")');
  await loop.click('#nextButton');
  await loop.fill('#fullName', 'Cliente Prueba Loop');
  await loop.fill('#email', 'loop@example.com');
  await loop.fill('#phone', '3001234567');
  await loop.check('#consent');
  await loop.click('#nextButton');
  await loop.waitForSelector('#successState:not([hidden])');
  const quoteId = (await loop.textContent('#requestNumber')).trim();
  await openAdmin(loop, D);
  await loop.click('button[data-page="quotes"]');
  const rows = await loop.textContent('#quoteRows');
  check('una cotización enviada desde el cotizador llega al backoffice', rows.includes(quoteId), true);
  check('con el cliente y la tela elegida', rows.includes('Cliente Prueba Loop') && rows.includes('Tela Prueba Loop'), true);

  await loop.click('button[data-page="fabrics"]');
  await loop.click('article:has-text("Tela Prueba Loop") [data-toggle-fabric]');
  await toFabricStep();
  check('desactivar la tela en el backoffice la saca del cotizador',
    (await fabricNames()).some(n => n.includes('Tela Prueba Loop')), false);

  console.log(`\nEL CICLO DE LA COTIZACIÓN CIERRA EN ${CLIENT} (estado final bloqueado + comentario visible)`);
  await openAdmin(loop, D);
  await loop.click('button[data-page="quotes"]');
  await loop.click(`[data-quote="${quoteId}"]`);
  await loop.waitForSelector('#quoteModal.open');
  await loop.click('[data-set-status="Cotizada"]');
  await loop.waitForSelector('#quoteStatusControl [data-close-status="Aceptada"]');
  loop.once('dialog', d => d.accept());
  await loop.click('[data-close-status="Aceptada"]');
  await loop.waitForSelector('#quoteStatusControl [data-set-status]', { state: 'detached' });
  check('el estado queda en Aceptada, cerrado, y sin controles para volver a cambiarlo',
    await loop.evaluate(id => { const q = Store.get('quotes', id.trim()); return [q.status, !!q.closedAt]; }, quoteId),
    ['Aceptada', true]);
  await loop.fill('#commentText', 'Cierre validado en la prueba de blanqueo.');
  await loop.click('#commentForm button[type=submit]');
  await loop.waitForFunction(id => (Store.get('quotes', id.trim()).comments || []).length === 1, quoteId);
  await loop.waitForSelector('#quoteComments .activity li');
  check('el comentario agregado tras el cierre es visible, con autor y fecha',
    (await loop.textContent('#quoteComments')).includes('Cierre validado en la prueba de blanqueo.'), true);

  console.log('page errors: ' + (loopErrs.length ? loopErrs.join(' | ') : 'none'));
  if (loopErrs.length) fails++;
  await loop.close();
}

await b.close();

console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
process.exit(fails ? 1 : 0);
