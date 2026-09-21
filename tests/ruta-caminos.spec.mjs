/* Los CAMINOS de la compra (docs/flujo-de-suministro.md, diagrama del dueño): qué quieres hacer →
 * para qué necesitas la tela → qué sabes. De ahí salen los tres caminos del dibujo —compra directa,
 * recomendación y cálculo (del trabajo o guiado)—, y ninguno pregunta lo que ya se sabe.
 *
 * La compra directa tiene su propia suite (tests/ruta-cantidad.spec) con sus números; aquí se
 * comprueba qué recorrido abre cada propósito y qué pide la lista en cada uno. */
import { chromium } from 'playwright';
import { PHOTOS_DB } from './client.mjs';
const D = 'file://' + process.cwd() + '/generated/';
const FOTOS = ['1', '2', '3'].map(n => new URL(`./fixture-sofa-${n}.png`, import.meta.url).pathname);

let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${name}` + (ok?'':`\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
};
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));

const fresh = async () => {
  await page.goto(D + 'index.html');
  await page.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
  await page.goto(D + 'index.html');
};
const avanzar = async () => {
  const antes = await page.evaluate(() => state.step);
  await page.click('#nextButton');
  await page.waitForFunction(x => state.step !== x, antes).catch(() => {});
  await page.waitForTimeout(120);
};
/* Suministro de tela → nueva compra → el propósito (y deja el wizard en el paso que sigue: la
 * pregunta de lo que se sabe, o la lista cuando el propósito no la tiene). */
const abrirLaCompra = async (proposito) => {
  await fresh();
  await page.evaluate(() => Store.saveSettings({ plan: 'Business', disabledLines: [] }));
  await fresh();
  await page.click('#serviceGrid .service-choice:has-text("Suministro de tela")');
  await page.waitForTimeout(200);
  await avanzar();
  await page.click('#routeGrid .service-choice:has-text("Nueva compra")');
  await page.waitForTimeout(150);
  await avanzar();
  await page.click(`#purposeGrid .service-choice:has-text("${proposito}")`);
  await page.waitForTimeout(200);
  await avanzar();
};
const losSaberes = () => page.evaluate(() => ({
  paso: state.step,
  tarjetas: [...document.querySelectorAll('#saberGrid .service-choice')].map(c =>
    [c.querySelector('b').textContent, c.classList.contains('selected')]),
}));
const estadoDeLaLista = () => page.evaluate(() => ({
  paso: state.step,
  filas: document.querySelectorAll('#listRows .boq-row').length,
  cantidad: !!document.querySelector('#listRows .list-metros'),
  sinTela: !!document.querySelector('#listRows .list-fabric option[value=""]'),
}));

console.log('\nREVENTA O INVENTARIO: DERECHO A LA LISTA');
await abrirLaCompra('Reventa o inventario');
check('no pregunta qué se sabe —el que revende trae referencias y cantidades— y va a la lista',
  await page.evaluate(() => [pasosVisibles(), document.getElementById('uploadZone').hidden,
    [...document.querySelectorAll('#saberGrid .service-choice')].length]),
  [[0, 18, 22, 20, 16, 15], true, 0]);
check('y la lista pide referencia y cantidad, como el dibujo',
  await estadoDeLaLista(), { paso: 20, filas: 1, cantidad: true, sinTela: false });

console.log('\nMI SERVICIO DE TAPICERÍA: CALCULAR EL TRABAJO');
await abrirLaCompra('Mi servicio de tapicería');
check('pregunta solo dos cosas: la tela y la cantidad, o que se calcule el trabajo',
  await losSaberes(),
  { paso: 23, tarjetas: [['Conozco la tela y cuánto necesito', true],
                         ['Conozco la tela, no cuánto necesito', false]] });
await page.click('#saberGrid .service-choice:has-text("Conozco la tela, no cuánto necesito")');
await page.waitForTimeout(200);
check('el taller que sabe la tela y no la cantidad describe su pieza (con fotos) y el motor la calcula',
  await page.evaluate(() => [pasosVisibles(), !document.getElementById('uploadZone').hidden]),
  [[0, 18, 22, 23, 20, 1, 9, 16, 15], true]);
check('y su lista solo pide la referencia: los metros los pone el motor',
  await page.evaluate(() => [!!document.querySelector('#listRows .list-metros'),
    document.querySelector('#listRows .sin-cantidad').textContent.trim()]),
  [false, 'Los metrosLos calculamos con tu mueble y sus medidas.']);
await avanzar();
await page.selectOption('#listRows .list-fabric', { label: 'Velvet Siena · Petróleo' });
await page.waitForTimeout(200);
check('la referencia elegida es la tela del proyecto',
  await page.evaluate(() => state.fabric && state.fabric.name), 'Velvet Siena');
await avanzar();
await page.setInputFiles('#furniturePhoto', FOTOS);
await page.waitForFunction(() => state.photos.length >= 3);
await avanzar();
await page.fill('#width', '210'); await page.fill('#height', '85'); await page.fill('#depth', '90');
await page.waitForTimeout(150);
await avanzar();
check('la estimación usa los metros del mueble con la regla de esa tela',
  await page.evaluate(() => {
    const c = consumo(), f = valorDeLaLista()[0];
    const esperado = [Store.quantities(state.fabric, c.range[0]).facturable,
                      Store.quantities(state.fabric, c.range[1]).facturable];
    return [state.step, f.porCalculo, JSON.stringify(f.facturableRango) === JSON.stringify(esperado),
            document.getElementById('priceRange').textContent !== 'Por confirmar'];
  }), [16, true, true, true]);
