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
  if(step>=3){
    /* Medidas dentro de lo habitual para el mueble activo: el cotizador ya no deja seguir con
     * otras (ver «MEDIDAS FUERA DE LO HABITUAL...»), así que el fixture sale de sus rangos. */
    const m=await page.evaluate(()=>{const r=ACI.context().measurements.ranges,medio=k=>Math.round((r[k][0]+r[k][1])/2);
      return {width:medio('measurements.width'),height:medio('measurements.height'),depth:medio('measurements.depth')}});
    await page.fill('#width',String(m.width)); await page.fill('#height',String(m.height)); await page.fill('#depth',String(m.depth));
    await page.click('#nextButton'); }
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
await page.waitForFunction(()=>state.step===16);   // el paso de la estimación
await page.click('#nextButton');
await page.waitForFunction(()=>state.step===15);   // el cierre, que es donde vive el resumen
check('el resumen del cierre concuerda con la tela elegida', await page.textContent('#summaryFabric'), 'Velvet Siena · Petróleo');

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
check('ocho pasos: la barra entra sin scroll', [siete.filas, siete.scroll[0] === siete.scroll[1]], ['8', true]);
check('diez pasos (el recorrido largo, con la estimación): también entra sin scroll', [nueve.filas, nueve.scroll[0] === nueve.scroll[1]], ['10', true]);
check('la barra mide lo mismo con siete y con nueve', nueve.barra, siete.barra);
check('y el hueco de Lía (su canvas) no se mueve', [nueve.stage, nueve.canvas], [siete.stage, siete.canvas]);

/* Un «Continuar» se confirma esperando el cambio de paso: un clic que llegue antes de que el wizard
 * termine de moverse se pierde y la secuencia termina en el paso equivocado. Un solo helper para
 * las dos caminatas de esta suite. */
const avanzar = async () => {
  const antes = await page.evaluate(()=>state.step);
  await page.click('#nextButton');
  await page.waitForFunction(x=>state.step!==x, antes);
};
/* Los pasos que el motivo pide (`asks`) no abren la puerta sin respuesta: marca la primera opción. */
const responderPregunta = async (ask) => {
  const box = `#quoteForm .wizard-step[data-ask="${ask}"]`;
  if (!(await page.isVisible(`${box} .chip-grid label`))) return;
  if (!(await page.$$eval(`${box} .chip-grid input:checked`, els => els.length))) {
    await page.check(`${box} .chip-grid label:first-child input`);
  }
};

console.log('\nCADA MOTIVO LLEGA A SU ESTIMACIÓN — y el cotizador habla de lo que ese motivo trata');
/* El precio vivía DENTRO del paso de telas, así que limpieza y proyecto comercial solo veían su
 * número en el resumen final. Ahora la estimación es un paso propio y ninguno se lo salta; y el
 * nombre que el cliente lee (título, artefacto, paso) es el de su motivo, no el de las telas. */
await page.goto(D + 'index.html');
await page.evaluate((db)=>{localStorage.clear();indexedDB.deleteDatabase(db)}, PHOTOS_DB);
await page.goto(D + 'index.html');
await page.waitForTimeout(300);
const motivos = await page.$$eval('#serviceGrid .service-choice b', els => els.map(e => e.textContent));
const recorridos = [];
for (let i = 1; i <= motivos.length; i++) {
  await page.goto(D + 'index.html');
  await page.waitForTimeout(220);
  await page.click(`#serviceGrid .service-choice:nth-child(${i})`);
  await page.waitForTimeout(150);
  recorridos.push(await page.evaluate(() => {
    const c = Store.lineCopy(state.service);
    return {
      estimacion: pasosVisibles().includes(16),
      artefacto: c.artifactLabel,
      titulo: document.getElementById('journeyTitle').textContent,
      foto: document.getElementById('uploadTitle').textContent,
      pasos: pasosVisibles().length
    };
  }));
}
check('los ocho motivos pasan por el paso de la estimación', recorridos.map(r => r.estimacion), motivos.map(() => true));
check('el nombre que el cliente lee es el de su motivo',
  [recorridos[1].artefacto, recorridos[5].artefacto, recorridos[7].artefacto],
  ['Precotización de retapizado', 'Propuesta preliminar para proyecto comercial', 'Estimación de mantenimiento']);
check('y la línea pisa el default de su oficio (los cuatro de «tela» no dicen lo mismo)',
  new Set([recorridos[0].artefacto, recorridos[1].artefacto, recorridos[2].artefacto, recorridos[3].artefacto]).size, 4);
check('limpieza no habla de telas ni de «tu mueble»',
  [/limpieza/i.test(recorridos[7].titulo), /tela/i.test(recorridos[7].titulo), /piezas/i.test(recorridos[7].foto)],
  [true, false, true]);
check('y el recorrido largo (a la medida) crece un paso con la estimación',
  [recorridos[4].pasos, recorridos[7].pasos], [10, 7]);

