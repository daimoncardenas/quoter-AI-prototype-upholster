import { chromium } from 'playwright';
import { PHOTOS_DB } from './client.mjs';
import { openWizard, elegirAtencion } from './helpers.mjs';
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

/* Con el asistente encendido la explicación la dice su burbuja: la línea del paso queda escrita
 * —el mismo texto— pero oculta (docs/errores-con-lia.md). */
const avisoDeElla = () => page.evaluate(() => ({
  burbuja: (document.querySelector('#assistantBubble .bubble-text') || {}).textContent || '',
  visible: !!document.querySelector('#assistantBubble:not([hidden])') }));

console.log('\nSTEP 4 — must not fail silently');
await fresh(); await reach(4);
const antesDelBloqueo = await page.evaluate(()=>state.step);
await page.click('#nextButton');
const avisoRevision = await avisoDeElla();
check('an error explains why it will not advance',
  [avisoRevision.visible, avisoRevision.burbuja.length > 0, await page.isVisible('#analysisError')], [true, true, false]);
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
  /* La barra y el hueco de Lía se reacomodan en los cuadros que siguen al cambio de línea: se mide
   * cuando la página quedó quieta, no en el mismo golpe del clic (medir en carrera daba 1 px de
   * diferencia entre motivos). */
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const j = document.querySelector('.journey'), st = document.getElementById('assistantStage');
    const c = st.querySelector('canvas');
    const r = e => { const x = e.getBoundingClientRect(); return [Math.round(x.top), Math.round(x.height)]; };
    return { filas: j.dataset.rows, barra: r(j), stage: r(st), canvas: r(c), scroll: [j.scrollHeight, j.clientHeight] };
  });
};
const siete = await barra('Suministro de tela');
const nueve = await barra('Muebles a la medida');
check('nueve pasos (suministro, con su ruta): la barra entra sin scroll', [siete.filas, siete.scroll[0] === siete.scroll[1]], ['9', true]);
check('diez pasos (el recorrido largo, con la estimación): también entra sin scroll', [nueve.filas, nueve.scroll[0] === nueve.scroll[1]], ['10', true]);
check('la barra mide lo mismo con siete y con nueve', nueve.barra, siete.barra);
/* Su hueco arranca en el mismo borde con 1 px de holgura: desde que la línea sin mueble aloja la
 * subida de fotos en su primer paso, el reparto fraccionario de la rejilla redondea 1 px distinto
 * (medido: alto x=-1/1, borde ±1). Lo que se sostiene exacto es que la barra entre sin scroll y
 * mida lo mismo; el pixel de redondeo no corre su hueco a la vista. */
const mismoBorde = (a, b) => Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1;
check('y el hueco de Lía (su canvas) no se mueve (mismo borde, 1 px de redondeo a lo sumo)',
  [mismoBorde(nueve.stage, siete.stage), mismoBorde(nueve.canvas, siete.canvas)], [true, true]);

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
  ['Pre-cotización de retapizado', 'Propuesta preliminar para proyecto comercial', 'Estimación de mantenimiento']);
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
await elegirAtencion(page);
await page.check('#consent');
await page.click('#nextButton');
await page.waitForSelector('#successState:not([hidden])');
const mantId = (await page.textContent('#requestNumber')).trim();
const mant = await page.evaluate(i => Store.get('quotes', i), mantId);
/* Lo que el cliente leyó es un RANGO: la línea por pieza cae en un solo número y el pre-cotizador
 * lo abre con el margen declarado de la casa (docs/precotizacion-rango.md). El motor sigue dando su
 * número exacto —la cuarta columna—: la separación es a propósito. */
