/* Retapizado es el MISMO recorrido del mueble con otra suma (docs/retapizado-trabajo.md, decisión
 * del dueño 20/09): la mano de obra va POR MUEBLE + POR METRO —configurada en el backoffice— y los
 * insumos del trabajo tienen su propio paso. Lo que se comprueba aquí es la promesa: la tela NO
 * manda sobre la obra (el mismo sofá con una tela de 89.000 y con una de 119.000 paga lo mismo de
 * taller), los insumos se suman con su precio congelado, y las líneas que siguen cotizando por
 * porcentaje no se movieron. */
import { chromium } from 'playwright';

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

const abrirLaLinea = async (label) => {
  await page.goto(D + 'index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.evaluate(() => Store.saveSettings({ plan: 'Business', disabledLines: [] }));
  await page.reload();
  await page.click(`#serviceGrid .service-choice:has-text("${label}")`);
  await page.waitForTimeout(250);
};
const laObra = (precio) => page.evaluate(p => {
  const q = Store.lineQuote(state.service, {
    furnitureId: 'sofa', furnitureName: 'Sofá', quantity: 1,
    materialRange: [12 * p, 16 * p], meters: [12, 16], damages: [], answers: {},
    insumos: [{ id: 'espuma', label: 'Espuma', unit: 'm²', cop: 38000, qty: 3 }]
  });
  const obra = q.parts.filter(x => /Mano de obra/.test(x.label))[0];
  return { etiqueta: obra.label, valor: obra.value[0], total: q.total[0],
           insumos: (q.parts.filter(x => /Insumos/.test(x.label))[0] || { value: [0] }).value[0] };
}, precio);

console.log('\nLA OBRA NO DEPENDE DEL PRECIO DE LA TELA');
await abrirLaLinea('Retapizado de muebles');
check('la línea trae su tabla de obra y sus insumos del catálogo (valores DEMO declarados)',
  await page.evaluate(() => {
    const s = state.service;
    return [s.labor && s.labor.mode, s.labor && s.labor.perMeter, s.labor && s.labor.porMueble.sofa,
            s.asks.indexOf('insumos') >= 0, s.insumos.length, s.insumos[0].id, s.insumos[0].cop,
            s.insumos.every(x => x.demo)];
  }),
  ['tabla', 9500, 180000, true, 5, 'espuma', 38000, true]);

const barata = await laObra(89000), cara = await laObra(119000);
check('el mismo sofá con dos telas distintas paga LA MISMA obra (180.000 + 9.500 × 12)',
  [barata.valor, cara.valor], [294000, 294000]);
check('y la etiqueta dice de dónde sale: el mueble y sus metros',
  barata.etiqueta, 'Mano de obra (Sofá · 16 m)');
check('los insumos se suman con su precio del catálogo (3 m² × 38.000)',
  [barata.insumos, cara.insumos], [114000, 114000]);
check('y el total es material + obra + insumos',
  [barata.total, cara.total], [1068000 + 294000 + 114000, 1428000 + 294000 + 114000]);

console.log('\nEL PASO DE INSUMOS ES DEL TRABAJO');
check('retapizado lo tiene entre las medidas y las preferencias',
  await page.evaluate(() => pasosVisibles()), [0, 1, 9, 17, 12, 13, 14, 16, 15]);
check('y trae una fila por insumo con su unidad y su precio',
  /* El precio lo pinta `Store.money` (con su espacio duro): se normaliza para comparar el texto. */
  await page.evaluate(() => [...document.querySelectorAll('#insumoRows .insumo-row')].map(f =>
    [f.querySelector('label').textContent.split('por')[0].trim(),
     f.querySelector('.insumo-unit').textContent.replace(/\s/g, ' ').trim()])),
  [['Espuma', 'por m² · $ 38.000'], ['Cinchas', 'por m · $ 9.000'], ['Grapas', 'por caja · $ 22.000'],
   ['Hilo', 'por rollo · $ 18.000'], ['Pegante', 'por kg · $ 25.000']]);
check('con todo en blanco no se suma nada',
  await page.evaluate(() => {
    const q = Store.lineQuote(state.service, { furnitureId: 'sofa', quantity: 1,
      materialRange: [1000000, 1000000], meters: [12, 12], damages: [], answers: {} });
    return [insumosMarcados().length, q.parts.filter(x => /Insumos/.test(x.label)).length];
  }), [0, 0]);

/* ---------------------------------------------------------------------------------------------
 * LA MANO DEL PASO DE INSUMOS (docs/insumos-asistidos.md, dueño 23/09: «client dont know this
 * inputs... put a hand aside of a page and when the user push this ... Assistant can fill this
 * inputs how recommendation... according of measures... and standard... Assitant have warning to
 * client these measures are approximattly values»). Lo que se prueba: la mano existe y está al
 * lado de las filas; al pulsarla las filas VACÍAS quedan escritas con lo que el taller suele
 * gastar (medidas del mueble + estándares del catálogo); lo que el cliente ya escribió no se pisa
 * y se dice; las filas que él escribió quedan marcadas `aprox.` y la marca se va cuando el cliente
 * toca la fila; y la advertencia llega al cliente por UNA superficie —su burbuja o la línea del
 * paso— con el mismo texto.
 * Los números esperados salen del despiece del sofá de 210 × 85 × 90, 3 puestos (sin cojines
 * declarados): asiento 3 × 0,70 × 0,72 = 1,51 m² y espaldar frontal 3 × 0,70 × 0,43 = 0,90 m² de
 * espuma → 3 m²; 30 bandas cada 7 cm por 0,72 m de fondo → 22 m de cinchas; 9,49 m² de tela → una
 * caja (por 12 m²), 2 rollos (por 6 m²) y 3 kg (por 4 m²).
 * ------------------------------------------------------------------------------------------- */
console.log('\nLA MANO ESTIMA LAS CANTIDADES — Y LO DICE APROXIMADO');
const png = ['1', '2', '3'].map(n => new URL(`./fixture-sofa-${n}.png`, import.meta.url).pathname);
const avanzar = async () => {
  const antes = await page.evaluate(() => state.step);
  await page.click('#nextButton');
  await page.waitForFunction(x => state.step !== x, antes);
};
/* Llegar al paso de insumos como llega el cliente: la línea, el mueble con sus fotos y las medidas.
 * El recorrido completo lo prueban wizard.spec.mjs y la evaluación por línea; aquí, la mano. */
async function hastaInsumos(opts = {}) {
  const { mueble = 'Sofá', medidas = [210, 85, 90], puestos, cobertura } = opts;
  await abrirLaLinea('Retapizado de muebles');
  await avanzar();
  await page.click(`.furniture-card[data-furniture="${mueble}"]`);
  await page.waitForTimeout(150);
  if (puestos) await page.evaluate(n => {
    const s = document.getElementById('seats');
    s.value = String(n); s.dispatchEvent(new Event('change', { bubbles: true }));
  }, puestos);
  await page.setInputFiles('#furniturePhoto', png);
  await page.waitForFunction(() => state.photos.length >= 3);
  await avanzar();
  await page.fill('#width', String(medidas[0]));
  await page.fill('#height', String(medidas[1]));
  await page.fill('#depth', String(medidas[2]));
  if (cobertura) await page.selectOption('#coverage', cobertura);
  await avanzar();
  return page.evaluate(() => [state.step, state.furniture]);
}
const valores = () => page.evaluate(() =>
  [...document.querySelectorAll('#insumoRows [data-insumo]')].map(i => [i.dataset.insumo, i.value]));
check('el sofá del seed, en el paso de insumos', await hastaInsumos(), [17, 'Sofá']);
check('la mano está al lado de las filas, y su etiqueta lleva el nombre del asistente del paquete',
  await page.evaluate(() => ({
    visible: !!document.getElementById('insumoMano').offsetParent,
    diceElNombre: document.getElementById('insumoMano').innerText.indexOf(Store.assistant().name) >= 0
  })), { visible: true, diceElNombre: true });

await page.click('#insumoMano');
await page.waitForTimeout(300);
check('pulsarla escribe las cantidades que el taller suele gastar',
  await page.evaluate(() => [...document.querySelectorAll('#insumoRows [data-insumo]')]
    .map(i => [i.dataset.insumo, i.value])),
  [['espuma', '3'], ['cinchas', '22'], ['grapas', '1'], ['hilo', '2'], ['pegante', '3']]);
check('y las marca aproximadas, en la fila (no en el estado)',
  await page.evaluate(() => [...document.querySelectorAll('#insumoRows .insumo-aprox')].map(x => x.hidden)),
  [false, false, false, false, false]);
check('la estimación las suma con el precio del catálogo (3×38.000 + 22×9.000 + 22.000 + 2×18.000 + 3×25.000)',
  await page.evaluate(() => insumosMarcados().reduce((s, x) => s + x.qty * x.cop, 0)), 445000);
check('el cliente lo lee UNA vez y en una sola superficie: la burbuja o la línea del paso, con el mismo texto',
  await page.evaluate(() => {
    const burbuja = document.querySelector('#assistantBubble .bubble-text').textContent;
    const aviso = document.getElementById('insumoAviso');
    const dicho = burbuja || aviso.textContent;
    return { aproximadas: /Son valores aproximados/.test(dicho),
             nombraLoEscrito: /3 m² de espuma/.test(dicho),
             unaSolaVoz: burbuja ? aviso.hidden : !aviso.hidden,
             mismoTexto: aviso.textContent === burbuja };
  }), { aproximadas: true, nombraLoEscrito: true, unaSolaVoz: true, mismoTexto: true });
check('queda anotado en la conversación (la traza con el cliente)',
  await page.evaluate(() => [...document.querySelectorAll('#messages .message.bot')]
    .some(m => /aproximados/.test(m.textContent))), true);

await page.click('#insumoMano');
await page.waitForTimeout(250);
check('pulsarla otra vez no pisa nada, y lo dice',
  await page.evaluate(() => ({
    dice: /Ya están todas escritas/.test(document.querySelector('#assistantBubble .bubble-text').textContent),
    valores: [...document.querySelectorAll('#insumoRows [data-insumo]')].map(i => i.value)
  })), { dice: true, valores: ['3', '22', '1', '2', '3'] });

/* Lo que el cliente ya había escrito no se pisa: se respeta y se dice cuántas. */
await page.fill('#insumoRows [data-insumo="espuma"]', '5');
await page.fill('#insumoRows [data-insumo="hilo"]', '');
await page.fill('#insumoRows [data-insumo="pegante"]', '');
await page.click('#insumoMano');
await page.waitForTimeout(250);
check('llena lo vacío, respeta lo escrito y lo dice',
  await page.evaluate(() => ({
    valores: [...document.querySelectorAll('#insumoRows [data-insumo]')].map(i => [i.dataset.insumo, i.value]),
    dice: /Dejé como estaba/.test(document.querySelector('#assistantBubble .bubble-text').textContent)
  })),
  { valores: [['espuma', '5'], ['cinchas', '22'], ['grapas', '1'], ['hilo', '2'], ['pegante', '3']], dice: true });
check('y la fila que el cliente toca deja de estar marcada como aproximada',
  await page.evaluate(() => {
    document.querySelector('#insumoRows [data-insumo="espuma"]').value = '6';
    document.querySelector('#insumoRows [data-insumo="espuma"]').dispatchEvent(new Event('input', { bubbles: true }));
    return [document.querySelector('#insumoRows [data-insumo="espuma"]').closest('.insumo-row')
      .querySelector('.insumo-aprox').hidden, insumosMarcados()[0].qty];
  }), [true, 6]);

/* Sin plantilla de despiece el tamaño sale de las medidas del mueble y de sus metros base (los del
 * backoffice), y escala con la CANTIDAD: tres poltronas no pueden recibir los insumos de una. La
 * cobertura también manda: lo que no se tapiza no se repone. */
await hastaInsumos({ mueble: 'Poltrona', medidas: [85, 90, 75], puestos: 1 });
await page.click('#insumoMano'); await page.waitForTimeout(300);
check('una poltrona: sus medidas y sus metros base (85 × 90 × 75, una pieza)',
  await valores(), [['espuma', '1'], ['cinchas', '8'], ['grapas', '1'], ['hilo', '1'], ['pegante', '2']]);
await hastaInsumos({ mueble: 'Poltrona', medidas: [85, 90, 75], puestos: 3 });
await page.click('#insumoMano'); await page.waitForTimeout(300);
check('tres poltronas: lo mismo por tres — la cantidad escala los insumos',
  await valores(), [['espuma', '3'], ['cinchas', '22'], ['grapas', '2'], ['hilo', '3'], ['pegante', '4']]);
await hastaInsumos({ mueble: 'Sofá', medidas: [210, 85, 90], puestos: 3, cobertura: 'seats' });
await page.click('#insumoMano'); await page.waitForTimeout(300);
check('«solo asiento y respaldo»: menos tela, menos insumos (la espuma no: es la misma cara)',
  await valores(), [['espuma', '3'], ['cinchas', '22'], ['grapas', '1'], ['hilo', '1'], ['pegante', '2']]);

await abrirLaLinea('Suministro de tela');
check('suministro no lo ve: la tela es el producto y no hay taller que reponga nada',
  await page.evaluate(() => [pasosVisibles().indexOf(17), asksInsumos(), insumosDeLaLinea().length]),
  [-1, false, 0]);
check('y sin ese paso no hay mano que estime: sin taller que reponga, no hay cantidades que sugerir',
  await page.evaluate(() => [!!document.getElementById('insumoMano').offsetParent, pasosVisibles().indexOf(17)]),
  [false, -1]);

console.log('\n"CAMBIO DE TELA" YA NO SE OFRECE: ESE CASO LO CUBRE RETAPIZADO SIN INSUMOS');
const textoDeLineas = await page.evaluate(() => document.body.innerText);
check('la línea "Cambio de tela" ya no está', /Cambio de tela/.test(textoDeLineas), false);
check('y su caso (solo la cubierta) sigue estando en retapizado',
  /Retapizado de muebles/.test(textoDeLineas), true);

console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'none'));
console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
