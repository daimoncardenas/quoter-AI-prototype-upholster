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

await abrirLaLinea('Suministro de tela');
check('suministro no lo ve: la tela es el producto y no hay taller que reponga nada',
  await page.evaluate(() => [pasosVisibles().indexOf(17), asksInsumos(), insumosDeLaLinea().length]),
  [-1, false, 0]);

console.log('\n"CAMBIO DE TELA" YA NO SE OFRECE: ESE CASO LO CUBRE RETAPIZADO SIN INSUMOS');
const textoDeLineas = await page.evaluate(() => document.body.innerText);
check('la línea "Cambio de tela" ya no está', /Cambio de tela/.test(textoDeLineas), false);
check('y su caso (solo la cubierta) sigue estando en retapizado',
  /Retapizado de muebles/.test(textoDeLineas), true);

console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'none'));
console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
