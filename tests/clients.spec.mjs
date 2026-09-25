/* Browser pass for the ACTIVE pack (`CLIENT` in `.env` / the env var): generation succeeds, that
 * client's own branding shows up, its demo admin can log in, nothing from any OTHER client's pack
 * leaks into its output, and the backoffice -> cotizador loop works on its own data.
 *
 * Runs ONCE, on the pack that is loaded — not once per client: the logic is one, and the browser
 * pass is part of it. The per-pack data glance (its brand in its output, no leaks) lives in
 * tests/packs.spec.mjs and takes seconds. Generates into generated-<slug>/ so it never collides
 * with whatever the main suite has generated for `.env`'s client.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { generate } from '../tools/generate.mjs';
import { resolveClient } from '../tools/env.mjs';
import { loadClientPack, listAvailableClients } from '../tools/client-pack.mjs';
import { openAdmin, openWizard, setTags, elegirAtencion } from './helpers.mjs';

const PHOTOS = ['1', '2', '3'].map(n => new URL(`./fixture-sofa-${n}.png`, import.meta.url).pathname);

let fails = 0;
const check = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
};

const ALL_SLUGS = listAvailableClients();
/* El navegador corre UNA vez, sobre el pack ACTIVO (el de `.env`): la misma suite de siempre, sin
 * repetirla por cliente. Lo que es de cada pack —su marca en su salida y que nada de otro pack se
 * cuele— se mira en datos y en segundos: tests/packs.spec.mjs. Se recuerda `mediterranea` solo como
 * una aguja más para el chequeo de filtraciones de abajo. */
const ACTIVO = resolveClient();
const SLUGS = [ACTIVO];

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

/* La regla de arquitectura, comprobada: las TRES PLANTILLAS son las mismas para todos los
 * clientes — el flujo vive en index.html/admin.html/store.js y lo que cambia por cliente son
 * los DATOS del paquete (marca, tema, logo, líneas de servicio). Un dato de cliente escrito en
 * una plantilla rompe esa promesa (y mañana obliga a tocar código por cada cliente nuevo), así
 * que aquí se busca cada marcador de cada paquete dentro de las plantillas, con los COMENTARIOS
 * quitados: un comentario que usa "Macizo" como ejemplo no es una fuga; un valor en el código sí.
 * Los literales de color también cuentan: el tema del paquete llega por variables CSS. */