const totalMant = await page.evaluate(i => {
  const e = Store.get('quotes', i).estimate, m = n => Store.money(n);
  const [lo, hi] = (typeof rangoPreliminar === 'function') ? rangoPreliminar(e.total[0], e.total[1]) : e.total;
  return lo === hi ? m(lo) : `${m(lo)} – ${m(hi)}`;
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
await elegirAtencion(page);
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
  /* v2 desde la orientación del corte por tela (docs/consumo-direccional.md): se
   * sube a propósito al cambiar una fórmula, y esta comprobación es la que avisa. */
  ['tela', true, true, 2]);
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
/* A «Tu mueble» por una línea CON paso de mueble, elegida por su nombre (tras `fresh()` el cliente
 * ya está en el paso del mueble de la primera tarjeta: re-elegir la línea reinicia el recorrido y
 * hay que esperar a que aterrice en el paso del mueble de la nueva). El clic va por el DOM: la
 * rejilla ya quedó atrás y no está a la vista. */
await page.evaluate(() => { const c = [...document.querySelectorAll('#serviceGrid .service-choice')]
  .find(x => /Retapizado de muebles/.test(x.textContent)); if (c) c.click(); });
await page.waitForFunction(() => state.service && /retapizado/.test(state.service.id));
await page.waitForFunction(() => !!document.querySelector('.wizard-step.active[data-brain="FURNITURE"]'));
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
const avisoMueble = await avisoDeElla();
check('sin la descripción no se avanza, y el error lo dice',
  [sinDescripcion.paso===conOtro.paso, avisoMueble.visible, avisoMueble.burbuja === (await page.textContent('#furnitureOtherError')).trim(),
   await page.isVisible('#furnitureOtherError')], [true, true, true, false]);
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
const avisoMedida = await avisoDeElla();
check('con una medida muy fuera de lo habitual no se avanza, y el paso dice por qué',
  [bloqueado.paso===enMedidas, avisoMedida.visible, avisoMedida.burbuja === bloqueado.texto.trim(), bloqueado.error], [true, true, true, false]);
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

console.log('\nEL ERROR LO DICE ELLA EN SU BURBUJA, AL INSTANTE (SIN PULSAR NADA)');
/* El dueño: «the idea is show the error in the dialogue inmediatly.... that is dont wait that user do
 * click». Se prueba en Medidas: al confirmar el campo (`change`), el aviso de ella ya está pintado y
 * dice la MISMA frase que la línea del paso. */
await fresh();
await page.evaluate(()=>{document.querySelector('.furniture-card').click()});
await page.setInputFiles('#furniturePhoto', png);
await page.waitForFunction(()=>state.photos.length>=3);
for(let i=0;i<4 && await page.evaluate(()=>ACI.stepId(state.step)!=='MEASUREMENTS');i++){ await page.click('#nextButton'); await page.waitForTimeout(200); }
/* La burbuja la pinta la capa 3D: hay que esperar a que esté en pie (no se finge el aviso). */
await page.waitForFunction(()=>(document.querySelector('.assistant-stage')||{}).dataset&&document.querySelector('.assistant-stage').dataset.pose==='standing',null,{timeout:10000}).catch(()=>{});
const alInstante = await page.evaluate(()=>new Promise(res=>{
  const dichos=[];
  addEventListener('aci:notice',e=>dichos.push({text:(e.detail||{}).text,campo:!!(e.detail&&e.detail.campo)}));
  /* Ancho y alto válidos (si no, el paso frena antes por el campo vacío y no hay error que decir). */
  const set=(id,v)=>{const x=document.getElementById(id);x.value=v;x.dispatchEvent(new Event('change',{bubbles:true}))};
  set('width','210'); set('height','85');
  const el=document.getElementById('depth'); el.value='400'; el.dispatchEvent(new Event('change',{bubbles:true}));
  setTimeout(()=>{const bl=document.getElementById('assistantBubble');
    res({dichos, linea:document.getElementById('measureError').textContent, visible:!bl.hidden,
      burbuja:bl.querySelector('.bubble-text').textContent, firma:bl.querySelector('.bubble-who').textContent,
      gira:(document.querySelector('.assistant-stage')||{}).dataset?document.querySelector('.assistant-stage').dataset.glance:null,
      paso:state.step});},1200);
}));
check('al confirmar la medida imposible el aviso ya está en pantalla, sin pulsar Continuar',
  [alInstante.visible, alInstante.paso===9, alInstante.dichos.length>0], [true, true, true]);
check('y el aviso dice la MISMA frase que la línea del paso',
  [alInstante.burbuja.trim(), alInstante.linea.trim()], [alInstante.linea.trim(), alInstante.linea.trim()]);
check('con su firma y girando la cabeza hacia el campo que falla',
  [alInstante.firma, alInstante.gira], ['Lía', 'depth']);
const sinAsistente = await page.evaluate(()=>new Promise(res=>{
  /* Se parte de una pantalla limpia: el aviso de la comprobación anterior se cierra a mano. */
  document.querySelector('#assistantBubble .bubble-close').click();
  const original=Store.assistant; Store.assistant=()=>({enabled:false,name:'Lía'});
  document.getElementById('measureError').hidden=true;
  document.getElementById('nextButton').click();
  setTimeout(()=>{const bl=document.getElementById('assistantBubble');
    const out={visible:!bl.hidden, linea:document.getElementById('measureError').hidden?'':document.getElementById('measureError').textContent};
    Store.assistant=original; res(out);},900);
}));
check('sin asistente la línea sigue sola y no hay aviso (no se finge una voz)',
  [sinAsistente.visible, /fuera de lo habitual/.test(sinAsistente.linea)], [false, true]);

/* --------------------------------------------------------------------------------------------
 * CAMBIAR DE LÍNEA EMPIEZA DE CERO
 * El dueño: «when user change line of service... dont save.. because this contaminate the context
 * for the AI». Lo declarado para una línea —mueble, medidas, fotos, preferencias, tela y
 * revisión— no viaja a la siguiente: el asistente lee ese contexto (ACI.context(), declaredRows())
 * y con datos de la otra línea contesta de otro mueble.
 * -------------------------------------------------------------------------------------------- */
console.log('\nUNA LÍNEA NUEVA NO HEREDA LO DECLARADO PARA LA ANTERIOR');
await fresh();
/* Punto de partida de fábrica: contra esto se compara después. */
const fabrica = await page.evaluate(() => ({
  mueble: document.querySelector('.furniture-card').dataset.furniture,
  estilo: document.getElementById('style').value,
  color: document.getElementById('color').value }));
const muebleOtro = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.furniture-card')];
  const otra = cards.find(c => !c.classList.contains('selected'));
  otra.click(); return otra.dataset.furniture; });
