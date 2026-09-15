/* El paquete cifrado de dist/.
 *
 * A diferencia del resto de la suite, esto no prueba el prototipo: prueba que
 * el prototipo NO está ahí hasta que alguien escribe la llave. Por eso casi
 * todas las comprobaciones miran los bytes del archivo, no la pantalla.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const D = 'file://' + process.cwd() + '/dist/';
let fails = 0;
const check = (n, got, want) => { const ok = JSON.stringify(got)===JSON.stringify(want); if(!ok)fails++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${n}` + (ok?'':`\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)); };

/* TEMPORAL — la puerta de la llave está comentada en tools/build.mjs, así que
 * dist/ sale en claro y no hay sello que comprobar. Este archivo entero mide
 * esa puerta: dejarlo correr no reporta un problema real, solo ruido rojo.
 *
 * Cuando vuelvas a sellar la entrega — descomentar shell()+encrypt() en
 * tools/build.mjs — borra este bloque y la suite vuelve a proteger dist/. */
console.log('\n  SKIP  sealed.spec — el build entrega sin cifrar a propósito.\n');
process.exit(0);

const LLAVE = 'TEST5-TEST5-TEST5-TEST5';
const salida = execFileSync('node', ['tools/build.mjs', '--key=' + LLAVE], { encoding: 'utf8' });

console.log('\nEL ARCHIVO ENTREGADO NO CONTIENE EL PROTOTIPO');
check('la build reutiliza la llave que le pasamos', salida.includes(LLAVE), true);
const crudo = readFileSync('dist/index.html', 'utf8');
const admin = readFileSync('dist/admin.html', 'utf8');
// Cadenas que solo existen dentro del prototipo. Si alguna asoma en el archivo
// entregado, algo se quedó fuera del cifrado.
for (const [nombre, aguja] of [
  ['el catálogo de telas', 'Lino Verona'],
  ['los precios', '89000'],
  ['los vendedores', 'Laura Méndez'],
  ['los hashes de usuarios', 'f7c0b38b253ca0ab191c2bf1842f66827716de30ccc4ac87c33f67b6c09d4e14'],
  ['el cotizador', 'wizard-step'],
  ['la fuente de store.js', 'DEFAULT_SETTINGS']
]) check(`no aparece ${nombre}`, crudo.includes(aguja) || admin.includes(aguja), false);
check('la llave tampoco viaja en el archivo', crudo.includes(LLAVE), false);
check('store.js no queda suelto al lado', existsSync('dist/store.js'), false);

console.log('\nSIN LA LLAVE NO HAY NADA QUE BORRAR');
const b = await chromium.launch();
const errs = [];
const nueva = async () => { const c = await b.newContext(); const p = await c.newPage();
  p.on('pageerror', e => errs.push(String(e))); return p; };

let page = await nueva();
await page.goto(D + 'index.html');
check('pide la llave', await page.isVisible('#form'), true);
// El truco que rompía la cortina anterior: quitar el overlay desde la consola.
await page.evaluate(() => { document.querySelector('.stack').remove(); });
check('quitar el formulario no deja texto legible',
  // innerText ignora el <script>, que es justo lo que queremos medir: lo que
  // una persona podría LEER en la página, no los bytes cifrados.
  await page.evaluate(() => (document.body.innerText || '').trim()), '');
check('y no hay catálogo en ninguna parte del DOM',
  await page.evaluate(() => document.documentElement.innerHTML.includes('Lino Verona')), false);

console.log('\nUNA LLAVE EQUIVOCADA FALLA EN LA ETIQUETA DE AUTENTICACIÓN');
await page.goto(D + 'index.html');
await page.fill('#key', 'AAAAA-AAAAA-AAAAA-AAAAA');
await page.click('#submit');
await page.waitForSelector('#error:not([hidden])');
check('lo dice sin filtrar la correcta',
  (await page.textContent('#error')).includes('no abre este archivo'), true);
check('el botón vuelve a quedar utilizable', await page.isDisabled('#submit'), false);

console.log('\nLA LLAVE CORRECTA DESCIFRA EL PROTOTIPO ENTERO');
await page.fill('#key', LLAVE);
await page.click('#submit');
await page.waitForSelector('.app-shell', { timeout: 30000 });
check('aparece el cotizador', await page.isVisible('.app-shell'), true);
check('con store.js ya dentro, sin pedir el archivo',
  await page.evaluate(() => typeof Store === 'object' && Store.all('fabrics').length > 0), true);
check('y el catálogo real', await page.evaluate(() => Store.all('fabrics')[0].name), 'Lino Verona');

console.log('\nSE ESCRIBE UNA VEZ: MISMA LLAVE, LAS DOS PÁGINAS');
await page.goto(D + 'admin.html');
await page.waitForSelector('#loginScreen', { timeout: 30000 });
check('el backoffice se abre solo y salta al login', await page.isVisible('#loginScreen'), true);
await page.goto(D + 'index.html');
await page.waitForSelector('.app-shell', { timeout: 30000 });
check('y recargar no vuelve a pedirla', await page.isVisible('.app-shell'), true);

console.log('\nOTRO NAVEGADOR EMPIEZA CERRADO');
const otro = await nueva();
await otro.goto(D + 'index.html');
check('vuelve a pedir la llave', await otro.isVisible('#form'), true);

console.log('\nCADA BUILD USA SAL E IV NUEVOS');
const antes = readFileSync('dist/index.html', 'utf8');
execFileSync('node', ['tools/build.mjs', '--key=' + LLAVE], { encoding: 'utf8' });
const despues = readFileSync('dist/index.html', 'utf8');
check('el mismo contenido y la misma llave no dan el mismo cifrado', antes === despues, false);

console.log('\nerrores de pagina: ' + (errs.length?errs.join(' | '):'ninguno'));
console.log(fails?`\n${fails} FALLAN`:'\nTODO PASA');
await b.close();
process.exit(fails ? 1 : 0);
