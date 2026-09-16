/* "Configuración de estilos": the runtime brand layer (store.js Store.brand /
 * Store.saveBrand / Brand.apply) edited from the backoffice. Proves that the
 * pack's look is only the DEFAULT (nothing saved -> nothing touched), that a
 * saved brand repaints BOTH pages, that the contrast guard and the logo
 * re-encoding hold, that fonts and the header variant are plan-gated (and a
 * downgrade ignores them without deleting them), and that both resets
 * restore the pack defaults. Written against whichever pack generated/ holds
 * (CLIENT=MEDITERRANEA under `npm test`): every expected pack value is read
 * from tests/client.mjs, never hardcoded. */
import { chromium } from 'playwright';
import { client, userEmail } from './client.mjs';
import { openAdmin } from './helpers.mjs';

const D = 'file://' + process.cwd() + '/generated/';
const LOGO_PNG = new URL('./fixture-sofa-1.png', import.meta.url).pathname;
const LOGO_SVG = new URL('./fixture-logo-script.svg', import.meta.url).pathname;
const BRAND_KEY = client.storageNamespace + 'brand';
const INVERTED = client.colorMode === 'inverted';

let fails = 0;
const check = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
};
const rgb = hex => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const WHITE = 'rgb(255, 255, 255)';
const bgOf = (p, sel) => p.evaluate(s => getComputedStyle(document.querySelector(s)).backgroundColor, sel);
const openStyles = async p => {
  await openAdmin(p, D);
  await p.click('button[data-page="dashboard"]');
  await p.click('button[data-page="styles"]');
  await p.waitForSelector('#styles.active #brandContrast .contrast-row');
};
const save = async p => {
  await p.click('#saveBrand');
  await p.waitForFunction(() => document.getElementById('toast').classList.contains('show'));
  // El puntero queda sobre el botón (que tiene :hover propio) y .button lleva
  // transition:.2s, así que un color leído aquí mismo sale a mitad de camino.
  await p.mouse.move(1, 1);
  await p.waitForTimeout(400);
};

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto(D + 'admin.html');
await page.evaluate(() => localStorage.clear());

console.log('\nSIN ESTILOS GUARDADOS, AMBAS PÁGINAS SON EXACTAMENTE LA MARCA DEL PAQUETE');
await openAdmin(page, D);
check('el topbar del backoffice usa el color del paquete',
  await bgOf(page, '.topbar'), INVERTED ? WHITE : rgb(client.theme.ink));
// La página escribe --banner-h/--actions-h por su cuenta, así que lo que se
// comprueba es que Brand.apply no dejó NINGUNA variable de marca en línea.
check('Brand.apply no escribió ninguna variable de marca',
  await page.evaluate(() => ['--ink', '--accent', '--font-heading', '--tint-panel-wash', '--print-watermark'].map(v => document.documentElement.style.getPropertyValue(v))), ['', '', '', '', '']);
check('no hay estilos guardados', await page.evaluate(key => localStorage.getItem(key), BRAND_KEY), null);
check('el nav dice "Configuraciones de cotizador" (data-page="settings" se mantiene)',
  await page.$eval('button[data-page="settings"]', btn => btn.lastChild.textContent), 'Configuraciones de cotizador');
check('y la página de settings se titula igual', await page.textContent('#settings .page-head h1'), 'Configuraciones de cotizador');
check('"Configuración de estilos" va justo después, con su ícono',
  await page.$$eval('.nav button', bs => { const i = bs.findIndex(x => x.dataset.page === 'settings'); return [bs[i + 1].dataset.page, bs[i + 1].lastChild.textContent, bs[i + 1].querySelector('.nav-icon').textContent]; }),
  ['styles', 'Configuración de estilos', '◐']);
await page.goto(D + 'index.html');
check('el header del cotizador usa el color del paquete',
  await bgOf(page, '.site-header'), INVERTED ? WHITE : rgb(client.theme.ink));
check('el título del cotizador es el del paquete', await page.title(), client.meta.titleIndex);