await page.setInputFiles('#furniturePhoto', png);
await page.waitForFunction(() => state.photos.length >= 3);
await page.click('#nextButton');
const medio = await page.evaluate(() => { const r = ACI.context().measurements.ranges;
  const m = k => Math.round((r[k][0] + r[k][1]) / 2);
  return { width: m('measurements.width'), height: m('measurements.height'), depth: m('measurements.depth') }; });
await page.fill('#width', String(medio.width));
await page.fill('#height', String(medio.height));
await page.fill('#depth', String(medio.depth));
await page.click('#nextButton');
await page.evaluate(() => {
  const c = document.querySelector('#needsGrid input'); if (c && !c.checked) c.click();
  const s = document.getElementById('style'); s.selectedIndex = Math.min(2, s.options.length - 1);
  const col = document.getElementById('color'); col.selectedIndex = Math.min(1, col.options.length - 1); });

const declarado = await page.evaluate(() => {
  const c = ACI.context();
  return { linea: (c.service || {}).label, medida: String(c.measurements.width), mueble: c.selectedFurniture,
    fotos: c.photos.count, needs: c.preferences.needs.length, estilo: c.preferences.style }; });
check('(fixture) la línea anterior queda con lo suyo declarado',
  [declarado.mueble === muebleOtro, declarado.fotos >= 3, declarado.medida !== '0', declarado.needs > 0],
  [true, true, true, true]);

/* Volver a pulsar la MISMA línea no borra nada: no hay cambio que empezar de cero. Se hace sobre
 * la línea que tiene lo declarado (si borrara, el mueble desaparecería del contexto). */
await page.click('#journeyContextChange');
await page.waitForTimeout(250);
const mismaLinea = await page.evaluate(() => {
  const card = [...document.querySelectorAll('#serviceGrid .service-choice')].find(c => c.classList.contains('selected')) || document.querySelectorAll('#serviceGrid .service-choice')[0];
  card.click(); return card.querySelector('b').textContent.trim(); });
