import { chromium } from 'playwright';
import { PHOTOS_DB } from './client.mjs';
import { openWizard } from './helpers.mjs';
const D = 'file://' + process.cwd() + '/generated/';
const png = ['1','2','3'].map(n=>new URL(`./fixture-sofa-${n}.png`, import.meta.url).pathname);
let fails = 0;
const check = (n, got, want) => { const ok = JSON.stringify(got)===JSON.stringify(want); if(!ok)fails++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${n}` + (ok?'':`\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)); };
const browser = await chromium.launch(); const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
async function fresh(){ await page.goto(D+'index.html');
  await page.evaluate((db)=>{localStorage.clear();indexedDB.deleteDatabase(db)}, PHOTOS_DB); await openWizard(page, D); }
async function reach(step){
  await page.setInputFiles('#furniturePhoto', png);
  await page.waitForFunction(()=>state.photos.length>=3);
  if(step>=2) await page.click('#nextButton');
  if(step>=3){ await page.fill('#width','210'); await page.fill('#height','85'); await page.fill('#depth','90'); await page.click('#nextButton'); }
  if(step>=4) await page.click('#nextButton');
  if(step>=5){ await page.click('#analyzeButton'); await page.waitForFunction(()=>state.analyzed); await page.click('#nextButton'); }
  if(step>=6) await page.click('#nextButton');
}

console.log('\nBLOCKER #1 — "Mascotas" must not hijack an explicit choice');
await fresh(); await reach(3);
await page.check('.chip-grid input[value="Mascotas"]');
await page.click('#nextButton'); await page.click('#analyzeButton');
await page.waitForFunction(()=>state.analyzed); await page.click('#nextButton');
await page.click('.fabric-card:has-text("Velvet Siena")');
check('picking a fabric keeps state / card / hidden input in sync',
  await page.evaluate(()=>[state.fabric.name,
    document.querySelector('.fabric-card.selected b').textContent.split(' · ')[0],
    document.getElementById('selectedFabric').value]),
  ['Velvet Siena','Velvet Siena','Velvet Siena']);
// El modelo por componentes da decimales, y se muestran con coma.
check('price uses the chosen rate (119.000/m)', await page.evaluate(()=>{
  const num=t=>Number(t.trim().replace(',','.'));
  const p=document.getElementById('metersRange').textContent.split('–').map(num);
  const [mn,mx]=p.length>1?p:[p[0],p[0]];
  const esperado=mn===mx?Store.money(mn*119000)
                        :`${Store.money(mn*119000)} – ${Store.money(mx*119000)}`;
  return document.getElementById('priceRange').textContent===esperado;
}), true);
await page.click('#nextButton');
check('step 6 summary agrees', await page.textContent('#summaryFabric'), 'Velvet Siena · Petróleo');

console.log('\nBLOCKER #3 — quantity counts, and is named correctly');
await fresh();
await page.click('.furniture-card[data-furniture="Cabecero"]');
check('label follows the furniture type', await page.textContent('#quantityLabel'), 'Número de cabeceros');
check('options name what is counted',
  await page.evaluate(()=>[...document.getElementById('seats').options].map(o=>o.text)),
  ['1 cabecero','2 cabeceros','3 cabeceros','4 cabeceros','5 o más cabeceros']);
await reach(5);
check('4 cabeceros needs ~4x the fabric of 1', await page.evaluate(()=>{
  const s=document.getElementById('seats');
  s.value='1'; const a=estimate(); s.value='4'; const b=estimate();
  return [Math.round(b[0]/a[0]), Math.round(b[1]/a[1])];
}), [4,4]);
await fresh(); await reach(5);
/* El sofá se calcula por piezas: los puestos no multiplican el mueble, PARTEN
 * el mismo ancho en más cojines. Eso mueve el consumo un poco — la cenefa
 * crece y los cojines empacan distinto contra el rollo — pero no lo escala.
 * Con doble conteo real, 5 puestos costaría ~5x lo de 1. */
check('sofá "puestos" does NOT double-count against width', await page.evaluate(()=>{
  const s=document.getElementById('seats');
  s.value='1'; const a=estimate(); s.value='5'; const b=estimate();
  const r=[b[0]/a[0],b[1]/a[1]];
  return r.every(x=>x>0.8&&x<1.5);
}), true);
await fresh();
await page.click('.furniture-card[data-furniture="Cabecero"]');
await reach(6);
await page.evaluate(()=>{document.getElementById('seats').value='4';updateSummary()});
check('summary names the right unit', await page.textContent('#summaryFurniture'), 'Cabecero · 4 cabeceros');
await page.evaluate(()=>{document.getElementById('seats').value='1';updateSummary()});
check('a single piece needs no count', await page.textContent('#summaryFurniture'), 'Cabecero');

console.log('\nSTEP 4 — must not fail silently');
await fresh(); await reach(4);
await page.click('#nextButton');
check('an error explains why it will not advance', await page.isVisible('#analysisError'), true);
check('and it still blocks', await page.evaluate(()=>state.step), 4);
await page.click('#analyzeButton'); await page.waitForFunction(()=>state.analyzed);
check('error clears once analysed', await page.isVisible('#analysisError'), false);

console.log('\nA11Y — real radiogroup');
await fresh();
await page.focus('.furniture-card[data-furniture="Sofá"]');
await page.keyboard.press('ArrowRight');
check('arrow keys move the selection', await page.evaluate(()=>state.furniture), 'Sofá en L');
check('roving tabindex follows', await page.$$eval('.furniture-card', e=>e.map(c=>c.tabIndex)), [-1,0,-1,-1,-1,-1]);
check('aria-checked mirrors it', await page.$$eval('.furniture-card', e=>e.map(c=>c.getAttribute('aria-checked'))),
  ['false','true','false','false','false','false']);

console.log('\nEL DIBUJO DE MEDIDAS SIGUE AL MUEBLE');
// El paso 2 es donde le pedimos al cliente que mida: el dibujo es la
// instrucción. Un cabecero con un sofá dibujado al lado enseña mal.
await fresh();
const dibujos = {};
for (const m of ['Sofá','Sofá en L','Poltrona','Silla','Cabecero','Otro']) {
  await page.click(`.furniture-card[data-furniture="${m}"]`);
  dibujos[m] = await page.$eval('#drawingShape', e => e.innerHTML.trim());
}
check('cada mueble dibuja lo suyo, no todos un sofá',
  new Set(Object.values(dibujos)).size, 6);
check('y todos dibujan algo',
  Object.values(dibujos).every(d => d.startsWith('<svg')), true);
// Un mueble creado desde el backoffice no tiene dibujo propio: cae al genérico
// en vez de quedarse en blanco o mostrar el del mueble anterior.
check('un mueble sin dibujo propio cae al genérico, no al del anterior',
  await page.evaluate(() => {
    const caja = document.getElementById('drawingShape');
    renderFurnitureDrawing('sofa');
    const sofa = caja.innerHTML;
    // El innerHTML vuelve normalizado por el parser, así que se compara
    // renderizado contra renderizado, no contra la plantilla en crudo.
    renderFurnitureDrawing('otro');
    const generico = caja.innerHTML;
    renderFurnitureDrawing('inventado-en-el-backoffice');
    return [caja.innerHTML === generico, caja.innerHTML !== sofa];
  }), [true, true]);

console.log('\npage errors: ' + (errs.length?errs.join(' | '):'none'));
console.log(fails?`\n${fails} FAILING`:'\nALL PASS');
await browser.close(); process.exit(fails?1:0);