console.log('\nLA SECCIÓN SE PRESENTA COMO SE ESPERA');
await openStyles(page);
check('eyebrow, título y texto', await page.evaluate(() => [...document.querySelectorAll('#styles .page-head .eyebrow, #styles .page-head h1, #styles .page-head p')].map(e => e.textContent)),
  ['MARCA', 'Configuración de estilos', 'Personaliza la apariencia de tu cotizador. Los cambios se aplican al cotizador y al backoffice.']);
check('los cuatro grupos del formulario', await page.$$eval('#styles .styles-form .settings-card h2', els => els.map(e => e.textContent)),
  ['Identidad', 'Colores', 'Tipografía', 'Encabezado']);
check('arranca con el nombre y los colores del paquete',
  await page.evaluate(() => [document.getElementById('brandName').value, document.getElementById('brandInk').value, document.getElementById('brandAccent').value]),
  [client.displayName, client.theme.ink.toLowerCase(), client.theme.accent.toLowerCase()]);
check('los defaults del paquete se pueden guardar tal cual (nada bloquea)', await page.isDisabled('#saveBrand'), false);
check('"Ver cotizador" abre el cotizador en otra pestaña',
  await page.$eval('#styles .styles-link', a => [a.getAttribute('href'), a.target, a.textContent]), ['index.html', '_blank', 'Ver cotizador ↗']);

console.log('\nGUARDAR COLORES VÁLIDOS REPINTA EL BACKOFFICE Y EL COTIZADOR');
const INK = '#1f3a5f', ACCENT = '#9c3d10';
await page.fill('#brandInk', INK);
await page.fill('#brandAccent', ACCENT);
check('la vista previa cambia sin guardar', await page.$eval('#brandPreview', el => el.style.getPropertyValue('--pv-ink')), INK);
check('pero el backoffice todavía no', await bgOf(page, '.topbar'), INVERTED ? WHITE : rgb(client.theme.ink));
check('la paleta derivada se muestra', await page.$$eval('#brandSwatches li', els => els.length), 10);
check('el color principal elegido encabeza la paleta', await page.$eval('#brandSwatches li small', e => e.textContent), INK);
await save(page);
check('el toast confirma', await page.textContent('#toast'), 'Estilos guardados. El cotizador ya usa tu marca.');
check('se guardaron solo los dos colores como overrides',
  await page.evaluate(key => JSON.parse(localStorage.getItem(key)), BRAND_KEY), { colors: { ink: INK, accent: ACCENT } });
if (!INVERTED) {
  check('backoffice: el topbar toma el nuevo principal', await bgOf(page, '.topbar'), rgb(INK));
  check('backoffice: el botón principal también', await bgOf(page, '#saveBrand'), rgb(INK));
} else {
  check('backoffice (invertido): el panel de la sección toma el nuevo principal', await bgOf(page, '.settings-card'), await page.evaluate(() => getComputedStyle(document.querySelector('.settings-card')).backgroundColor));
}
const derived = await page.evaluate(([i, a]) => Store.derivePalette(i, a), [INK, ACCENT]);
check('las tintas se derivan con la función documentada (--tint-panel-wash)',
  await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tint-panel-wash').trim()), derived.tints.panelWash);
await page.goto(D + 'index.html');
check('cotizador: el header toma el nuevo principal', await bgOf(page, INVERTED ? '.app-shell' : '.site-header'), rgb(INK));
check('cotizador: el botón Continuar también', await bgOf(page, '#nextButton'), rgb(INK));
check('cotizador: el acento llega a su variable', await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()), ACCENT);

console.log('\nUN CONTRASTE INSUFICIENTE BLOQUEA EL GUARDADO');
await openStyles(page);
await page.fill('#brandInk', '#ffff00');
check('"Guardar estilos" queda deshabilitado', await page.isDisabled('#saveBrand'), true);
check('el mensaje nombra el par que falla',
  (await page.textContent('#brandStatus')).includes('"Texto blanco sobre el color principal" tiene un contraste de'), true);
check('y la lista lo marca como "No cumple" con su razón', await page.$$eval('#brandContrast .contrast-row', rows => rows
  .filter(r => r.querySelector('.contrast-status').textContent === 'No cumple').map(r => r.querySelector('b').textContent)),
  ['Texto blanco sobre el color principal', 'Color principal como texto sobre blanco']);
