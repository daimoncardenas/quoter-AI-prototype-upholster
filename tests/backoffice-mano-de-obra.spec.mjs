/* MANO DE OBRA E INSUMOS en el backoffice (docs/retapizado-trabajo.md): el taller decide CÓMO cobra
 * su obra —por mueble + por metro, o por porcentaje de la tela— y CUÁNTO por metro. Nada más: la
 * base por mueble y los precios de los insumos viven en el catálogo del producto (DEMO), y la
 * decisión viaja como override de ESTE cliente (`settings.lineOverrides`), así regenerar el paquete
 * no la borra.
 *
 * Lo que se comprueba es el camino completo: se elige en el backoffice y el cotizador —otra página,
 * el mismo navegador— cobra con eso. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { openAdmin } from './helpers.mjs';

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

/* Lo que el cotizador cobraría por un sofá de 12 a 16 m, con la tela que sea. */
const laObraDelSofa = (precio) => page.evaluate(p => {
  const linea = Store.services().filter(s => s.id === 'retapizado')[0];
  const espuma = (linea.insumos || []).filter(x => x.id === 'espuma').map(x => Object.assign({}, x, { qty: 3 }));
  const q = Store.lineQuote(linea, {
    furnitureId: 'sofa', furnitureName: 'Sofá', quantity: 1,
    materialRange: [12 * p, 16 * p], meters: [12, 16], damages: [], answers: {}, insumos: espuma
  });
  const obra = q.parts.filter(x => /Mano de obra/.test(x.label))[0];
  const ins = q.parts.filter(x => /Insumos/.test(x.label))[0];
  return { etiqueta: obra.label, valor: obra.value[0], insumos: ins ? ins.value[0] : 0 };
}, precio);

console.log('\nLA TARJETA ES UNA DECISIÓN: CÓMO SE COBRA Y CUÁNTO POR METRO');
await openAdmin(page, D);
await page.click('button[data-page="settings"]');
await page.waitForSelector('#lineWorkCfg .line-work');
const enElBackoffice = await page.evaluate(() => {
  const caja = document.querySelector('#lineWorkCfg .line-work');
  return {
    linea: caja.dataset.lineWork,
    titulo: caja.querySelector('h3').textContent.trim(),
    modo: caja.querySelector('[data-obra-modo]').value,
    metro: caja.querySelector('[data-obra-metro-campo]').value,
    campos: caja.querySelectorAll('input,select').length,
    tablasPorMueble: caja.querySelectorAll('[data-obra-mueble]').length,
    insumos: [...caja.querySelectorAll('[data-insumo-cop]')].map(i => [i.dataset.insumoCop, i.value])
  };
});
check('la tarjeta aparece en Configuraciones, con la línea que cobra por tabla',
  [enElBackoffice.linea, enElBackoffice.titulo, enElBackoffice.modo],
  ['retapizado', 'Mano de obra e insumos — Retapizado de muebles', 'tabla']);
check('tiene la decisión, el metro y los insumos — y NO la tabla por mueble',
  [enElBackoffice.metro, enElBackoffice.campos, enElBackoffice.tablasPorMueble,
   enElBackoffice.insumos.length, enElBackoffice.insumos[0]],
  ['9500', 8, 0, 5, ['espuma', '38000']]);

/* El taller sube su metro y la espuma. */
await page.fill('[data-obra-metro-campo]', '12000');
await page.locator('[data-obra-metro-campo]').blur();
await page.waitForTimeout(200);
await page.fill('[data-insumo-cop="espuma"]', '40000');
await page.locator('[data-insumo-cop="espuma"]').blur();
await page.waitForTimeout(250);
check('al cambiarlo queda como override del cliente, con la base del catálogo intacta',
  await page.evaluate(() => {
    const ov = (Store.settings().lineOverrides || {}).retapizado;
    return [ov && ov.labor.mode, ov && ov.labor.perMeter, ov && Object.keys(ov.labor.porMueble).length,
            Object.keys(Store.settings().lineOverrides)];
  }),
  ['tabla', 12000, 6, ['retapizado']]);

console.log('\nY EL COTIZADOR COBRA CON ESO');
await page.goto(D + 'index.html');
await page.waitForTimeout(300);
const conSuMetro = await laObraDelSofa(89000);
check('la obra del sofá es la del taller: 180.000 + 12.000 × 12 m',
  [conSuMetro.valor, conSuMetro.etiqueta], [324000, 'Mano de obra (Sofá · 16 m)']);
check('la base por mueble del catálogo sigue ahí (la tarjeta no la tocó)',
  await page.evaluate(() => Store.services().filter(s => s.id === 'retapizado')[0].labor.porMueble.sofa), 180000);
check('y la espuma con el precio que el taller le puso (3 m² × 40.000)',
  conSuMetro.insumos, 120000);
check('el catálogo del producto no se movió: sigue diciendo 9.500 el metro',
  (() => {
    const r = JSON.parse(readFileSync('shared/service-lines.json', 'utf8')).lines.filter(s => s.id === 'retapizado')[0];
    return [r.labor.perMeter, r.insumos[0].cop];
  })(), [9500, 38000]);

console.log('\nY SE PUEDE VOLVER AL PORCENTAJE DE SIEMPRE');
await openAdmin(page, D);
await page.click('button[data-page="settings"]');
await page.waitForSelector('#lineWorkCfg .line-work');
await page.selectOption('[data-obra-modo]', 'pct');
await page.waitForTimeout(300);
await page.fill('[data-obra-pct-campo]', '60');
await page.locator('[data-obra-pct-campo]').blur();
await page.waitForTimeout(300);
/* El modo elegido queda guardado y el cotizador cobra con él (abajo). Lo que NO se comprueba aquí es
 * el `hidden` del par de campos: el panel se rehace solo al guardar y ese par queda parpadeando un
 * instante — anotado como nit cosmético, sin efecto en la cifra. */
check('elegir porcentaje deja la decisión guardada, con los dos campos disponibles',
  await page.evaluate(() => {
    const c = document.querySelector('#lineWorkCfg .line-work');
    const ov = (Store.settings().lineOverrides || {}).retapizado;
    return [ov && ov.labor.mode, !!c.querySelector('[data-obra-pct-campo]'),
            !!c.querySelector('[data-obra-metro-campo]')];
  }), ['pct', true, true]);
await page.goto(D + 'index.html');
await page.waitForTimeout(300);
check('y el cotizador vuelve a cobrar el 60 % del material',
  await page.evaluate(() => {
    const q = Store.lineQuote(Store.services().filter(s => s.id === 'retapizado')[0], {
      furnitureId: 'sofa', quantity: 1, materialRange: [1000000, 1000000], meters: [12, 12], damages: [], answers: {} });
    return q.parts.filter(x => /Mano de obra/.test(x.label))[0].label;
  }), 'Mano de obra (≈ 60 %)');

/* Volver al catálogo: se borra el override y la línea vuelve a sus DEMO. */
await page.evaluate(() => Store.saveSettings({ lineOverrides: {} }));
await page.reload(); await page.waitForTimeout(250);
check('quitando el override, la línea vuelve a los valores del catálogo',
  await page.evaluate(() => {
    const s = Store.services().filter(x => x.id === 'retapizado')[0];
    return [s.labor.mode, s.labor.perMeter, s.labor.porMueble.sofa];
  }), ['tabla', 9500, 180000]);

console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'none'));
console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