check('y la letra chica dice de dónde salen los metros',
  await page.evaluate(() => document.querySelector('#estimateAssumptions li').textContent
    .startsWith('Velvet Siena · Petróleo: los metros de tu mueble (')), true);

console.log('\nMI MUEBLE O PROYECTO PERSONAL: TRES CAMINOS');
await abrirLaCompra('Mi mueble o proyecto personal');
check('pregunta las tres cosas del dibujo',
  await losSaberes(),
  { paso: 23, tarjetas: [['Conozco la tela y cuánto necesito', true],
                         ['Sé cuánto necesito, no la tela', false],
                         ['No tengo claro ninguna de las dos', false]] });
await page.click('#saberGrid .service-choice:has-text("Sé cuánto necesito, no la tela")');
await page.waitForTimeout(200);
check('sabe los metros: la lista sin tela y la recomendación para elegirla',
  await page.evaluate(() => pasosVisibles()), [0, 18, 22, 23, 20, 12, 14, 16, 15]);
await avanzar();
check('y la fila deja la referencia vacía, con su opción «aún no sé»',
  await estadoDeLaLista(), { paso: 20, filas: 1, cantidad: true, sinTela: true });
await page.fill('#listRows .list-metros', '20');
await page.waitForTimeout(150);
check('la cantidad declarada cuenta aunque todavía no haya tela (el precio espera)',
  await page.evaluate(() => {
    const f = valorDeLaLista()[0], q = billable();
    return [f.sinTela, f.declarado, q.min, q.total, document.getElementById('priceRange').textContent];
  }), [true, 20, 20, null, 'Por confirmar']);
await avanzar();
await avanzar();
await page.click('#fabricGrid .fabric-card:has-text("Velvet Siena")');
await page.waitForTimeout(200);
await avanzar();
check('y al elegir la tela el paso cotiza los metros que declaró',
  await page.evaluate(() => {
    const f = valorDeLaLista()[0];
    return [state.step, state.fabric && state.fabric.name, f.name, f.declarado, f.facturable,
            linePrice(billable()).total];
  }),
  await page.evaluate(() => [16, 'Velvet Siena', 'Velvet Siena', 20, 20, [20 * 119000, 20 * 119000]]));

await abrirLaCompra('Mi mueble o proyecto personal');
await page.click('#saberGrid .service-choice:has-text("No tengo claro ninguna de las dos")');
await page.waitForTimeout(200);
check('no sabe nada: el recorrido completo —mueble, medidas, preferencias, validación y recomendación—',
  await page.evaluate(() => [pasosVisibles(), pasosVisibles().includes(20)]),
  [[0, 18, 22, 23, 1, 9, 12, 13, 14, 16, 15], false]);

console.log('\nEL SENDERO: LO ELEGIDO, ARRIBA Y EN ORDEN');
/* El dueño lo pidió con una captura: arriba tiene que leerse por dónde va —el motivo y lo que ya
 * eligió— sin volver atrás. Cada tramo sale del catálogo de la línea, y sólo aparece el paso que su
 * recorrido tiene de verdad. */
const elSendero = () => page.evaluate(() => {
  const barra = document.getElementById('journeyContext'), el = document.getElementById('journeyTrail');
  return { barra: barra.hidden, motivo: document.getElementById('journeyContextLabel').textContent,
           tramos: [...el.querySelectorAll('.crumb')].map(c => c.textContent), oculto: el.hidden };
});
await abrirLaCompra('Reventa o inventario');
check('reventa: el sendero enseña el motivo, el camino y el propósito (y no inventa «qué sabes»)',
  await elSendero(),
  { barra: false, motivo: 'Suministro de tela', tramos: ['Nueva compra', 'Reventa o inventario'], oculto: false });

await abrirLaCompra('Mi mueble o proyecto personal');
await page.click('#saberGrid .service-choice:has-text("No tengo claro ninguna de las dos")');
await page.waitForTimeout(200);
const senderoCompleto = await elSendero();
check('y en el recorrido completo el sendero sigue sumando: el camino, el propósito y lo que sabe',
  senderoCompleto.tramos,
  ['Nueva compra', 'Mi mueble o proyecto personal', 'No tengo claro ninguna de las dos']);
/* Todavía está en la pregunta de lo que sabe: el mueble y las preferencias van DESPUÉS y el sendero
 * no adelanta lo que no se ha preguntado. */
check('y lo que todavía no se pregunta no aparece (el mueble va después de lo que sabe)',
  await page.evaluate(() => [state.furniture, pasosVisibles().indexOf(state.step) < pasosVisibles().length - 1]),
  ['Sofá', true]);

/* Al avanzar al mueble, el tramo aparece: lo elegido se suma en orden. */
await avanzar();
await page.waitForTimeout(150);
check('al llegar al mueble, su tramo se suma al sendero',
  (await elSendero()).tramos.slice(3), [await page.evaluate(() => state.furniture)]);

/* En el paso de la línea el aviso estorba —es justo lo que se elige— y con él el sendero. */
await fresh();
await page.evaluate(() => Store.saveSettings({ plan: 'Business', disabledLines: [] }));
await fresh();
await page.waitForTimeout(200);
check('en el paso de la línea no se enseña', (await elSendero()).barra, true);

console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'none'));
console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
