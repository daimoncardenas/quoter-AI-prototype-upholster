/* El modelo por componentes: piezas rectangulares empacadas contra el ancho del
 * rollo de la tela elegida, con el rango base del mueble como respaldo para los
 * tipos que todavía no tienen plantilla. */
import { chromium } from 'playwright';
import { openAdmin, openWizard } from './helpers.mjs';
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
await openWizard(page, D);
await page.evaluate(() => localStorage.clear());
await openWizard(page, D);

const SOFA = { width: 210, height: 85, depth: 90, seats: 3, cushions: 3, coverage: 'complete' };
const est = (mueble, inp, rollWidthCm) => page.evaluate(([m, i, w]) => {
  // La tela lisa declara que puede girar: los números calibrados de esta suite
  // son los de una tela `free` (docs/consumo-direccional.md).
  const r = Store.estimateByComponents(Store.furnitureByName(m), i, { rollWidthCm: w, cutDirection: 'free' });
  return r && { tecnico: r.tecnico, range: r.range, piezas: r.despiece.length };
}, [mueble, inp, rollWidthCm]);

console.log('\nTHE ROLL WIDTH IS A PACKING CONSTRAINT, NOT A DIVISOR');
// Two 65 cm pieces sit side by side on a 140 cm roll; two 80 cm pieces cannot.
// That is the whole reason roll width could never be a global number.
check('pieces that share a row cost one row, not two',
  await page.evaluate(() => {
    const uno = Store.estimateByComponents(Store.furnitureByName('Sofá'),
      { width: 130, height: 85, depth: 90, seats: 2, cushions: 2, coverage: 'partial' },
      { rollWidthCm: 140, cutDirection: 'free' });
    // 65 cm cushions: two fit across 140. Widen them past half the roll and
    // the same two pieces need a row each.
    const dos = Store.estimateByComponents(Store.furnitureByName('Sofá'),
      { width: 160, height: 85, depth: 90, seats: 2, cushions: 2, coverage: 'partial' },
      { rollWidthCm: 140, cutDirection: 'free' });
    return dos.tecnico > uno.tecnico;
  }), true);

const r140 = await est('Sofá', SOFA, 140);
const r150 = await est('Sofá', SOFA, 150);
const r280 = await est('Sofá', SOFA, 280);
check('a 3-plaza sofa on a 140 roll lands in the range a real one does',
  [r140.tecnico, r140.range], [10.91, [12.5, 14]]);
check('a wider roll genuinely costs less fabric, and it is not linear',
  [r150.tecnico < r140.tecnico, r280.tecnico < r150.tecnico,
   Math.round(r140.tecnico / r280.tecnico * 10) / 10],
  [true, true, 2]);
check('every cut type is accounted for', r140.piezas, 9);

console.log('\nLA ORIENTACIÓN ES DE LA TELA: SIN DATO NO SE GIRA');
/* Rotar una pieza es lo que hace barato el despiece… y lo que descuadra una tela
 * con dirección (pelo, rayas, dibujo). El permiso lo da la TELA (`cutDirection`),
 * no el mueble, y un registro sin el dato no gira: cotizar de menos es el único
 * error del cotizador que el cliente no puede corregir al cortar. */
const conDireccion = await page.evaluate(() => {
  const mueble = Store.furnitureByName('Sofá');
  const i = { width: 210, height: 85, depth: 90, seats: 3, cushions: 3, coverage: 'complete' };
  const libre = Store.estimateByComponents(mueble, i, { rollWidthCm: 140, cutDirection: 'free' });
  const direccional = Store.estimateByComponents(mueble, i, { rollWidthCm: 140, cutDirection: 'directional' });
  const sinDato = Store.estimateByComponents(mueble, i, { rollWidthCm: 140 });
  return {
    libre: libre.tecnico, direccional: direccional.tecnico, sinDato: sinDato.tecnico,
    giroLibre: libre.rotated, giroDireccional: direccional.rotated,
    estadoSinDato: sinDato.cutDirection,
  };
});
check('una tela con dirección cuesta MÁS: ninguna pieza se gira',
  conDireccion.direccional > conDireccion.libre, true);