await page.waitForTimeout(300);
check('re-pulsar la misma línea conserva lo declarado (no hay cambio de línea)',
  [await page.evaluate(() => ACI.context().selectedFurniture), mismaLinea], [declarado.mueble, declarado.linea]);

/* Cambiar a «Tapicería arquitectónica» (la línea que el dueño nombró). El paso de la línea ya
 * está abierto: el re-pulsar anterior dejó ahí al cliente. */
await page.waitForTimeout(150);
const lineaNueva = await page.evaluate(() => {
  const card = [...document.querySelectorAll('#serviceGrid .service-choice')].find(c => /arquitect/i.test(c.textContent));
  card.click(); return card.querySelector('b').textContent.trim(); });
await page.waitForTimeout(400);
const limpio = await page.evaluate(() => {
  const c = ACI.context();
  const m = c.measurements || {}, p = c.preferences || {}, f = c.photos || {};
  return { linea: (c.service || {}).label, mueble: c.selectedFurniture, ancho: m.width,
    alto: m.height, fondo: m.depth, fotos: f.count, minimo: f.min, needs: (p.needs || []).length,
    estilo: p.style, color: p.color, analisis: c.analysis.done,
    campoW: document.getElementById('width').value, campoH: document.getElementById('height').value,
    campoD: document.getElementById('depth').value, campos: document.querySelectorAll('#needsGrid input:checked').length,
    tira: document.getElementById('photoStrip').children.length,
    revisa: document.getElementById('analysisTitle').textContent, aiPick: document.getElementById('aiPick').hidden,
    resumen: document.getElementById('aiSummary').textContent.replace(/\s+/g, ' ').trim() }; });

check('la línea nueva es la que el cliente acaba de elegir', limpio.linea, lineaNueva);
check('la línea que no pregunta mueble no lleva mueble al contexto (antes llevaba el de fábrica)',
  [limpio.mueble, limpio.mueble === declarado.mueble], [null, false]);
check('las medidas declaradas no pasan a la línea nueva',
  [!limpio.ancho, !limpio.alto, !limpio.fondo, limpio.campoW, limpio.campoH, limpio.campoD], [true, true, true, '', '', '']);
check('las fotos se sueltan (tira vacía), y la línea nueva vuelve a pedirlas como todas',
  [limpio.fotos, limpio.tira, limpio.minimo], [0, 0, 3]);
check('las preferencias no viajan (esta línea no las pregunta)',
  [limpio.needs, limpio.campos, limpio.estilo, limpio.color], [0, 0, null, null]);
check('la revisión no queda hecha para la línea nueva',
  [limpio.analisis, limpio.revisa, limpio.aiPick], [false, 'Listo para revisar', true]);
check('y las filas que ve el asistente llevan lo suyo (el motivo y sus fotos), no lo de la otra línea',
  [/Motivo/.test(limpio.resumen), /Mueble/.test(limpio.resumen), /Fotografías/.test(limpio.resumen),
   limpio.resumen.includes(String(declarado.medida))],
  [true, false, true, false]);


/* --------------------------------------------------------------------------------------------
 * LA LÍNEA QUE NO PREGUNTA TAMPOCO DECLARA
 * «Tapicería arquitectónica» no tiene paso de mueble, ni de medidas, ni de preferencias: el
 * cliente no los elige — y aun así el resumen y la revisión hablaban de un sofá y avisaban de
 * medidas fuera de rango. Lo que la línea no pregunta no puede aparecer ni viajar al asistente.
 * -------------------------------------------------------------------------------------------- */
console.log('\nLA LÍNEA SIN MUEBLE NO DECLARA MUEBLE (REVISIÓN Y CONTEXTO)');
await fresh();
await page.evaluate(() => {
  const card = [...document.querySelectorAll('#serviceGrid .service-choice')].find(c => /arquitect/i.test(c.textContent));
  card.click(); });
