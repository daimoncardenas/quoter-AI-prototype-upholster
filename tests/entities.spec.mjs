import { chromium } from 'playwright';
import { PHOTOS_DB } from './client.mjs';
import { openAdmin, openWizard, setTags, elegirMueble } from './helpers.mjs';
const D = 'file://' + process.cwd() + '/generated/';
let fails = 0;
const check = (n, got, want) => { const ok = JSON.stringify(got)===JSON.stringify(want); if(!ok)fails++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${n}` + (ok?'':`\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)); };
const b = await chromium.launch(); const page = await b.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
const fresh = async f => { await page.goto(D+f); await page.evaluate((db)=>{localStorage.clear();indexedDB.deleteDatabase(db)}, PHOTOS_DB); if(f==='admin.html'){await openAdmin(page,D)}else{await openWizard(page,D)} };

console.log('\nTODA ENTIDAD DEL COTIZADOR VIVE EN EL STORE');
await fresh('index.html');
check('los muebles salen del store, no del markup',
  await page.$$eval('.pieza-mueble option', e=>e.map(o=>o.value).filter(Boolean)),
  ['Sofá','Sofá en L','Poltrona','Silla','Cabecero','Otro']);
check('las necesidades salen del store',
  await page.$$eval('#needsGrid input', e=>e.map(i=>i.value)),
  ['Mascotas','Fácil limpieza','Resistente al agua','Alto tráfico','Suave','Sol']);
check('estilos, colores y presupuestos también',
  await page.evaluate(()=>[document.querySelectorAll('#style option').length,
    document.querySelectorAll('#color option').length,
    // Cuatro cortes son CINCO tramos. Antes salían cuatro opciones y el corte
    // más alto no se nombraba en ninguna: los $160.000 no existían para el cliente.
    document.querySelectorAll('#budget option').length]), [5,6,5]);
check('los cortes de presupuesto se etiquetan solos, sin comerse el último',
  (await page.$$eval('#budget option', e=>e.map(o=>o.textContent))).map(t=>t.replace(/\s+/g,' ')),
  ['Hasta $ 100.000','Entre $ 100.000 y $ 120.000','Entre $ 120.000 y $ 140.000',
   'Entre $ 140.000 y $ 160.000','Más de $ 160.000']);

console.log('\nCREAR UN MUEBLE EN EL BACKOFFICE -> APARECE EN EL COTIZADOR');
await openAdmin(page,D);
await page.click('button[data-page="furniture"]');
check('el backoffice lista los muebles configurados',
  await page.$$eval('#furnitureRows tr', r=>r.length), 6);
await page.click('#newFurniture');
const F='#furnitureForm ';
await page.fill(F+'[name=name]','Puf');           await page.fill(F+'[name=icon]','●');
await page.fill(F+'[name=hint]','Individual');    await page.fill(F+'[name=metersMin]','2');
await page.fill(F+'[name=metersMax]','3');        await page.fill(F+'[name=quantityLabel]','Cantidad de pufs');
await page.fill(F+'[name=unitOne]','puf');        await page.fill(F+'[name=unitMany]','pufs');
await page.fill(F+'[name=wMin]','40');  await page.fill(F+'[name=wMax]','90');
await page.fill(F+'[name=hMin]','30');  await page.fill(F+'[name=hMax]','60');
await page.fill(F+'[name=dMin]','40');  await page.fill(F+'[name=dMax]','90');
await page.fill(F+'[name=order]','7');
await page.click(F+'button.primary');
check('guardar confirma que el cotizador ya lo usa',(await page.textContent('#toast')).includes('cotizador'),true);

await openWizard(page, D);
check('el mueble nuevo se ofrece al cliente',
  await page.$$eval('.pieza-mueble option', e=>e.map(o=>o.value).includes('Puf')), true);
await elegirMueble(page, 'Puf');
check('con su etiqueta de cantidad', await page.textContent('#quantityLabel'), 'Cantidad de pufs');
check('y su unidad', await page.$$eval('#seats option', e=>e.map(o=>o.text)),
  ['1 puf','2 pufs','3 pufs','4 pufs','5 o más pufs']);
// base 2-3 m del backoffice, x1.21 de desperdicio+margen, y multiplica por cantidad
check('su consumo base sale del backoffice: 1 puf -> [2,4], 4 pufs -> [10,15]',
  await page.evaluate(()=>{const s=document.getElementById('seats');
    document.getElementById('width').value='60';
    s.value='1';const a=estimate();s.value='4';const b=estimate();
    return [a,b];}), [[2,4],[10,15]]);