check('y la respuesta dice cuál se giró y cuál no',
  [conDireccion.giroLibre, conDireccion.giroDireccional], [true, false]);
check('un registro sin el dato se comporta como direccional (unknown, no free)',
  [conDireccion.estadoSinDato, conDireccion.sinDato === conDireccion.direccional], ['unknown', true]);

console.log('\nCOVERAGE SELECTS PIECES INSTEAD OF SCALING A NUMBER');
const solo = await est('Sofá', { ...SOFA, coverage: 'partial' }, 140);
const asientos = await est('Sofá', { ...SOFA, coverage: 'seats' }, 140);
check('cojines only, cojines plus respaldos, then the whole sofa',
  [solo.piezas, asientos.piezas, r140.piezas], [3, 5, 9]);
check('and each one costs strictly less than the next',
  [solo.tecnico < asientos.tecnico, asientos.tecnico < r140.tecnico], [true, true]);

console.log('\nPUESTOS PARTITION THE SOFA, THEY DO NOT MULTIPLY IT');
// The old heuristic multiplied a baseline by quantity, which double-counted
// against the width. Here the same width is cut into more, smaller cushions.
const porPuestos = await Promise.all([1, 2, 3, 4, 5].map(n => est('Sofá', { ...SOFA, seats: n, cushions: n }, 140)));
const metros = porPuestos.map(r => r.tecnico);
check('five puestos does not cost five times one',
  [Math.max(...metros) / Math.min(...metros) < 1.3, metros.length], [true, 5]);
// It is lumpy on purpose: pieces of one type never share a row with another
// type, so a 0.73 m cushion wastes what a 0.53 m arm piece would have used.
// Conservative — an estimate that errs high is the safe direction.
check('but it does move, because the cushions pack differently',
  new Set(metros).size > 1, true);

console.log('\nTYPES WITHOUT A TEMPLATE FALL BACK, THEY DO NOT BREAK');
check('only the sofa has a template so far',
  await page.evaluate(() => ['Sofá','Sofá en L','Poltrona','Silla','Cabecero','Otro']
    .map(n => Store.hasComponentModel(Store.furnitureByName(n)))),
  [true, false, false, false, false, false]);
check('a type with no template returns null instead of a wrong number',
  await est('Poltrona', SOFA, 140), null);
check('and the wizard still quotes it, from the baseline range',
  await page.evaluate(() => {
    document.querySelector('.furniture-card[data-furniture="Poltrona"]').click();
    document.getElementById('width').value = '90';
    document.getElementById('height').value = '95';
    document.getElementById('depth').value = '85';
    const r = estimate();
    return [r.length === 2, r[0] > 0, r[1] > r[0]];
  }), [true, true, true]);

console.log('\nTHE WIZARD ONLY ASKS WHAT THE CALCULATION USES');
check('the template declares which optional fields it consumes',
  await page.evaluate(() => [
    Store.templateUses(Store.furnitureByName('Sofá'), 'cushions'),
    Store.templateUses(Store.furnitureByName('Poltrona'), 'cushions'),
    Store.templateUses(Store.furnitureByName('Sofá'), 'inventado')]),
  [true, false, false]);
check('so cojines is asked on the sofa and hidden everywhere else',
  await page.evaluate(() => {
    const ver = n => { document.querySelector(`.furniture-card[data-furniture="${n}"]`).click();
                       return !document.getElementById('cushionsField').hidden; };
    return ['Sofá','Poltrona','Silla','Cabecero'].map(ver);
  }), [true, false, false, false]);
// Hidden means not asked: the quote must not carry a number the customer never
// chose for that furniture.
check('and a hidden field contributes nothing to the estimate',
  await page.evaluate(() => {
    document.querySelector('.furniture-card[data-furniture="Poltrona"]').click();
    document.getElementById('cushions').value = '5';
    return wizardInputs().cushions;
  }), 0);