await page.evaluate(() => { const btn = document.getElementById('saveBrand'); btn.disabled = false; btn.click(); });
check('ni forzando el clic se guarda', await page.evaluate(key => JSON.parse(localStorage.getItem(key)).colors.ink, BRAND_KEY), INK);
await page.fill('#brandInk', 'azul');
check('un color que no es #rrggbb también bloquea', (await page.textContent('#brandStatus')).includes('formato #rrggbb'), true);

console.log('\nUN LOGO PNG SUBIDO LLEGA AL TOPBAR Y AL COTIZADOR, COMO PNG');
await openStyles(page);
await page.setInputFiles('#brandLogoOnDark', LOGO_PNG);
await page.waitForFunction(() => brandDraft.logos.onDark);
await save(page);
const storedDark = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).logos.onDark, BRAND_KEY);
check('se guarda como data:image/png', storedDark.startsWith('data:image/png;base64,'), true);
if (!INVERTED) check('el topbar del backoffice lo muestra', await page.getAttribute('.topbar .brand img', 'src'), storedDark);
await page.goto(D + 'index.html');
if (!INVERTED) check('el header del cotizador lo muestra', await page.getAttribute('.site-header .brand img', 'src'), storedDark);
check('y sale de su estado oculto de carga', await page.evaluate(() => document.documentElement.hasAttribute('data-brand-pending')), false);

console.log('\nUN SVG CON <script> SE CONVIERTE EN PNG Y NO EJECUTA NADA');
await openStyles(page);
await page.setInputFiles('#brandLogoOnLight', LOGO_SVG);
await page.waitForFunction(() => brandDraft.logos.onLight);
check('el borrador guarda un PNG, no el SVG', await page.evaluate(() => brandDraft.logos.onLight.startsWith('data:image/png;base64,')), true);
check('el script del SVG no corrió (window.__pwned sigue sin definir)', await page.evaluate(() => typeof window.__pwned), 'undefined');
check('otro formato se rechaza con un mensaje',
  await page.evaluate(() => new Promise(res => readLogo(new File(['x'], 'logo.gif', { type: 'image/gif' })).catch(err => res(err.message)))),
  'Formato no admitido. Sube el logo en PNG, JPEG, WebP o SVG.');
check('y un archivo de más de 2 MB también',
  await page.evaluate(() => new Promise(res => readLogo(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'grande.png', { type: 'image/png' })).catch(err => res(err.message)))),
  'El logo pesa más de 2 MB. Sube una versión más liviana.');

console.log('\nESSENTIAL: FUENTES Y ENCABEZADO BLOQUEADOS, CON "MEJORAR PLAN"');
check('el plan es Essential', await page.evaluate(() => Store.settings().plan), 'Essential');
check('las dos fuentes están deshabilitadas', [await page.isDisabled('#brandHeadingFont'), await page.isDisabled('#brandBodyFont')], [true, true]);
check('las dos opciones de encabezado también', await page.$$eval('input[name="brandVariant"]', rs => rs.map(r => r.disabled)), [true, true]);
check('cada grupo avisa y ofrece mejorar el plan', await page.$$eval('#styles [data-brand-locked]', els => els.map(e => [!e.hidden, e.querySelector('span').textContent, e.querySelector('button').textContent])),
  [[true, 'Disponible desde el plan Professional', 'Mejorar plan'], [true, 'Disponible desde el plan Professional', 'Mejorar plan']]);
await save(page); // guarda el logo claro (permitido en Essential)
await page.click('#brandFontsCard [data-upgrade-plans]');
check('"Mejorar plan" abre Upgrade en la pestaña Planes',
  await page.evaluate(() => [document.querySelector('.page.active').id, document.getElementById('tabPlanes').getAttribute('aria-selected')]), ['upgrade', 'true']);
