/* La COMPRA DIRECTA del diagrama del dueño (docs/flujo-de-suministro.md): «nueva compra» → «para
 * qué» → «conozco la tela y cuánto necesito». Una fila o varias —da igual: la lista es la misma— y
 * cada fila pasa por SU regla comercial (mínimo, incremento, rollo) y por su unidad (metros o rollos).
 *
 * Y la cantidad declarada NO lleva el alza del taller: desperdicio y margen son de lo que se
 * calcula, no de lo que el cliente ya sabe. */
import { chromium } from 'playwright';
import { PHOTOS_DB } from './client.mjs';
import { openAdmin, elegirAtencion } from './helpers.mjs';
const D = 'file://' + process.cwd() + '/generated/';

let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${name}` + (ok?'':`\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
};
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));

/* Sin atajos: aquí se elige la línea y la ruta a mano, que es justo lo que se prueba. */
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
const fila = async (n, tela, cantidad) => {
  await page.selectOption(`#listRows .boq-row:nth-child(${n}) .list-fabric`, { label: tela });
  await page.fill(`#listRows .boq-row:nth-child(${n}) .list-metros`, String(cantidad));
  await page.waitForTimeout(150);
};
/* De cero a la compra directa: la línea, «nueva compra», el propósito y lo que se sabe. */
const abrirLaCompra = async (proposito, saber) => {
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
  await page.waitForTimeout(150);
  await avanzar();
  if (saber) {
    await page.click(`#saberGrid .service-choice:has-text("${saber}")`);
    await page.waitForTimeout(150);
  }
};

console.log('\nLOS DOS CAMINOS Y EL PROPÓSITO');
await fresh();
await page.evaluate(() => Store.saveSettings({ plan: 'Business', disabledLines: [] }));
await fresh();
await page.click('#serviceGrid .service-choice:has-text("Suministro de tela")');
await page.waitForTimeout(200);
await avanzar();
check('la primera pregunta ofrece los dos caminos del dibujo',
  await page.evaluate(() => [...document.querySelectorAll('#routeGrid .service-choice')].map(c =>
    [c.querySelector('b').textContent, c.classList.contains('selected')])),
  [['Nueva compra', true], ['Completar pedido anterior', false]]);
await page.click('#routeGrid .service-choice:has-text("Nueva compra")');
await page.waitForTimeout(150);
await avanzar();
check('y la compra pregunta para qué se necesita la tela, con lo que decide el después',
  await page.evaluate(() => [state.step, document.getElementById('mobileTitle').textContent,
    [...document.querySelectorAll('#purposeGrid .service-choice')].map(c => c.querySelector('b').textContent)]),
  [22, '¿Para qué necesitas la tela?',
   ['Reventa o inventario', 'Mi servicio de tapicería', 'Mi mueble o proyecto personal']]);

console.log('\nCOMPRA DIRECTA: LA LISTA, Y NADA MÁS');
await abrirLaCompra('Mi mueble o proyecto personal', 'Conozco la tela y cuánto necesito');
check('la compra directa deja el recorrido en la lista, la estimación y el cierre',
  await page.evaluate(() => pasosVisibles()), [0, 18, 22, 23, 20, 16, 15]);
await avanzar();
check('«Continuar» cae en la lista, con una fila lista para escribir',
  await page.evaluate(() => [state.step, document.getElementById('mobileTitle').textContent,
    document.querySelectorAll('#listRows .boq-row').length,
    document.querySelector('#listRows [data-row-unit]').textContent]),
  [20, 'Tu compra', 1, 'm']);
check('el paso del mueble no existe para esta ruta (ni sus fotos)',
  await page.evaluate(() => [
    pasosVisibles().includes(1),
    document.getElementById('uploadZone').hidden,
    !!document.querySelector('.wizard-step[data-step="1"].active'),
  ]), [false, true, false]);

/* Velvet Siena: 119.000/m, se vende en múltiplos de 0,5 m con pedido mínimo de 2 m. */
await fila(1, 'Velvet Siena · Petróleo', 21.3);
check('la cantidad declarada se cobra en la unidad comercial de la tela (21,3 → 21,5 m)',
  await page.evaluate(() => [document.getElementById('metersRange').textContent,
                             billable().facMin, billable().facMax]), ['21,5', 21.5, 21.5]);
check('y el paso de la estimación explica de dónde sale el número',
  await page.evaluate(() => [...document.querySelectorAll('#estimateAssumptions li')].map(li => li.textContent)),
  await page.evaluate(() => {
    const f = valorDeLaLista()[0];
    return [`Velvet Siena · Petróleo: declaraste 21,3 m → 21,5 m a ${money(f.price)} / m`,
            'Un asesor confirma disponibilidad y lote antes de cortar.',
            ...f.razones.map(r => `Velvet Siena: ${r}`)];
  }));
check('el aviso de la lista aparece en el paso, y sin referencias no deja avanzar',
  await page.evaluate(async () => {
    document.querySelector('#listRows .list-metros').value = '';
    document.getElementById('nextButton').click();
    await new Promise(r => setTimeout(r, 250));
    const avisos = [...document.querySelectorAll('#messages .message.bot.aviso')];
    return [state.step, avisos.length ? avisos[avisos.length - 1].textContent.trim() : null];
  }), [20, 'Agrega al menos una referencia con su cantidad para calcular tu estimación.']);
await fila(1, 'Velvet Siena · Petróleo', 21.3);

