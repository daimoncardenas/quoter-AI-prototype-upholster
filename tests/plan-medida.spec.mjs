import { chromium } from 'playwright';
import { openAdmin } from './helpers.mjs';
const D = 'file://' + process.cwd() + '/generated/';
let fails = 0;
const check = (n, got, want) => { const ok = JSON.stringify(got)===JSON.stringify(want); if(!ok)fails++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${n}` + (ok?'':`\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)); };

const browser = await chromium.launch(); const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto(D+'admin.html');
await page.evaluate(()=>localStorage.clear());
await openAdmin(page, D);

console.log('\nCONFIGURAR MI PLAN → GUARDAR → PAGAR (plan a la medida)');

// 1. La pestaña se llama «Configurar mi plan» y la de Planes NO trae tarjeta a medida.
await page.click('button:has-text("Upgrade")');
await page.click('#tabMiAci');
check('la pestaña se llama «Configurar mi plan»', await page.textContent('#tabMiAci'), 'Configurar mi plan');
await page.click('#tabPlanes');
check('sin guardar, Planes no tiene plan a la medida',
  await page.locator('article.plan-card:has-text("Plan a la medida")').count(), 0);

// 2. Configurar: paquete Empresa + una capacidad extra, y leer el total compuesto.
await page.click('#tabMiAci');
await page.click('[data-preset="empresa"]');
await page.check('input[data-cap="plantillas"]');
const totalUI = (await page.textContent('#aciTotal span')).replace(/\s+/g,' ').trim();
const totalEsperado = await page.evaluate(()=>Store.money(Store.myAci().total)+' / mes');
const totalPanel = await page.evaluate(()=>'$'+Math.round(Store.myAci().total).toLocaleString('es-CO')+' / mes');
check('el total de la pantalla es el compuesto por Store.myAci()', totalUI, totalPanel);
check('el botón de guardar existe y dice «Guardar configuración»',
  await page.textContent('#saveMyAci'), 'Guardar configuración');

// 3. Guardar: salta a Planes y aparece la tarjeta con su botón «Pagar».
await page.click('#saveMyAci');
await page.waitForSelector('#panelPlanes:not([hidden])');
const card = page.locator('article.plan-card:has-text("Plan a la medida")');
check('tras guardar, la tarjeta «Plan a la medida» está en Planes', await card.count(), 1);
check('la tarjeta muestra el total guardado',
  (await card.locator('.plan-price').textContent()).replace(/\s+/g,' ').trim(),
  (totalEsperado.replace(' / mes','')+' COP / mes').replace(/\s+/g,' ').trim());
check('el botón dice «Pagar» en negrita', await card.locator('[data-pay-customplan]').innerText(), 'Pagar');
check('el snapshot guardado coincide con lo marcado', await page.evaluate(()=>{
  const cp=Store.customPlan();
  return [cp.lines.length, cp.capabilities.filter(c=>c.id==='plantillas').length, cp.total===Store.myAci().total];
}), [5,1,true]);

// 4. Pagar: mismo flujo que los planes del catálogo (confirmación → factura → Bold simulado).
await card.locator('[data-pay-customplan]').click();
await page.waitForSelector('#confirmModal.open');
const msg = await page.textContent('#confirmModalBody');
check('la confirmación nombra el plan a la medida y su precio', /plan a la medida/i.test(msg)&&msg.includes(totalEsperado.split(' / ')[0]), true);
await page.click('#confirmOk');
await page.waitForSelector('#payModal.open');
const body = await page.textContent('#payModalBody');
check('el pago usa Bold (simulado)', /Bold/i.test(body), true);
check('la factura quedó registrada como plan a la medida',
  await page.evaluate(()=>{const i=Store.all('invoices');const last=i[i.length-1];return last?[last.kind,last.concept,last.status]:null}),
  ['customplan','Plan a la medida','Pendiente']);

// 5. Aprobar el pago marca la tarjeta como «Plan actual» (sin tocar la composición).
await page.click('#payApprove');
await page.waitForFunction(()=>!document.querySelector('#payModal').classList.contains('open'));
check('al aprobar, la tarjeta pasa a «Plan actual»',
  (await card.locator('.plan-current-label').textContent()).trim(), 'Plan actual');

console.log(`\n  page errors: ${errs.length?errs.join(' | '):'none'}`);
if(errs.length)fails++;
console.log(fails?`\n  ${fails} FALLARON\n`:'\n  ALL PASS\n');
await browser.close();
process.exit(fails?1:0);