page.once('dialog', d => d.accept());
await page.click('#plansGrid [data-plan="Professional"]');
await page.waitForFunction(() => Store.settings().plan === 'Professional');
await page.click('button[data-page="styles"]');
await page.waitForSelector('#styles.active #brandContrast .contrast-row');
check('en Professional las fuentes se habilitan', [await page.isDisabled('#brandHeadingFont'), await page.isDisabled('#brandBodyFont')], [false, false]);
check('y el encabezado también', await page.$$eval('input[name="brandVariant"]', rs => rs.map(r => r.disabled)), [false, false]);
check('sin avisos de plan', await page.$$eval('#styles [data-brand-locked]', els => els.map(e => e.hidden)), [true, true]);

console.log('\nINVERTIDO EXIGE UN LOGO PARA FONDOS CLAROS');
await page.click('[data-logo-clear="onLight"]');
if (!await page.evaluate(() => !!Store.brandDefaults().logos.onLight)) {
  await page.check('input[name="brandVariant"][value="inverted"]');
  check('sin logo claro no se puede guardar', await page.isDisabled('#saveBrand'), true);
  check('y el mensaje lo dice', (await page.textContent('#brandStatus')).includes('El encabezado invertido necesita un logo para fondos claros.'), true);
}
await page.setInputFiles('#brandLogoOnLight', LOGO_PNG);
await page.waitForFunction(() => brandDraft.logos.onLight);
await page.check('input[name="brandVariant"][value="inverted"]');
await page.selectOption('#brandHeadingFont', 'Playfair Display');
await page.selectOption('#brandBodyFont', 'Lato');
check('con el logo claro ya se puede guardar', await page.isDisabled('#saveBrand'), false);
check('la vista previa pasa a invertido', await page.$eval('#brandPreview', el => el.classList.contains('is-inverted')), true);
check('el cuarto chequeo (tarjetas invertidas) aparece', await page.$$eval('#brandContrast .contrast-row b', els => els.map(e => e.textContent).includes('Texto blanco sobre las tarjetas del modo invertido')), true);
await page.fill('#brandName', 'Tapicería Aurora');
await save(page);
const storedLight = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).logos.onLight, BRAND_KEY);
await page.goto(D + 'index.html');
check('cotizador: el <style data-color-mode="inverted"> está activo', await page.getAttribute('style[data-color-mode="inverted"]', 'media'), 'all');
check('cotizador: el header es blanco', await bgOf(page, '.site-header'), WHITE);
check('cotizador: el header usa el logo para fondos claros', await page.getAttribute('.site-header .brand img', 'src'), storedLight);
check('cotizador: los títulos usan la fuente elegida', (await page.$eval('.step-heading h2', e => getComputedStyle(e).fontFamily)).startsWith('"Playfair Display"'), true);
check('cotizador: y el texto la suya', (await page.evaluate(() => getComputedStyle(document.body).fontFamily)).startsWith('Lato'), true);
check('cotizador: la hoja de Google Fonts pide las dos', await page.$eval('link[data-brand-fonts]', l => l.href.includes('family=Playfair+Display') && l.href.includes('family=Lato:wght@400;700')), true);
check('cotizador: el nombre de la empresa cambia en la copia de marca',
  await page.$$eval('[data-brand-name]', els => [...new Set(els.map(e => e.textContent))]), ['Tapicería Aurora']);
check('cotizador: y en el título de la pestaña', (await page.title()).includes('Tapicería Aurora'), true);
check('cotizador: el aviso legal sigue nombrando al paquete, no al nombre editable',
  (await page.textContent('#demoBanner')).includes(client.copy.notOfficialIndex), true);
check('cotizador: ningún script de SVG corrió aquí tampoco', await page.evaluate(() => typeof window.__pwned), 'undefined');

console.log('\nBAJAR A ESSENTIAL IGNORA FUENTES Y ENCABEZADO, SIN BORRARLOS');
await openAdmin(page, D);
await page.click('button[data-page="upgrade"]');
page.once('dialog', d => d.accept());
await page.click('#plansGrid [data-plan="Essential"]');
await page.waitForFunction(() => Store.settings().plan === 'Essential');
await page.click('button[data-page="styles"]');
await page.waitForSelector('#styles.active #brandContrast .contrast-row');
check('una nota lo explica', (await page.textContent('#brandGatedNote')).includes('no se borró'), true);
check('los overrides siguen guardados', await page.evaluate(key => { const o = JSON.parse(localStorage.getItem(key)); return [o.headerVariant, o.fonts]; }, BRAND_KEY),
  ['inverted', { heading: 'Playfair Display', body: 'Lato' }]);