console.log('\nLOS RANGOS DE MEDIDA SON LOS QUE CONFIGURO EL BACKOFFICE');
await page.evaluate(()=>{document.getElementById('width').value='300';
  document.getElementById('height').value='45';document.getElementById('depth').value='60';});
check('300 cm de ancho queda fuera del rango 40–90 del Puf',
  await page.evaluate(()=>runReview()[1].ok), false);
check('y nombra la medida', await page.evaluate(()=>runReview()[1].detail.includes('ancho')), true);
await page.evaluate(()=>{document.getElementById('width').value='70'});
check('70 cm sí entra', await page.evaluate(()=>runReview()[1].ok), true);

console.log('\nDESACTIVAR UN MUEBLE LO SACA DEL COTIZADOR');
await openAdmin(page,D);
await page.click('button[data-page="furniture"]');
await page.click('[data-edit-furniture="silla"]');
await page.selectOption(F+'[name=active]','false');
await page.click(F+'button.primary');
await openWizard(page, D);
check('la silla desaparece para el cliente',
  await page.$$eval('.pieza-mueble option', e=>e.map(o=>o.value).includes('Silla')), false);

console.log('\nLAS OPCIONES DEL CUESTIONARIO SON CONFIGURABLES');
await openAdmin(page,D);
await page.click('button[data-page="settings"]');
await setTags(page,'#setNeeds',['Mascotas','Antialérgico']);
await setTags(page,'#setStyles',['Nórdico','Industrial']);
await page.fill('#setCovSeatsMin','50'); await page.fill('#setCovSeatsMax','55');
await page.click('#saveSettings');
await openWizard(page, D);
check('las necesidades cambian', await page.$$eval('#needsGrid input',e=>e.map(i=>i.value)), ['Mascotas','Antialérgico']);
check('los estilos cambian', await page.$$eval('#style option',e=>e.map(o=>o.textContent)), ['Nórdico','Industrial']);
check('el multiplicador de cobertura cambia el cálculo', await page.evaluate(()=>{
  const c=document.getElementById('coverage');
  document.getElementById('width').value='210';
  /* El mueble ya no viene por defecto: este cálculo necesita uno (el que sea — es el mismo rango). */
  state.furniture = state.furniture || 'Sofá';
  c.value='complete'; const full=estimate();
  c.value='seats';    const seats=estimate();
  return Math.abs(seats[0]/full[0]-0.50)<0.06;                 // configurado en 50%
}), true);

console.log('\nLA CONFIGURACIÓN AVISA CUANDO HAY CAMBIOS SIN GUARDAR');
await openAdmin(page,D);
await page.click('button[data-page="settings"]');
const pendiente = async () => [await page.isVisible('#settingsDirty'),
                               await page.textContent('#saveSettings')];
check('al abrir no hay nada pendiente', await pendiente(), [false,'Guardado']);

/* Una etiqueta que aparece al pulsar Enter se SIENTE guardada y no lo está:
 * guardar es otro botón, arriba de la página. El campo de texto anterior nunca
 * dio esa impresión, así que el aviso hace más falta ahora que antes. */
await page.click('#setBudgets input');
await page.keyboard.type('434'); await page.keyboard.press('Enter');
check('agregar una etiqueta lo marca pendiente', await pendiente(), [true,'Guardar cambios']);
check('y todavía no tocó el store',
  await page.evaluate(()=>Store.settings().budgets.includes(434)), false);
await page.click('#saveSettings');
await page.waitForTimeout(150);
check('guardar lo limpia y sí escribe',
  [...await pendiente(), await page.evaluate(()=>Store.settings().budgets.includes(434))],
  [false,'Guardado',true]);

// Quitar una etiqueta, tocar un interruptor y editar un número son tres tipos
// de control distintos; los tres tienen que avisar.
await page.click('#setBudgets .tag button');
check('quitar una etiqueta también avisa', (await pendiente())[0], true);
await page.click('#saveSettings'); await page.waitForTimeout(150);
await page.click('#setAutoAssign');
check('los interruptores también, y son <button>, no inputs', (await pendiente())[0], true);
await page.click('#saveSettings'); await page.waitForTimeout(150);
await page.fill('#setWaste','15');
check('y los campos numéricos', (await pendiente())[0], true);
// Este bloque tocó cortes, desperdicio y un interruptor. Se devuelve el mundo
// como estaba: los bloques siguientes cuentan con los valores sembrados.
await page.evaluate(()=>{
  Store.saveSettings({budgets:[100000,120000,140000,160000],wastePct:12,autoAssignByZone:true});
  loadSettings();
});