console.log('\nMANTENIMIENTO VE SU ESTIMACIÓN EN SU PASO — y queda congelada en la solicitud');
/* El caso que la auditoría marcó como el peor: un oficio sin tela, cuyo `price` guardado era null.
 * Ahora la estimación por pieza tiene su paso Y viaja en el snapshot. */
await page.goto(D + 'index.html');
await page.evaluate((db)=>{localStorage.clear();indexedDB.deleteDatabase(db)}, PHOTOS_DB);
await page.goto(D + 'index.html');
await page.waitForTimeout(300);
await page.click('#serviceGrid .service-choice:nth-child(8)');
await avanzar();                                                        // 0 → 1 (Tu mueble)
await page.setInputFiles('#furniturePhoto', png);
await page.waitForFunction(()=>state.photos.length>=3);
await avanzar();                                                        // 1 → 3 (limpieza)
await responderPregunta('limpieza');
await avanzar();                                                        // 3 → 4 (traslado)
await responderPregunta('traslado');
await avanzar();                                                        // 4 → 13 (validación)
if (await page.isVisible('#analyzeButton')) { await page.click('#analyzeButton'); await page.waitForFunction(()=>state.analyzed); }
await avanzar();                                                        // 13 → 16 (estimación)
const enPiezas = (await page.textContent('#priceRange')).trim();
const supuestos = await page.$$eval('#estimateAssumptions li', els => els.map(e => e.textContent));
check('la limpieza enseña su estimación en su propio paso, con lo que la compone',
  [enPiezas !== '—' && enPiezas.length > 0, /Piezas: \d+/.test(supuestos.join(' | ')), /Motivo: Mantenimiento/.test(supuestos.join(' | '))],
  [true, true, true]);
check('y dice qué falta por confirmar, en el idioma del oficio',
  await page.$$eval('#estimatePendingConfirm li', els => els.map(e => e.textContent)),
  ['La cantidad de piezas', 'El estado y el tipo de manchas', 'Si el traslado va o no incluido']);
await avanzar();                                                        // 16 → 15 (contacto)
const enResumenMant = (await page.textContent('#summaryPrice')).trim();
await page.fill('#fullName','Cliente Limpieza');
await page.fill('#email','limpieza@example.com');
await page.fill('#phone','3000000000');
await page.check('#consent');
await page.click('#nextButton');
await page.waitForSelector('#successState:not([hidden])');
const mantId = (await page.textContent('#requestNumber')).trim();
const mant = await page.evaluate(i => Store.get('quotes', i), mantId);
const totalMant = await page.evaluate(i => {
  const e = Store.get('quotes', i).estimate, m = n => Store.money(n);
  return e.total[0] === e.total[1] ? m(e.total[0]) : `${m(e.total[0])} – ${m(e.total[1])}`;
}, mantId);
check('la solicitud de limpieza guarda su estimación por pieza, con el total que vio el cliente',
  [mant.estimate.kind, enPiezas, enResumenMant, totalMant], ['pieza', totalMant, totalMant, totalMant]);
check('y sin tela de por medio: lo que antes quedaba en null ahora es un número',
  [mant.price, mant.estimate.total[0] > 0, Object.keys(mant.estimate.inputs.answers).length > 0],
  [null, true, true]);
check('el artefacto también aparece en la pantalla de cierre',
  (await page.textContent('#successArtifact')).trim(), 'Estimación de mantenimiento');

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
await avanzar();                                                        // 14 → 16 (Estimación: su propio paso)
const enBloque = (await page.textContent('#priceRange')).trim();
await avanzar();                                                        // 16 → 15 (Contacto)
const enResumen = (await page.textContent('#summaryPrice')).trim();
check('el paso de la estimación y el resumen final dicen el mismo número', [enBloque, enResumen], [enBloque, enBloque]);
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

console.log('\n«OTRO» PIDE LA DESCRIPCIÓN — Y NO DEJA SEGUIR SIN ELLA');
await fresh();
/* El cotizador puede preguntar la línea primero: se elige la primera para caer en «Tu mueble». */
await page.evaluate(()=>{const c=document.querySelector('#serviceGrid .service-choice');if(c)c.click()});
await page.click('#nextButton');
const enMueble=()=>page.evaluate(()=>({
  paso:state.step,
  campo:!document.getElementById('furnitureOtherField').hidden,
  visible:!!document.getElementById('furnitureOtherField').offsetParent,
  valor:document.getElementById('furnitureOther').value,
  mueble:state.furniture,
  nota:ACI.context().furnitureNote}));
check('con un mueble normal el campo no existe', [(await enMueble()).campo,(await enMueble()).visible], [false,false]);
await page.click('.furniture-card:has-text("Otro")');
const conOtro=await enMueble();
check('elegir «Otro» abre el campo para contarlo', [conOtro.campo, conOtro.visible, conOtro.mueble], [true, true, 'Otro']);
await page.setInputFiles('#furniturePhoto', png);
await page.waitForFunction(()=>state.photos.length>=3);
await page.click('#nextButton');
const sinDescripcion=await enMueble();
check('sin la descripción no se avanza, y el error lo dice',
  [sinDescripcion.paso===conOtro.paso, await page.isVisible('#furnitureOtherError')], [true, true]);