await page.waitForTimeout(350);
/* Las fotos se piden en TODAS las líneas: aquí la subida viaja al primer paso de la línea. */
await page.setInputFiles('#furniturePhoto', png);
await page.waitForFunction(() => state.photos.length >= 3);
/* Caminar hasta la validación respondiendo lo que cada paso pida: los pasos son los suyos
 * (chips y campos de sus preguntas), no los del recorrido del mueble. */
const responder = () => page.evaluate(() => {
  document.querySelectorAll('.wizard-step.active .chip-grid').forEach(g => {
    if (!g.querySelector('input:checked')) { const l = g.querySelector('label'); if (l) l.click(); } });
  document.querySelectorAll('.wizard-step.active input[type="number"]').forEach(i => {
    if (!i.value) { i.value = '200'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } });
});
for (let i = 0; i < 10 && !(await page.isVisible('#analyzeButton')); i++) {
  await responder();
  const freno = await page.evaluate(() => ({
    paso: (() => { const a = document.querySelector('.wizard-step.active'); return a ? (a.dataset.ask || a.dataset.brain || a.id) : '?'; })(),
    next: document.getElementById('nextButton').disabled,
    error: [...document.querySelectorAll('.wizard-step.active [id$="Error"]')].filter(e => !e.hidden).map(e => e.textContent).join(' | '),
  }));
  console.log('    · ' + JSON.stringify(freno));
  if (freno.next) break;
  await page.click('#nextButton'); await page.waitForTimeout(250);
}
await responder();
await page.click('#analyzeButton');
await page.waitForFunction(() => state.analyzed);      // el botón se retira al terminar la revisión
await page.waitForTimeout(150);
const revision = await page.evaluate(() => {
  const c = ACI.context();
  return {
    titulo: document.getElementById('analysisTitle').textContent,
    filas: [...document.querySelectorAll('#analysisChecks > div')].map(d => (d.querySelector('b') || {}).textContent || ''),
    resumen: [...document.querySelectorAll('#aiSummary dt')].map(d => d.textContent.trim()),
    todo: document.getElementById('analysisChecks').textContent,
    contexto: [c.selectedFurniture, c.measurements, c.preferences, c.photos ? c.photos.count : null, c.fabric],
  };
});
check('su revisión pide las fotos como a todas las líneas, y no habla de medidas (no hay ese paso)',
  [revision.filas.some(t => /fotograf/i.test(t)), revision.filas.some(t => /Medidas/.test(t)),
   /fuera de lo habitual/.test(revision.todo), revision.filas.length],
  [true, false, false, 3]);   // fotos + «datos suficientes» + el presupuesto (en la unidad del oficio)
check('y sigue diciendo lo que sí importa: que hay con qué estimar',
  [revision.filas.some(t => /Datos suficientes/.test(t)), /Revisión lista/.test(revision.titulo)], [true, true]);
check('su resumen declara el motivo, sus fotos y sus propias preguntas, no un mueble ni unas medidas',
  [revision.resumen.includes('Motivo'), revision.resumen.includes('Mueble'), revision.resumen.includes('Medidas'),
   revision.resumen.includes('Estilo y color'), revision.resumen.includes('Fotografías')],
  [true, false, false, false, true]);
check('y el contexto del asistente va tan limpio como el resumen (con las fotos de todas las líneas)',
  revision.contexto, [null, null, null, 3, null]);

/* --------------------------------------------------------------------------------------------
 * NINGÚN AVISO FUERA DE SU VOZ
 * Hasta aquí quedaban dos: la burbuja del navegador («Please fill out this field.», en el idioma
 * del sistema, sin firma) para un campo requerido, y las líneas rojas del paso. El dueño: «this
 * errors always is Lia who tell to client... you can delete error messages of the wizard and let it
 * be Lia who always says that». Con el asistente encendido habla ella y la línea calla —escrita,
 * pero oculta: es el mismo texto—; apagado, la línea es la única voz y se enseña.
 * -------------------------------------------------------------------------------------------- */