console.log('\nCOVERAGE: PERCENTAGES FOR THE BASELINE, PIECES FOR THE TEMPLATE');
// Los dos modelos resuelven la cobertura de forma distinta y eso está bien: el
// de piezas elige QUÉ se tapiza, que es el mecanismo correcto. Multiplicar
// encima contaría dos veces lo mismo. Lo que no puede pasar es que el
// backoffice mueva el número creyendo que el sofá se entera.
await page.evaluate(() => { Store.saveSettings({ coverageSeats: [10,10], coveragePartial: [5,5] }); });
const proporcion = (mueble, ancho) => page.evaluate(([m, w]) => {
  document.querySelector(`.furniture-card[data-furniture="${m}"]`).click();
  document.getElementById('width').value = w;
  document.getElementById('height').value = '85';
  document.getElementById('depth').value = '90';
  const c = document.getElementById('coverage');
  c.value = 'complete'; const todo = estimate()[0];
  c.value = 'seats';    const asientos = estimate()[0];
  c.value = 'partial';  const parte = estimate()[0];
  c.value = 'complete';
  return [Math.round(asientos / todo * 100), Math.round(parte / todo * 100)];
}, [mueble, ancho]);
check('el modelo base obedece los porcentajes configurados (10 / 5)',
  (await proporcion('Poltrona', '90')).map(x => Math.abs(x - 10) <= 2 || Math.abs(x - 5) <= 2), [true, true]);
const sofa = await proporcion('Sofá', '210');
check('el sofá NO los usa: su proporción sale de las piezas, y queda muy por encima',
  [sofa[0] > 50, sofa[1] > 40], [true, true]);
await page.evaluate(() => { Store.saveSettings({ coverageSeats: [68,70], coveragePartial: [45,50] }); });

console.log('\nMISSING MEASUREMENTS FALL BACK TOO');
check('no width means no piece model, not a piece of size zero',
  await est('Sofá', { ...SOFA, width: 0 }, 140), null);

console.log('\nTHE BACKOFFICE STILL DRIVES IT');
await openAdmin(page, D);
await page.click('button[data-page="settings"]');
await page.fill('#setTolerance', '20');
await page.click('#saveSettings');
check('a wider tolerance widens the published range, not the technical number',
  await page.evaluate(() => {
    const i = { width: 210, height: 85, depth: 90, seats: 3, cushions: 3, coverage: 'complete' };
    const r = Store.estimateByComponents(Store.furnitureByName('Sofá'), i, { rollWidthCm: 140, cutDirection: 'free' });
    return [r.tecnico, r.range[1] - r.range[0] > 3];
  }), [10.91, true]);

// The roll width lives on the fabric now, so editing it there moves the metres.
await page.click('button[data-page="fabrics"]');
await page.click('[data-edit-fabric="1"]');
await page.fill('#fabricForm [name=rollWidthCm]', '280');
await page.click('#fabricForm button.primary');
check('and the roll width edited on the tela reaches the calculation',
  await page.evaluate(() => Store.estimateByComponents(
    Store.furnitureByName('Sofá'),
    { width: 210, height: 85, depth: 90, seats: 3, cushions: 3, coverage: 'complete' },
    Store.get('fabrics', 1)).tecnico), 5.37);

console.log('\nUN CATÁLOGO GUARDADO ANTES DEL DATO SE MIGRA SOLO');
/* Un navegador que ya tiene sus telas guardadas no va a perder el número que veía:
 * la referencia del PACK hereda lo que el pack declara (por id), y una tela propia
 * del negocio se queda sin el dato — y sin dato, no se gira. */
check('la tela del pack hereda su orientación; una referencia propia se queda en unknown',
  await page.evaluate(() => {
    const clave = Object.keys(localStorage).find(k => k.endsWith('fabrics'));
    const antes = localStorage.getItem(clave);
    localStorage.setItem(clave, JSON.stringify([
      { id: 1, name: 'Lino Verona', price: 89000, rollWidthCm: 140, active: true },
      { id: 99, name: 'La mía', price: 50000, rollWidthCm: 140, active: true },
    ]));
    const vistas = Store.all('fabrics');
    const regla = id => Store.fabricRules(vistas.find(f => f.id === id)).cutDirection;
    const salida = [regla(1), regla(99)];
    if (antes === null) localStorage.removeItem(clave); else localStorage.setItem(clave, antes);
    return salida;
  }), ['free', 'unknown']);

console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'none'));
console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