console.log('\nLA CANTIDAD DECLARADA NO LLEVA EL ALZA DEL TALLER');
const conAlza = await page.evaluate(() => linePrice(billable()).total);
await openAdmin(page, D);
await page.click('button[data-page="settings"]');
await page.fill('#setWaste', '0'); await page.fill('#setMargin', '0');
await page.click('#saveSettings');
await page.goto(D + 'index.html');
await abrirLaCompra('Mi mueble o proyecto personal', 'Conozco la tela y cuánto necesito');
await avanzar();
await fila(1, 'Velvet Siena · Petróleo', 21.3);
check('con desperdicio y margen en cero la estimación es la MISMA (no los llevaba)',
  await page.evaluate(() => linePrice(billable()).total), conAlza);
check('y el motor lo dice: la lista, no los componentes del mueble',
  await page.evaluate(() => billable().consumo.modelo), 'lista');

console.log('\nUNA TELA DE ROLLO SE PIDE EN ROLLOS');
await page.evaluate(() => { const f = Store.get('fabrics', 6); f.active = true; Store.put('fabrics', f); pintarFilasDeLaLista(); });
await page.waitForTimeout(200);
await fila(1, 'Milo Protect · Oliva', 2);
check('la fila pide rollos y lo dice, y el valor va sobre los metros del rollo',
  await page.evaluate(() => {
    const f = valorDeLaLista()[0], l = leerLaLista()[0];
    return [document.querySelector('#listRows [data-row-unit]').textContent,
            l.valor, l.rollos, l.rollLengthM, l.metros, f.facturable];
  }), ['rollos', 2, 2, 30, 60, 60]);
check('y la letra chica lo escribe en las dos unidades',
  await page.evaluate(() => document.querySelector('#estimateAssumptions li').textContent),
  await page.evaluate(() => `Milo Protect · Oliva: 2 rollos (60 m) → ${fmtM(valorDeLaLista()[0].facturable)} m a ${money(valorDeLaLista()[0].price)} / m`));

console.log('\nLA LISTA CON VARIAS TELAS: CADA FILA CON SU REGLA, Y EL TOTAL');
await page.evaluate(() => { const f = Store.get('fabrics', 6); f.active = false; Store.put('fabrics', f); pintarFilasDeLaLista(); });
await fila(1, 'Velvet Siena · Petróleo', 21.3);
await page.click('#listAdd');
await page.waitForTimeout(150);
/* Bouclé Capri: 137.000/m, incrementos de 0,25 m con mínimo de 1 m — declarar 0,6 obliga a 1. */
await fila(2, 'Bouclé Capri · Marfil', 0.6);
check('cada fila pasa por SU regla comercial (21,3 → 21,5 m · 0,6 → 1 m)',
  await page.evaluate(() => valorDeLaLista().map(f => [f.name, f.declarado, f.facturable])),
  [['Velvet Siena', 21.3, 21.5], ['Bouclé Capri', 0.6, 1]]);
check('el paso de la estimación pinta una línea por referencia, los metros y el total',
  await page.evaluate(() => [document.getElementById('priceCaption').textContent,
    [...document.querySelectorAll('#priceParts span')].map(s => s.textContent),
    document.getElementById('metersRange').textContent,
    linePrice(billable()).total]),
  await page.evaluate(() => {
    const f = valorDeLaLista();
    return ['Tu compra', f.map(x => `${x.name} · ${fmtM(x.facturable)} m · ${money(x.valorTotal[0])}`),
            rangoM(f[0].facturable + f[1].facturable, f[0].facturable + f[1].facturable),
            [f[0].valorTotal[0] + f[1].valorTotal[0], f[0].valorTotal[0] + f[1].valorTotal[0]]];
  }));

console.log('\nLA ESTIMACIÓN, EL CIERRE Y LA SOLICITUD');
await avanzar();
check('la estimación es el paso que sigue, con el total de la lista',
  await page.evaluate(() => [state.step, document.getElementById('priceCaption').textContent,
    document.getElementById('priceRange').textContent !== '—']), [16, 'Tu compra', true]);
await avanzar();
check('el cierre pregunta cómo llega la tela y cuenta referencias, no una sola',
  await page.evaluate(() => [state.step, !document.getElementById('entregaField').hidden,
    document.getElementById('summaryFabric').textContent,
    document.getElementById('summaryConsumo').textContent]), [15, true, '2 referencias', '21,9 m']);
await page.selectOption('#entrega', 'envio');
await page.fill('#fullName', 'Marta Ruiz');
await page.fill('#email', 'marta@ejemplo.com');
await page.fill('#phone', '3001234567');
await elegirAtencion(page);
await page.check('#consent');
await avanzar();
await page.waitForSelector('#successState:not([hidden])');
const id = (await page.textContent('#requestNumber')).trim();
check('la solicitud guarda el camino —ruta, para qué y qué sabía—, la entrega y su lista',
  await page.evaluate(i => {
    const q = Store.get('quotes', i);
    return [q.ruta, q.proposito, q.saber, q.entrega, q.estimate.kind, q.estimate.parts.length, q.pedidoDe,
            q.lista.map(f => [f.fabricName, f.unidad, f.declarado, f.facturable, f.valorTotal])];
  }, id),
  await page.evaluate(() => {
    const f = valorDeLaLista();
    return ['compra', { id: 'mueble', label: 'Mi mueble o proyecto personal' },
            { id: 'ambas', label: 'Conozco la tela y cuánto necesito' }, 'envio', 'lista', 2, null,
            f.map(x => [`${x.name} · ${x.colorName}`, 'm', x.declarado, x.facturable,
                        [x.valorTotal[0], x.valorTotal[1]]])];
  }));

console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'none'));
console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