console.log('\nTAMBIÉN EL ÚLTIMO PASO HABLA POR ELLA (Y NADA MÁS)');
await fresh(); await reach(5);
/* `reach(5)` deja el recorrido EN la recomendación, y los pasos se esperan por identidad, no por
 * número: en la cadena completa las líneas habilitadas cambian y los números cambian con ellas. */
const caminoAlCierre = async () => {
  await page.click('#nextButton'); await page.waitForFunction(() => ACI.stepId(state.step) === 'ESTIMATE');
  await page.click('#nextButton'); await page.waitForFunction(() => ACI.stepId(state.step) === 'CONTACT');
};
await caminoAlCierre();
/* La atención (ciudad del cliente, del servicio y sede) va PRIMERO en el último paso, porque es el
 * orden de la pantalla (docs/punto-de-atencion.md). Se comprueba ahí y se declara para seguir. */
await page.click('#nextButton'); await page.waitForTimeout(700);
const sinAtencion = await page.evaluate(() => ({
  burbuja: (document.querySelector('#assistantBubble .bubble-text') || {}).textContent || null,
  foco: document.activeElement.id }));
check('sin la atención declarada el cierre ni empieza, y lo dice ella',
  [sinAtencion.burbuja, sinAtencion.foco],
  ['Necesito saber en qué ciudad estás: elige una ciudad para continuar.', 'customerCity']);
await elegirAtencion(page);
const cierre = async () => page.evaluate(() => ({
  linea: document.getElementById('contactError').textContent,
  lineaVisible: !document.getElementById('contactError').hidden,
  burbuja: (document.querySelector('#assistantBubble .bubble-text') || {}).textContent || null,
  burbujaVisible: !!document.querySelector('#assistantBubble:not([hidden])'),
  foco: document.activeElement.id, marca: document.activeElement.getAttribute('aria-invalid') }));
await page.click('#nextButton'); await page.waitForTimeout(700);
const faltaNombre = await cierre();
check('el nombre que falta lo dice su burbuja, no una línea roja ni el navegador',
  [faltaNombre.burbuja, faltaNombre.lineaVisible, faltaNombre.burbujaVisible, faltaNombre.linea === faltaNombre.burbuja],
  ['Necesito tu nombre para enviarte la pre-cotización.', false, true, true]);
check('y el campo queda con el foco y marcado',
  [faltaNombre.foco, faltaNombre.marca], ['fullName', 'true']);
/* La traza: el mismo aviso queda como turno suyo en la conversación (dueño, 20/09: «add in the
 * history conversation too.. how trazability with the user»). */
const enLaConversacion = await page.evaluate(() => {
  const avisos = [...document.querySelectorAll('#messages .message.bot.aviso')].map(m => m.textContent.trim());
  return { ultimo: avisos[avisos.length - 1] || null, cuantos: avisos.length,
    noLeidos: document.getElementById('chatPanel').classList.contains('has-unread') || !!document.querySelector('.chat-fab .unread, .chat-fab [data-unread]') };
});
check('y el aviso queda escrito en la conversación, como turno suyo',
  [enLaConversacion.ultimo, enLaConversacion.cuantos >= 1], ['Necesito tu nombre para enviarte la pre-cotización.', true]);
await page.fill('#fullName', 'Cliente Prueba');
await page.click('#nextButton'); await page.waitForTimeout(700);
const faltaCorreo = await cierre();
check('después del nombre, el correo tiene su propia frase',
  [faltaCorreo.burbuja, faltaCorreo.foco], ['Necesito tu correo: ahí te llega la copia de tu pre-cotización.', 'email']);
await page.fill('#email', 'cliente@example.com');
await page.fill('#phone', '300123');            // seis dígitos: no parece un celular
await page.click('#nextButton'); await page.waitForTimeout(700);
const celularCorto = await cierre();
check('y un celular a medias también se dice en palabras',
  [celularCorto.burbuja, celularCorto.foco], ['Ese celular no tiene pinta de celular: escríbelo como 300 123 4567.', 'phone']);
