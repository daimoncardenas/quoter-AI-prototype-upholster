/* White-label smoke test for every non-Mediterránea pack (see
 * clients/<slug>/README.md — every value in these packs is invented except
 * the brand itself, sourced from the client's real site). This does not join
 * the main `npm test` chain: that suite is written against
 * clients/mediterranea/'s specific fixtures (seller names, quote counts...)
 * and only makes sense under CLIENT=MEDITERRANEA. This spec instead proves
 * the white-label pipeline itself, for EVERY other pack under clients/:
 * generation succeeds, that client's own branding shows up, its demo admin
 * can log in, and nothing from any OTHER client's pack leaks into its output.
 *
 * Generates each pack into generated-<slug>/ (not generated/) so it never
 * collides with whatever the main suite has generated for CLIENT=MEDITERRANEA.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { generate } from '../tools/generate.mjs';
import { loadClientPack, listAvailableClients } from '../tools/client-pack.mjs';

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
  await page.close();
}

await b.close();

console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
process.exit(fails ? 1 : 0);
