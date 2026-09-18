import { chromium } from 'playwright';
import { openAdmin, openWizard } from './helpers.mjs';
const D = 'file://' + process.cwd() + '/generated/';
let fails = 0;
const check = (n, got, want) => { const ok = JSON.stringify(got)===JSON.stringify(want); if(!ok)fails++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${n}` + (ok?'':`\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)); };
const b = await chromium.launch(); const page = await b.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await openWizard(page, D); await page.evaluate(()=>localStorage.clear()); await openWizard(page, D);
const rank = c => page.evaluate(x=>Store.recommend(x).map(r=>({n:r.fabric.name,s:r.score,over:r.overBudget,why:r.reasons})), c);

console.log('\nLA NECESIDAD MANDA');
let r = await rank({needs:['Resistente al agua'],budget:160000});
check('quien cubre la necesidad va primero', r[0].n, 'Náutica Bari');
check('y dice por qué', r[0].why.includes('Resistente al agua'), true);
check('quien no la cubre queda debajo', r[r.length-1].s < r[0].s, true);

console.log('\nEL ESTILO PESA');
r = await rank({needs:[],style:'Clásico',budget:160000});
check('un estilo clásico sube a las clásicas',
  [r[0].n,r[1].n].sort(), ['Terciopelo Roma','Velvet Siena']);
check('con el motivo visible', r[0].why.includes('Estilo Clásico'), true);

console.log('\nLA GAMA DE COLOR PESA');
r = await rank({needs:[],color:'Grises',budget:160000});
check('la gama gris sube a Náutica Bari', r[0].n, 'Náutica Bari');
check('con el motivo visible', r[0].why.includes('Gama Grises'), true);

console.log('\nEL PRESUPUESTO ORDENA Y AVISA');
r = await rank({needs:[],budget:100000});
check('lo que entra en presupuesto va primero', r[0].over, false);
check('y lo caro queda al final marcado', r[r.length-1].over, true);
check('solo Lino Verona (89.000) entra en 100.000',
  r.filter(x=>!x.over).map(x=>x.n), ['Lino Verona']);
check('nada se oculta: siguen las 5 activas', r.length, 5);

console.log('\nLAS OPCIONES "NO SÉ" NO PENALIZAN A NADIE');
const neutral = await rank({needs:[],style:'No estoy seguro',color:'Quiero recomendaciones',budget:160000});
check('sin preferencia, todas empatan en criterios',
  [...new Set(neutral.map(x=>x.s))], [2]);
check('y se ordenan por precio', neutral.map(x=>x.n),
  ['Lino Verona','Náutica Bari','Velvet Siena','Terciopelo Roma','Bouclé Capri']);

console.log('\nCOMBINADO, EN LA PANTALLA REAL');
await page.setInputFiles('#furniturePhoto', ['1','2','3'].map(n=>new URL(`./fixture-sofa-${n}.png`, import.meta.url).pathname));
await page.waitForFunction(()=>state.photos.length>=3);
await page.click('#nextButton');
await page.fill('#width','210');await page.fill('#height','85');await page.fill('#depth','90');
await page.click('#nextButton');
await page.check('.chip-grid input[value="Mascotas"]');
await page.check('.chip-grid input[value="Alto tráfico"]');
await page.selectOption('#style','Clásico');
await page.selectOption('#budget','160000');
await page.click('#nextButton');await page.click('#analyzeButton');
await page.waitForFunction(()=>state.analyzed);await page.click('#nextButton');
check('la primera tarjeta lleva el sello "Mejor coincidencia"',
  await page.$eval('.fabric-card:first-child', c=>!!c.querySelector('.best-match')), true);
check('y es la que suma más criterios', await page.evaluate(()=>state.fabric.name), 'Velvet Siena');
check('la tarjeta explica el porqué',
  (await page.textContent('.fabric-card:first-child .why')).includes('Alto tráfico'), true);
check('elegir otra sigue mandando sobre la sugerencia', await (async()=>{
  await page.click('.fabric-card:has-text("Lino Verona")');
  return page.evaluate(()=>state.fabric.name);})(), 'Lino Verona');

console.log('\nCONFIGURABLE DESDE EL BACKOFFICE');
await openAdmin(page,D);
await page.click('button[data-page="fabrics"]');
await page.click('[data-edit-fabric="1"]');                       // Lino Verona
await page.selectOption('#fabricForm [name=needs]',['Mascotas']);
await page.click('#fabricForm button.primary');
await openWizard(page, D);
check('marcar "Mascotas" en una tela la sube en el cotizador',
  (await rank({needs:['Mascotas'],budget:160000}))[0].n, 'Lino Verona');

console.log('\nerrores de pagina: ' + (errs.length?errs.join(' | '):'ninguno'));
console.log(fails?`\n${fails} FALLAN`:'\nTODO PASA');
await b.close(); process.exit(fails?1:0);
