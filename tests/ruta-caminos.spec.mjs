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

console.log('\nREVENTA O INVENTARIO: PREGUNTA QUÉ SABE Y VA A LA LISTA');
await abrirLaCompra('Reventa o inventario');
/* El dueño (24/09): también aquí se pregunta primero —«ya sabes qué tipo de tela requieres» o
 * «quiero sugerencias»—, y la respuesta decide si el recorrido trae la recomendación. */
check('pregunta qué sabe el cliente —las dos respuestas— y la respuesta no trae recomendación',
  await page.evaluate(() => [pasosVisibles(), document.getElementById('uploadZone').hidden,
    [...document.querySelectorAll('#saberGrid .service-choice')].map(c => (c.querySelector('b') || {}).textContent)]),
  [[0, 18, 22, 23, 20, 16, 15], true, ['Sé qué tela quiero', 'Quiero sugerencias']]);
await page.click('#saberGrid .service-choice:has-text("Sé qué tela quiero")');
await page.waitForTimeout(200);
await avanzar();
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
  await page.evaluate(() => [pasosVisibles(), document.getElementById('uploadZone').hidden]),
  [[0, 18, 22, 23, 1, 9, 20, 16, 15], false]);
check('y su lista solo pide la referencia: los metros los pone el motor',
  await page.evaluate(() => [!!document.querySelector('#listRows .list-metros'),
    document.querySelector('#listRows .sin-cantidad').textContent.trim()]),
  [false, 'Los metrosLos calculamos con tu mueble y sus medidas.']);
await avanzar();                  // 23 → 1: el mueble y su foto
await page.setInputFiles('#furniturePhoto', FOTOS);
await page.waitForFunction(() => state.photos.length >= 3);
await page.waitForTimeout(150);
await avanzar();                  // 1 → 9: las medidas
await page.fill('#width', '210'); await page.fill('#height', '85'); await page.fill('#depth', '90');
await page.waitForTimeout(150);
await avanzar();                  // 9 → 20: la lista, que solo pide la referencia
await page.selectOption('#listRows .list-fabric', { label: 'Velvet Siena · Petróleo' });
await page.waitForTimeout(200);
check('la referencia elegida es la tela del proyecto',
  await page.evaluate(() => state.fabric && state.fabric.name), 'Velvet Siena');
await avanzar();                  // 20 → 16: la estimación
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
check('sabe los metros: la recomendación elige la tela y la lista cierra la cantidad',
  await page.evaluate(() => pasosVisibles()), [0, 18, 22, 23, 12, 14, 20, 16, 15]);
await avanzar();
await avanzar();
await page.click('#fabricGrid .fabric-card:has-text("Velvet Siena")');
await page.waitForTimeout(200);
await avanzar();
check('y la fila llega con la tela de la recomendación, esperando la cantidad',
  await page.evaluate(() => {
    const s = document.querySelector('#listRows .list-fabric');
    return { paso: state.step, filas: document.querySelectorAll('#listRows .boq-row').length,
             cantidad: !!document.querySelector('#listRows .list-metros'),
             tela: s ? s.selectedOptions[0].textContent : null };
  }),
  { paso: 20, filas: 1, cantidad: true, tela: 'Velvet Siena · Petróleo' });
await page.fill('#listRows .list-metros', '20');
await page.waitForTimeout(150);
await avanzar();
check('y el paso cotiza los metros que declaró',
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
/* El dueño (24/09): la reventa también pregunta qué sabe el cliente —«ya sabes qué tipo de tela
 * requieres» / «quiero sugerencias»—, así que el sendero suma su tramo como en los demás caminos. */
check('reventa: pregunta qué sabe el cliente, y el sendero suma los tres tramos',
  await elSendero(),
  { barra: false, motivo: 'Suministro de tela', tramos: ['Nueva compra', 'Reventa o inventario', 'Sé qué tela quiero'], oculto: false });
await page.click('#saberGrid .service-choice:has-text("Quiero sugerencias")');
await page.waitForTimeout(200);
check('«quiero sugerencias» mete la preferencia y la recomendación, y la lista NO vuelve',
  await page.evaluate(() => pasosVisibles()), [0, 18, 22, 23, 12, 14, 16, 15]);
await page.click('#saberGrid .service-choice:has-text("Sé qué tela quiero")');
await page.waitForTimeout(200);
check('y «sé qué tela quiero» lo deja en la lista y el cierre, sin recomendación',
  await page.evaluate(() => pasosVisibles()), [0, 18, 22, 23, 20, 16, 15]);

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
