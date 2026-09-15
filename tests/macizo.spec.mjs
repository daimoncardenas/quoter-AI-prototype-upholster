/* White-label smoke test for the MACIZO placeholder pack (see
 * clients/macizo/README.md — every value in that pack is invented). This
 * does not join the main `npm test` chain: that suite is written against
 * clients/mediterranea/'s specific fixtures (seller names, quote counts...)
 * and only makes sense under CLIENT=MEDITERRANEA. This spec instead proves
 * the white-label pipeline itself: generation succeeds for a second client,
 * that client's own branding shows up, its demo admin can log in, and
 * nothing from another client's pack leaks into its output.
 *
 * Generates into generated-macizo/ (not generated/) so it never collides
 * with whatever the main suite has generated for CLIENT=MEDITERRANEA.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { generate } from '../tools/generate.mjs';
import { loadClientPack } from '../tools/client-pack.mjs';

let fails = 0;
const check = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
};

const OUT = 'generated-macizo';
generate('MACIZO', OUT);
const { client, seed } = loadClientPack('MACIZO');
const D = 'file://' + process.cwd() + '/' + OUT + '/';

console.log('\nLA GENERACIÓN PARA MACIZO NO FALLA Y NO FILTRA OTRO CLIENTE');
const [indexHtml, adminHtml, storeJs] = ['index.html', 'admin.html', 'store.js'].map(f => readFileSync(`${OUT}/${f}`, 'utf8'));
check('el índice no menciona a Mediterránea', /mediterr/i.test(indexHtml), false);
check('el backoffice no menciona a Mediterránea', /mediterr/i.test(adminHtml), false);
check('store.js no menciona a Mediterránea', /mediterr/i.test(storeJs), false);

console.log('\nLA MARCA Y EL TEMA DE MACIZO APARECEN EN LA SALIDA');
check('el título usa el nombre de Macizo', indexHtml.includes(client.meta.titleIndex), true);
// Macizo's real logo is a raster (logo-light.png, derived from the site's
// own asset), not svg+xml — check any embedded data-URI image, not one
// specific mime type.
check('el logo de Macizo está embebido', /data:image\/(svg\+xml|png|jpeg|webp);base64,/.test(indexHtml), true);
check('el color de acento de Macizo está en el tema', indexHtml.includes(`--accent:${client.theme.accent}`), true);
check('el color de acento de Macizo difiere del de Mediterránea', client.theme.accent === '#00a19a', false);

console.log('\nEL ADMIN DE DEMO DE MACIZO PUEDE ENTRAR');
const admin = seed.users.find(u => u.role === 'admin');
const b = await chromium.launch();
const page = await b.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto(D + 'admin.html');
await page.fill('#loginEmail', admin.email);
await page.fill('#loginPassword', client.demoPassword);
await page.click('#loginSubmit');
await page.waitForTimeout(350);
check('entra con las credenciales de demo de Macizo', await page.isVisible('#appShell'), true);
check('ve su propio nombre en el topbar', await page.textContent('#meName'), admin.name);
await b.close();

console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'none'));
console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
process.exit(fails ? 1 : 0);