const stripComments = s => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/^[ \t]*\/\/.*$/gm, ' ');
const TEMPLATES = ['index.html', 'admin.html', 'store.js'].map(f => [f, stripComments(readFileSync(f, 'utf8'))]);
const templateLeaks = [];
for (const slug of ALL_SLUGS) {
  const { client } = loadClientPack(slug.toUpperCase());
  /* Las etiquetas del catálogo son copy del producto (shared/service-lines.json, inyectado por
   * token); lo que un paquete aporta son su marca, su correo y sus namespaces, y eso no puede
   * aparecer literal en una plantilla. */
  const valores = [...markersBySlug[slug], client.senderEmail, client.theme.accent];
  for (const [file, text] of TEMPLATES) {
    for (const v of valores) if (v && text.includes(v)) templateLeaks.push(`${file}: ${JSON.stringify(v)} (de clients/${slug}/)`);
  }
}
console.log('\nLAS PLANTILLAS (HTML/JS) NO LLEVAN NADA DE NINGÚN CLIENTE: ES EL MISMO CÓDIGO PARA TODOS');
check('ninguna plantilla contiene datos de ningún paquete (marca, líneas de servicio, correo, color de acento)',
  templateLeaks, []);

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
    if (otherSlug === slug || otherSlug.toLowerCase() === String(ACTIVO).toLowerCase()) continue;
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

  console.log(`\nEL ADMIN DE ${CLIENT} ABRE UPGRADE (planes estáticos, no datos del cliente) Y CAMBIA DE PLAN`);
  await page.click('button[data-page="upgrade"]');
  check('ve los tres planes', await page.evaluate(() => document.querySelectorAll('#plansGrid .plan-card').length), 3);
  check('en orden Taller, Empresa de muebles, Distribuidor (el nombre del paquete, no el interno)',
    await page.$$eval('#plansGrid .plan-card h2', els => els.map(e => e.textContent)),
    ['Taller', 'Empresa de muebles', 'Distribuidor']);
  check('Essential es el plan actual por defecto', await page.evaluate(() => Store.settings().plan), 'Essential');

  console.log(`\nEL SWITCH DE PERIODO DE ${CLIENT} CAMBIA LOS PRECIOS (styling de modo invertido incluido)`);
  // Upgrade abre en «Configurar mi plan»: el switch de periodo y las tarjetas viven en la pestaña
  // Planes, así que hay que entrar a ella — un elemento oculto no se deja clickear.
  await page.click('#tabPlanes');
  const anualPrices = await page.$$eval('#plansGrid .plan-price', els => els.map(e => e.textContent));
  await page.click('#billingSwitch [data-billing="mensual"]');
  await page.waitForTimeout(150);
  const mensualPrices = await page.$$eval('#plansGrid .plan-price', els => els.map(e => e.textContent));
  check('al menos un precio cambia de Año a Mes', mensualPrices.some((p, i) => p !== anualPrices[i]), true);
  check('la leyenda pasa a "mes a mes, sin contrato"',
    await page.$eval('#plansGrid .plan-billing-caption', e => e.textContent), 'mes a mes, sin contrato');
  await page.click('#billingSwitch [data-billing="anual"]');
  await page.waitForTimeout(150);

  // Plan changes go through an in-app confirm (askConfirm, not a native
  // confirm()) and a simulated-payment invoice — click the confirm, then
  // approve the payment modal, which also exercises both under this pack's
  // color mode (modes/inverted.css for Intertelas).
  await page.click('#plansGrid [data-plan="Professional"]');
  await page.click('#confirmOk');
  await page.waitForSelector('#payModal.open');
  await page.click('#payApprove');
  await page.waitForTimeout(200);
  check('mejorar a Professional lo deja como plan actual', await page.evaluate(() => Store.settings().plan), 'Professional');
  check('la tarjeta de Empresa de muebles queda marcada como actual, con botón deshabilitado',
    await page.evaluate(() => {
      const card = [...document.querySelectorAll('#plansGrid .plan-card')].find(c => c.querySelector('h2').textContent === 'Empresa de muebles');
      const btn = card.querySelector('.plan-cta button');
      return { current: card.classList.contains('current'), cta: btn.textContent, disabled: btn.disabled };
    }),
    { current: true, cta: 'Tu plan actual', disabled: true });

  console.log(`\nEL ADMIN DE ${CLIENT} COMPRA UN PAQUETE DESDE LA PESTAÑA PAQUETES`);
  await page.click('#tabPaquetes');
  await page.waitForTimeout(150);
  check('ve los cinco paquetes', await page.evaluate(() => document.querySelectorAll('#packagesGrid .package-card').length), 5);
  await page.click('#packagesGrid [data-package="extra-site"]');
  await page.click('#confirmOk');
  await page.waitForSelector('#payModal.open');
  await page.click('#payApprove');
  await page.waitForTimeout(200);
  check('comprar una Sede adicional suma "Comprados: 1"',
    await page.evaluate(() => {
      const c = [...document.querySelectorAll('#packagesGrid .package-card')].find(x => x.querySelector('h2').textContent === 'Sede adicional');
      return c.querySelector('.package-bought') ? c.querySelector('.package-bought').textContent : null;
    }),
    'Comprados: 1');

  console.log(`\nEL ADMIN DE ${CLIENT} ABRE USAGE: CINCO MEDIDORES Y EL HISTORIAL`);
  await page.click('button[data-page="usage"]');
  await page.waitForFunction(() => document.querySelectorAll('#usageGrid [role=progressbar]').length === 5, null, { timeout: 5000 }).catch(() => {});
  check('cinco barras de progreso', await page.evaluate(() => document.querySelectorAll('#usageGrid [role=progressbar]').length), 5);
  check('y la tarjeta de historial de analítica', await page.isVisible('#usageGrid [data-metric="historyMonths"]'), true);
  const usageValues = await page.$$eval('#usageGrid .usage-card:has([role=progressbar]) .usage-value', els => els.map(e => e.textContent));
  check('cada valor tiene la forma "<x> de <y>" (sin valores mal formados)',
    usageValues.filter(v => !/^\d+(,\d)?( MB| GB)? de \d+( GB)?$/.test(v)), []);
  check('Sedes suma la Sede adicional comprada al límite de Professional (3 + 1)',
    await page.$eval('#usageGrid [data-metric="locations"] .usage-value', e => e.textContent.endsWith(' de 4')), true);

  console.log(`\nLAS LÍNEAS DE SERVICIO DE ${CLIENT}: LAS PRENDE EL NEGOCIO (el plan ya no las decide)`);
  /* El catálogo es del producto (shared/service-lines.json, que llega al cliente en
   * `serviceLines`) y el paquete no declara ninguna. Desde el modelo v2 el plan NO es la puerta:
   * `requiredPlan` sigue siendo el dato de qué paquete la traía, pero `withinPlan` es siempre
   * verdadero y lo único que apaga una línea es el negocio (`disabledLines`). Aquí no hay nada
   * apagado, así que se ofrecen TODAS las líneas vivas — la misma regla que ya tiene
   * tests/wiring.spec.mjs. */
  const lineasPagina = await page.evaluate(() => ({
    lista: Store.services().map(s => [s.id, s.label, s.requiredPlan, s.enabled]),
    habilitadas: Store.servicesEnabled().map(s => s.id),
  }));
  const vivas = client.serviceLines;
  check('el backoffice lista las líneas vivas del catálogo con su plan de origen, todas dentro',
    lineasPagina.lista,
    vivas.map(s => [s.id, s.label, s.minPlan === 'base' ? 'Essential' : s.minPlan, true]));
  check('y el cotizador habilita exactamente las líneas vivas: el plan no filtra ninguna',
    lineasPagina.habilitadas,
    vivas.map(s => s.id));
  check('la lista del backoffice muestra las líneas habilitadas',
    await page.$$eval('#serviceLines li strong', els => els.map(e => e.textContent)),
    vivas.map(s => s.label));

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
  await openWizard(indexPage, D);
  const headerBg = await indexPage.evaluate(() => getComputedStyle(document.querySelector('.site-header')).backgroundColor);
  const shellBg = await indexPage.evaluate(() => getComputedStyle(document.querySelector('.app-shell')).backgroundColor);
  if (client.colorMode === 'inverted') {
    check('cotizador: el header es blanco (modo inverted)', headerBg, hexToRgbCss('#ffffff'));
    check('cotizador: el panel principal usa theme.ink (modo inverted)', shellBg, hexToRgbCss(client.theme.ink));
  } else {
    check('cotizador: el header usa theme.ink (modo normal)', headerBg, hexToRgbCss(client.theme.ink));
    check('cotizador: el panel principal es blanco (modo normal)', shellBg, hexToRgbCss('#ffffff'));
  }

  /* La pregunta por la línea es un paso CONDICIONAL y PROPIO (el paso 0): con UNA línea
   * habilitada el paso no existe — el cotizador entra derecho al paso 1 y la numeración se
   * queda en 6 — y con dos o más aparece, con la numeración en 7. El plan ya no filtra líneas,
   * pero sí es el nombre que la nota del paso dice ("Tu plan …"), así que se fija a mano para
   * que la comprobación no dependa del plan por defecto de este contexto. */
  await indexPage.evaluate(() => Store.saveSettings({ plan: 'Professional' }));
  await indexPage.reload();
  /* Con el paso de la línea activo, la grilla de muebles (paso 1) está OCULTA: waitForSelector
   * espera visible por defecto, así que se espera cualquiera de los dos — el selector de línea
   * cuando existe, o la grilla cuando no hay paso de línea. */
  await indexPage.waitForSelector('#serviceGrid .service-choice, .piezas-lista .pieza-mueble', { timeout: 10000 });
  const pasoUno = await indexPage.evaluate(() => ({
    habilitadas: Store.servicesEnabled().map(s => s.label),
    paso: !document.querySelector('[data-step-dot="0"]').hidden,
    activo: document.querySelector('.wizard-step.active').dataset.step,
    pasos: document.getElementById('mobileStep').textContent,
    tarjetas: [...document.querySelectorAll('#serviceGrid .service-choice b')].map(e => e.textContent),
    nota: document.getElementById('servicePlanNote').textContent,
  }));
  const esperadasIndex = vivas.map(s => s.label);
  const hayPaso = esperadasIndex.length > 1;
  check('el paso «¿qué quieres hacer?» existe solo con más de una línea, y es su propio paso',
    { paso: pasoUno.paso, activo: pasoUno.activo, pasos: pasoUno.pasos, tarjetas: pasoUno.tarjetas, nota: pasoUno.nota },
    hayPaso ? { paso: true, activo: '0', pasos: 'Paso 1 de 8', tarjetas: esperadasIndex, nota: `Tu plan Empresa de muebles incluye ${esperadasIndex.length} líneas de servicio.` }
            : { paso: false, activo: '1', pasos: 'Paso 1 de 7', tarjetas: [], nota: '' });
  await indexPage.close();

  /* The pack is the brand's DEFAULT: with nothing saved both pages render it
   * untouched, and a color saved in "Configuración de estilos" reaches this
   * pack's own cotizador (header in normal mode, the brand canvas in
   * inverted mode, where the header is white). */
  console.log(`\nLA MARCA POR DEFECTO DE ${CLIENT} SE VE Y UN COLOR GUARDADO LLEGA A SU COTIZADOR`);
  const brandPage = await b.newPage();
  const brandErrs = [];
  brandPage.on('pageerror', e => brandErrs.push(String(e)));
  await openAdmin(brandPage, D);
  // --banner-h lo escribe la propia página; lo que importa es que no haya ninguna variable de marca en línea.
  check('sin estilos guardados no hay nada que aplicar', await brandPage.evaluate(() => [Object.values(Store.brand().overridden).some(Boolean), document.documentElement.style.getPropertyValue('--ink')]), [false, '']);
  await brandPage.click('button[data-page="styles"]');
  await brandPage.waitForSelector('#styles.active #brandContrast .contrast-row');
  check('los defaults del pack se pueden guardar (ningún chequeo propio bloquea)', await brandPage.isDisabled('#saveBrand'), false);
  const BRAND_INK = '#1f3a5f';
  await brandPage.fill('#brandInk', BRAND_INK);
  await brandPage.click('#saveBrand');
  await brandPage.waitForFunction(() => document.getElementById('toast').classList.contains('show'));
  check('el color queda guardado como override', await brandPage.evaluate(() => Store.brandOverrides().colors), { ink: BRAND_INK });
  await openWizard(brandPage, D);
  const brandSurface = client.colorMode === 'inverted' ? '.app-shell' : '.site-header';
  check(`cotizador: ${brandSurface} toma el color guardado`,
    await brandPage.evaluate(s => getComputedStyle(document.querySelector(s)).backgroundColor, brandSurface), hexToRgbCss(BRAND_INK));
  console.log('page errors: ' + (brandErrs.length ? brandErrs.join(' | ') : 'none'));
  if (brandErrs.length) fails++;
  await brandPage.close();

  /* The product claim, per pack: what is typed in the backoffice is what the
   * cotizador shows, and what the customer submits lands in the backoffice.
   * wiring.spec/entities.spec prove it only against Mediterránea's fixtures;
   * this loop uses nothing but names the test itself creates, so it holds for
   * any pack's demo data. */
  console.log(`\nEL BACKOFFICE DE ${CLIENT} ALIMENTA SU COTIZADOR (Y AL REVÉS)`);
  const loop = await b.newPage();
  const loopErrs = [];
  loop.on('pageerror', e => loopErrs.push(String(e)));
  await openWizard(loop, D);
  await loop.evaluate(db => { localStorage.clear(); indexedDB.deleteDatabase(db); }, client.photosDbName);
  const fabricNames = () => loop.$$eval('.fabric-card-body > b', els => els.map(e => e.textContent));
  const toFabricStep = async () => {
    await openWizard(loop, D);
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
  await openWizard(loop, D);
  check('un mueble creado en el backoffice aparece en el cotizador',
    await loop.$$eval('.pieza-mueble option', els => els.map(o => o.value).includes('Puf Prueba')), true);

  await openAdmin(loop, D);
  await loop.click('button[data-page="settings"]');
  await setTags(loop, '#setBudgets', ['30000', '40000', '50000']);
  await loop.click('#saveSettings');
  await openWizard(loop, D);
  check('los rangos de presupuesto del backoffice son los del cotizador',
    await loop.$$eval('#budget option', els => els.map(e => e.value)), ['30000', '40000', '50000', '']);

  await toFabricStep();
  await loop.click('.fabric-card:has-text("Tela Prueba Loop")');
  await loop.click('#nextButton');
  await loop.waitForFunction(()=>state.step===16);   // el paso de la estimación
  await loop.click('#nextButton');
  await loop.waitForFunction(()=>state.step===15);   // cierre: contacto y resumen
  await loop.fill('#fullName', 'Cliente Prueba Loop');
  await loop.fill('#email', 'loop@example.com');
  await loop.fill('#phone', '3001234567');
  await elegirAtencion(loop);
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
  // Closing a quote now goes through the in-app confirm (askConfirm), not a
  // native confirm() — click its "Sí, continuar" button.
  await loop.click('[data-close-status="Aceptada"]');
  await loop.click('#confirmOk');
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