console.log('\nLOS PORCENTAJES DE COBERTURA DICEN A QUÉ MUEBLES APLICAN');
await openAdmin(page,D);
await page.click('button[data-page="settings"]');
// El sofá calcula la cobertura eligiendo piezas, así que estos números no lo
// tocan. Callarlo es invitar a que alguien los mueva esperando que se entere.
const alcance = await page.textContent('#coverageScope');
check('el aviso nombra los muebles que sí los usan',
  [['Poltrona',true],['Silla',true],['Cabecero',true]].every(([n,q])=>alcance.includes(n)===q), true);
check('y dice cuál no, y por qué',
  await page.textContent('#coveragePieces'),
  'Sofá no los usa: calcula la proporción a partir de las piezas que se tapizan.');

// Un mueble creado en el backoffice nace sin plantilla, así que entra en la
// lista. Se comprueba por renderAll, que es donde quedó enganchado el aviso.
check('un mueble nuevo entra en la lista sin recargar la página',
  await page.evaluate(()=>{
    Store.put('furniture',{id:'banqueta',name:'Banqueta',order:9,active:true,meters:[2,4],
      quantityLabel:'Cantidad',unit:['banqueta','banquetas'],
      ranges:{width:[30,120],height:[30,80],depth:[30,80]}});
    renderAll();
    return document.getElementById('coverageScope').textContent.includes('Banqueta');
  }), true);

console.log('\nLAS LISTAS SE EDITAN COMO ETIQUETAS, NO COMO TEXTO CON COMAS');
await openAdmin(page,D);
await page.click('button[data-page="settings"]');
const chips = id => page.$$eval(`#${id} .tag`, els => els.map(e => e.firstChild.textContent));
check('lo guardado llega como etiquetas, una por opción',
  (await chips('setStyles')), ['Nórdico','Industrial']);
check('y los números se leen con separador de miles',
  (await chips('setBudgets')), ['100.000','120.000','140.000','160.000']);

await page.click('#setStyles input');
await page.keyboard.type('Rústico'); await page.keyboard.press('Enter');
check('Enter agrega', (await chips('setStyles')).includes('Rústico'), true);
// Pegar una lista con comas tiene que dar varias etiquetas, no una sola.
await page.keyboard.type('Art déco, Boho,');
check('una lista con comas se parte en varias', (await chips('setStyles')).slice(-2), ['Art déco','Boho']);
await page.keyboard.type('rústico'); await page.keyboard.press('Enter');
check('no deja repetir, aunque cambie la mayúscula',
  (await chips('setStyles')).filter(t => t.toLowerCase() === 'rústico').length, 1);
await page.keyboard.press('Backspace');
check('Backspace en vacío quita la última', (await chips('setStyles')).includes('Boho'), false);
await page.click('#setStyles .tag button');
check('y la × quita la suya', (await chips('setStyles'))[0], 'Industrial');

// Escribir algo y hacer clic en Guardar sin pulsar Enter no puede perderlo:
// es exactamente lo que hace cualquiera la primera vez.
await page.click('#setBudgets input');
await page.keyboard.type('185000');
await page.click('#saveSettings');
await page.waitForTimeout(150);
check('lo escrito sin confirmar se guarda igual, no se pierde',
  await page.evaluate(() => Store.settings().budgets), [100000,120000,140000,160000,185000]);
check('y los estilos quedaron como los dejamos',
  await page.evaluate(() => Store.settings().styles), ['Industrial','Rústico','Art déco']);

console.log('\nEL CAMPO QUE SE TIRABA A LA BASURA');
await fresh('index.html');
check('"cojines" ahora se guarda en la cotización', await page.evaluate(()=>{
  return typeof document.getElementById('cushions')!=='undefined' &&
         document.querySelectorAll('#cushions option').length>0;}), true);

console.log('\nerrores de pagina: ' + (errs.length?errs.join(' | '):'ninguno'));
console.log(fails?`\n${fails} FALLAN`:'\nTODO PASA');
await b.close(); process.exit(fails?1:0);