await page.fill('#furnitureOther','Banco de piano');
const escrito=await enMueble();
check('y lo escrito no se reescribe solo', escrito.valor, 'Banco de piano');
check('el contexto del asistente lleva la descripción', escrito.nota, 'Banco de piano');
await page.click('#nextButton');
check('con la descripción escrita el cotizador sigue', (await enMueble()).paso>sinDescripcion.paso, true);

console.log('\nMEDIDAS MUY FUERA DE LO HABITUAL NO DEJAN SEGUIR — LA IA AVISA Y EL PASO BLOQUEA');
await fresh();
await page.evaluate(()=>{const c=document.querySelector('#serviceGrid .service-choice');if(c)c.click()});
await page.click('#nextButton');
await page.evaluate(()=>{document.querySelector('.furniture-card').click()});   // Sofá
await page.setInputFiles('#furniturePhoto', png);
await page.waitForFunction(()=>state.photos.length>=3);
for(let i=0;i<4 && await page.evaluate(()=>ACI.stepId(state.step)!=='MEASUREMENTS');i++){ await page.click('#nextButton'); await page.waitForTimeout(200); }
const enMedidas=await page.evaluate(()=>state.step);
await page.fill('#width','210'); await page.fill('#height','85');
await page.fill('#depth','200');   // muy fuera: lo habitual va de 70 a 120 y el margen llega hasta 130
await page.click('#nextButton');
const bloqueado=await page.evaluate(()=>({
  paso:state.step,
  error:!document.getElementById('measureError').hidden,
  texto:document.getElementById('measureError').textContent}));
check('con una medida muy fuera de lo habitual no se avanza, y el paso dice por qué',
  [bloqueado.paso===enMedidas, bloqueado.error], [true, true]);
check('y el error trae el número y el rango habitual del mueble, del propio cotizador',
  /El fondo de 200 cm está muy fuera de lo habitual para sofá \(lo habitual: 70 a 120 cm\)/.test(bloqueado.texto), true);
/* La medida es aproximada, no exacta: quedar apenas fuera de lo habitual no detiene a nadie. */
await page.fill('#depth','130');   // apenas fuera (120), dentro del margen del 20 % (±10)
await page.click('#nextButton');
check('una medida aproximada, apenas fuera de lo habitual, sí deja seguir',
  (await page.evaluate(()=>state.step))>enMedidas, true);

console.log('\nLOS PASOS DE PREGUNTA REPARTEN EL PANEL — TARJETAS GRANDES, SIN HUECO ABAJO');
/* El diseño: el paso de pregunta llena el panel, las tarjetas de opción crecen hasta su tope y lo
 * que sobra se centra dentro del grupo (la mitad de aire arriba del bloque, la mitad abajo). Se mide
 * aquí, a 1280×720 (el viewport de la suite): antes de esto las tarjetas medían 52 px de alto y el
 * paso del relleno dejaba 244 px muertos entre las tarjetas y «Continuar». */
const medirGrupo = () => page.evaluate(() => {
  const act = document.querySelector('.wizard-step.active');
  const grupo = act.querySelector('.choice-group'), h3 = grupo.querySelector('h3');
  const grid = grupo.querySelector('.chip-grid'), tarjeta = grid.querySelector('span');
  const g = grupo.getBoundingClientRect(), gr = grid.getBoundingClientRect(), t = h3.getBoundingClientRect();
  return { paso: act.dataset.step, tarjeta: Math.round(tarjeta.getBoundingClientRect().height),
    arriba: Math.round(t.top - g.top), abajo: Math.round(g.bottom - gr.bottom) };
});
const abrirEnElPaso = async (linea, paso) => {
  await page.goto(D + 'index.html');
  await page.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
  await page.reload();
  await page.click(`#serviceGrid .service-choice:has-text("${linea}")`);
  await page.click('#nextButton');
  await page.evaluate((n) => showStep(n), paso);
  await page.waitForTimeout(250);
  return medirGrupo();
};
const tapizado = await abrirEnElPaso('Muebles a la medida', 11);
check('las tarjetas de opción son altas de verdad (no la tira de 52 px de antes)',
  tapizado.tarjeta >= 150, true);
check('y el bloque se centra: el aire de arriba y el de abajo se diferencian en menos de 12 px',
  Math.abs(tapizado.arriba - tapizado.abajo) <= 12, true);
const limpieza = await abrirEnElPaso('Mantenimiento y limpieza', 3);
check('el mismo reparto en otro motivo (mantenimiento y limpieza)',
  [limpieza.tarjeta >= 150, Math.abs(limpieza.arriba - limpieza.abajo) <= 12], [true, true]);

console.log('\npage errors: ' + (errs.length?errs.join(' | '):'none'));
console.log(fails?`\n${fails} FAILING`:'\nALL PASS');
await browser.close(); process.exit(fails?1:0);