await page.goto(D + 'index.html');
check('cotizador: vuelve al encabezado por defecto del paquete',
  await page.getAttribute('style[data-color-mode="inverted"]', 'media'), INVERTED ? 'all' : 'not all');
check('cotizador: y a las fuentes por defecto', await page.$eval('link[data-brand-fonts]', l => l.getAttribute('href')), client.fonts.href);
check('cotizador: los colores (Essential) se mantienen', await bgOf(page, INVERTED ? '.app-shell' : '.site-header'), rgb(INK));

console.log('\nRESTABLECER ESTILOS VUELVE A LA MARCA DEL PAQUETE EN AMBAS PÁGINAS');
await openStyles(page);
page.once('dialog', d => d.accept());
await page.click('#resetBrand');
await page.waitForFunction(() => document.getElementById('toast').classList.contains('show'));
check('no quedan overrides', await page.evaluate(key => localStorage.getItem(key), BRAND_KEY), null);
check('backoffice: no queda ninguna variable de marca en línea',
  await page.evaluate(() => ['--ink', '--accent', '--font-heading', '--tint-panel-wash'].map(v => document.documentElement.style.getPropertyValue(v))), ['', '', '', '']);
check('backoffice: el topbar vuelve al paquete', await bgOf(page, '.topbar'), INVERTED ? WHITE : rgb(client.theme.ink));
check('backoffice: el formulario vuelve a los defaults', await page.evaluate(() => [brandName.value, brandInk.value]), [client.displayName, client.theme.ink.toLowerCase()]);
await page.goto(D + 'index.html');
check('cotizador: el header vuelve al paquete', await bgOf(page, '.site-header'), INVERTED ? WHITE : rgb(client.theme.ink));
check('cotizador: el logo vuelve al del paquete', await page.evaluate(() => {
  const img = document.querySelector('.site-header .brand img'), d = Store.brandDefaults().logos;
  return img.getAttribute('src') === (img.dataset.brandLogo === 'onLight' ? d.onLight : d.onDark);
}), true);
check('cotizador: el título vuelve al del paquete', await page.title(), client.meta.titleIndex);

console.log('\n"RESTABLECER DATOS DE DEMO" TAMBIÉN BORRA LOS ESTILOS');
await page.evaluate(() => Store.saveBrand({ companyName: 'Otra Marca', colors: { ink: '#1f3a5f' } }));
await openAdmin(page, D);
page.once('dialog', d => d.accept());
await page.click('#resetData');
await page.waitForFunction(() => document.getElementById('toast').textContent === 'Datos de demo restablecidos');
check('la clave de marca desaparece', await page.evaluate(key => localStorage.getItem(key), BRAND_KEY), null);
check('y el topbar vuelve al paquete sin recargar', await bgOf(page, '.topbar'), INVERTED ? WHITE : rgb(client.theme.ink));

console.log('\nUN VENDEDOR NO VE NI ALCANZA LOS ESTILOS');
const sellerCtx = await b.newContext();
const seller = await sellerCtx.newPage();
seller.on('pageerror', e => errs.push(String(e)));
await openAdmin(seller, D, userEmail('u-laura'));
check('el nav item no se le muestra', await seller.isVisible('button[data-page="styles"]'), false);
await seller.evaluate(() => document.querySelector('[data-page="styles"]').click());
await seller.waitForTimeout(150);
check('forzar el clic no abre la sección', await seller.evaluate(() => document.getElementById('styles').classList.contains('active')), false);
check('ni pinta sus chequeos', await seller.evaluate(() => document.querySelectorAll('#brandContrast .contrast-row').length), 0);
check('Auth tampoco se la concede', await seller.evaluate(() => Auth.can(Auth.current(), 'styles')), false);

console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'none'));
if (errs.length) fails++;
await b.close();
console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
process.exit(fails ? 1 : 0);
