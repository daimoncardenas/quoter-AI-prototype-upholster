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
const antesDelBloqueo = await page.evaluate(()=>state.step);
await page.click('#nextButton');
check('an error explains why it will not advance', await page.isVisible('#analysisError'), true);
/* Relativo a propósito: el paso de Validación dejó de ser el «4» cuando entraron los pasos de la
 * línea y de los daños, y lo que importa es que NO avance, no el número que le tocó. */
check('and it still blocks', await page.evaluate(()=>state.step), antesDelBloqueo);
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

console.log('\nLA BARRA NO CRECE CON LOS PASOS — el hueco de Lía queda igual');
/* Su regla: «suministro de tela» es el tamaño MÁXIMO de la barra. Con nueve pasos (a la medida)
 * la lista se aprieta y la barra, el pie y el hueco de Lía tienen que quedar en el mismo sitio.
 * Se compara el caso de nueve contra el de siete en la MISMA ventana. */
const barra = async (motivo) => {
  await page.goto(D + 'index.html');
  await page.evaluate(() => Store.saveSettings({ plan: 'Business', disabledLines: [] }));
  await page.goto(D + 'index.html');
  await page.waitForTimeout(400);
  await page.click(`#serviceGrid .service-choice:has-text("${motivo}")`);
  await page.waitForFunction(() => document.getElementById('assistantStage').classList.contains('ready'), null, { timeout: 8000 }).catch(() => {});
  return page.evaluate(() => {
    const j = document.querySelector('.journey'), st = document.getElementById('assistantStage');
    const c = st.querySelector('canvas');
    const r = e => { const x = e.getBoundingClientRect(); return [Math.round(x.top), Math.round(x.height)]; };
    return { filas: j.dataset.rows, barra: r(j), stage: r(st), canvas: r(c), scroll: [j.scrollHeight, j.clientHeight] };
  });
};
const siete = await barra('Suministro de tela');
const nueve = await barra('Muebles a la medida');
check('siete pasos: la barra entra sin scroll', [siete.filas, siete.scroll[0] === siete.scroll[1]], ['7', true]);
check('nueve pasos: también entra sin scroll', [nueve.filas, nueve.scroll[0] === nueve.scroll[1]], ['9', true]);
check('la barra mide lo mismo con siete y con nueve', nueve.barra, siete.barra);
check('y el hueco de Lía (su canvas) no se mueve', [nueve.stage, nueve.canvas], [siete.stage, siete.canvas]);

console.log('\nLA SOLICITUD GUARDA LA ESTIMACIÓN QUE VIO EL CLIENTE — no solo el rango de la tela');
/* Hallazgo de la auditoría: la pantalla mostraba la estimación del oficio (material + mano de obra
 * + daños, o piezas, m², unidades, fabricación) y la solicitud guardaba metros × precio de tela — o
 * nada. Ahora la estimación viaja congelada con sus entradas, así que una solicitud vieja sigue
 * diciendo el número que se le mostró al cliente aunque el catálogo haya cambiado. Retapizado es el
 * caso con mano de obra (60 %): su estimación NO es el rango de la tela. */
await page.goto(D + 'index.html');
await page.evaluate((db)=>{localStorage.clear();indexedDB.deleteDatabase(db)}, PHOTOS_DB);
await page.goto(D + 'index.html');
await page.waitForTimeout(300);
await page.click('#serviceGrid .service-choice:nth-child(2)');          // Retapizado de muebles
/* Cada «Continuar» se confirma esperando el cambio de paso: un clic que llegue antes de que el
 * wizard termine de moverse se pierde y la secuencia termina en el paso equivocado. */
const avanzar = async () => {
  const antes = await page.evaluate(()=>state.step);
  await page.click('#nextButton');
  await page.waitForFunction(x=>state.step!==x, antes);
};
await avanzar();
await page.setInputFiles('#furniturePhoto', png);
await page.waitForFunction(()=>state.photos.length>=3);
await avanzar();                                                        // 1 → 9 (Medidas)
await page.fill('#width','210'); await page.fill('#height','85'); await page.fill('#depth','90');
await avanzar();                                                        // 9 → 12 (Preferencias)
await avanzar();                                                        // 12 → 13 (Validación)
/* La validación no abre la puerta sin revisar: el botón de análisis vive en este paso. */
if (await page.isVisible('#analyzeButton')) { await page.click('#analyzeButton'); await page.waitForFunction(()=>state.analyzed); }
await avanzar();                                                        // 13 → 14 (Recomendación)
await page.waitForSelector('#fabricGrid .fabric-card');
await page.click('#fabricGrid .fabric-card:nth-child(1)');
const enBloque = (await page.textContent('#priceRange')).trim();
await avanzar();                                                        // 14 → 15 (Contacto)
const enResumen = (await page.textContent('#summaryPrice')).trim();
check('la recomendación y el resumen final dicen el mismo número', [enBloque, enResumen], [enBloque, enBloque]);
await page.fill('#fullName','Cliente Prueba');
await page.fill('#email','prueba@example.com');
await page.fill('#phone','3000000000');
await page.check('#consent');
await page.click('#nextButton');
await page.waitForSelector('#successState:not([hidden])');
const estId = (await page.textContent('#requestNumber')).trim();
const guardada = await page.evaluate(i => Store.get('quotes', i), estId);
const totalComoSeEscribe = await page.evaluate(i => {
  const e = Store.get('quotes', i).estimate, m = n => Store.money(n);
  return e.total[0] === e.total[1] ? m(e.total[0]) : `${m(e.total[0])} – ${m(e.total[1])}`;
}, estId);
check('el total guardado es, palabra por palabra, el que vio el cliente',
  [enBloque, enResumen], [totalComoSeEscribe, totalComoSeEscribe]);
check('y viaja con su motor, su desglose y su versión de snapshot',
  [guardada.estimate.kind, /Mano de obra/.test(guardada.estimate.parts.map(p=>p.label).join(' | ')),
   guardada.estimate.parts.length >= 2, guardada.estimate.engineVersion],
  ['tela', true, true, 1]);
check('la estimación guardada no es el rango de tela que se guardaba antes (era el hallazgo)',
  guardada.estimate.total[0] > guardada.price[0], true);
check('la solicitud sigue trayendo su rango de tela de siempre (compatibilidad)',
  [Array.isArray(guardada.price), guardada.price.length], [true, 2]);
check('y las entradas que produjeron el número quedan para poder auditarlo',
  [typeof guardada.estimate.inputs.answers, Array.isArray(guardada.estimate.inputs.boq),
   guardada.estimate.inputs.quantity > 0, guardada.estimate.inputs.fabricPerM2 > 0,
   Array.isArray(guardada.estimate.inputs.materialRange),
   /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(guardada.estimate.calculatedAt))],
  ['object', true, true, true, true, true]);

console.log('\npage errors: ' + (errs.length?errs.join(' | '):'none'));
console.log(fails?`\n${fails} FAILING`:'\nALL PASS');
await browser.close(); process.exit(fails?1:0);