/* Apagado: la línea del paso vuelve a ser la voz (no se finge a nadie). */
await page.evaluate(() => { window.__asistente = Store.assistant; Store.assistant = () => ({ enabled: false, name: 'Lía' }); });
await page.click('#nextButton'); await page.waitForTimeout(500);
const sinAsistenteCierre = await cierre();
check('con el asistente apagado la línea se enseña (es la única voz)',
  [sinAsistenteCierre.lineaVisible, sinAsistenteCierre.linea], [true, celularCorto.linea]);
await page.evaluate(() => { if (window.__asistente) Store.assistant = window.__asistente; });

console.log('\nUNA MEDIDA SIN ESCRIBIR TAMBIÉN TIENE SU FRASE');
/* `reach(2)` deja el recorrido EN las medidas (el 3 avanza a preferencias). Se vuelve a dejar el
 * paquete completo antes: en la cadena, los bloques anteriores cambian las líneas habilitadas. */
await page.evaluate(() => Store.saveSettings({ plan: 'Business', disabledLines: [] }));
await fresh(); await reach(2);
await page.fill('#width', '');
await page.click('#nextButton'); await page.waitForTimeout(700);
const medidaVacia = await page.evaluate(() => ({
  linea: document.getElementById('measureError').textContent,
  lineaVisible: !document.getElementById('measureError').hidden,
  burbuja: (document.querySelector('#assistantBubble .bubble-text') || {}).textContent || null,
  foco: document.activeElement.id }));
check('la medida que falta no saca la burbuja del navegador: la dice ella',
  [medidaVacia.burbuja, medidaVacia.lineaVisible, medidaVacia.foco],
  ['Me falta el ancho del mueble: sin las tres medidas no puedo calcular la tela.', false, 'width']);

/* --------------------------------------------------------------------------------------------
 * UNA COTIZACIÓN NUEVA NO ARRASTRA LA ANTERIOR
 * El dueño, con una captura: «below has a little screen with information of before quoter...
 * shouldnt be like this... because client restart for new process». Enviar deja la confirmación
 * abierta y el formulario sin paso activo; volver al formulario —por el control que sea— tiene que
 * llevarse la confirmación: es un proceso nuevo.
 * -------------------------------------------------------------------------------------------- */
console.log('\nEMPEZAR DE NUEVO SE LLEVA LA CONFIRMACIÓN ANTERIOR');
await page.evaluate(() => Store.saveSettings({ plan: 'Business', disabledLines: [] }));
await fresh(); await reach(5);
await caminoAlCierre();
await page.fill('#fullName', 'Cliente Prueba');
await page.fill('#email', 'cliente@example.com');
await page.fill('#phone', '3001234567');
await elegirAtencion(page);
await page.check('#consent');
await page.click('#nextButton');
await page.waitForSelector('#successState:not([hidden])');
check('la solicitud enviada se confirma en su pantalla, con su número',
  [await page.isVisible('#successState'), (await page.textContent('#requestNumber')).startsWith('COT-'), await page.evaluate(() => state.submitted)],
  [true, true, true]);
/* El mismo control que el cliente puede volver a alcanzar: la barra del motivo, que devuelve al
 * paso de la línea. Con el envío hecho está oculta, pero su manejador es el del producto. */
await page.evaluate(() => document.getElementById('journeyContextChange').click());
await page.waitForTimeout(500);
const arranqueLimpio = await page.evaluate(() => ({
  exito: !document.getElementById('successState').hidden, enviado: state.submitted, paso: state.step,
  acciones: !document.getElementById('wizardActions').hidden,
  activos: [...document.querySelectorAll('.wizard-step')].filter(s => s.offsetParent).length,
  atenuado: document.querySelector('.step-list').style.opacity || '' }));
check('y empezar de nuevo se lleva la confirmación (nada de la cotización anterior detrás)',
  [arranqueLimpio.exito, arranqueLimpio.enviado, arranqueLimpio.paso, arranqueLimpio.acciones, arranqueLimpio.activos, arranqueLimpio.atenuado],
  [false, false, 0, true, 1, '']);

console.log('\npage errors: ' + (errs.length?errs.join(' | '):'none'));
console.log(fails?`\n${fails} FAILING`:'\nALL PASS');
await browser.close(); process.exit(fails?1:0);
