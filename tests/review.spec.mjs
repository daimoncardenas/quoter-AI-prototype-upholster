import { chromium } from 'playwright';
import { PHOTOS_DB } from './client.mjs';
import { openWizard } from './helpers.mjs';
const D = 'file://' + process.cwd() + '/generated/';
const BIG = ['1','2','3'].map(n=>new URL(`./fixture-sofa-${n}.png`, import.meta.url).pathname);   // 1200x900
const SMALL = BIG.slice(0,2).concat(new URL('./fixture-sofa-baja.png', import.meta.url).pathname); // una de 463x259
let fails = 0;
const check = (n, got, want) => { const ok = JSON.stringify(got)===JSON.stringify(want); if(!ok)fails++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${n}` + (ok?'':`\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)); };
const b = await chromium.launch(); const page = await b.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));

async function review({photo, furniture, w, h, d}) {
  await page.goto(D+'index.html');
  await page.evaluate((db)=>{localStorage.clear();indexedDB.deleteDatabase(db)}, PHOTOS_DB);
  await openWizard(page, D);
  if (furniture) await page.click(`.furniture-card[data-furniture="${furniture}"]`);
  await page.setInputFiles('#furniturePhoto', photo);
  await page.waitForFunction(()=>state.photos.length>=3);
  await page.click('#nextButton');
  await page.fill('#width',String(w)); await page.fill('#height',String(h)); await page.fill('#depth',String(d));
  await page.click('#nextButton'); await page.click('#nextButton');
  await page.click('#analyzeButton');
  await page.waitForFunction(()=>state.analyzed);
  return {
    title: await page.textContent('#analysisTitle'),
    items: await page.$$eval('#analysisChecks > div', els => els.map(e => ({
      warn: e.classList.contains('warn'),
      title: e.querySelector('b').textContent,
      detail: e.querySelector('small').textContent
    })))
  };
}

console.log('\nUna captura de pago (463x259) entre las fotos del mueble');
const r1 = await review({photo: SMALL, furniture:'Sofá', w:210, h:85, d:90});
check('no longer claims the image is a sofa',
  r1.items.some(i => /compatible con la categoría|tipo de mueble coherente/i.test(i.title + i.detail)), false);
check('flags the low resolution it can actually measure', r1.items[0].warn, true);
check('nombra cuántas y la menor medida real',
  r1.items[0].detail.includes('463×259') && r1.items[0].detail.startsWith('1 '), true);
check('title admits there are observations', r1.title, 'Revisión lista, con observaciones');

console.log('\nA usable photo (1200x900) with plausible sofa measurements');
const r2 = await review({photo: BIG, furniture:'Sofá', w:210, h:85, d:90});
check('photo check passes', r2.items[0].warn, false);
check('measurements check passes', r2.items[1].warn, false);
check('clean title', r2.title, 'Revisión lista');

console.log('\nA usable photo with an implausible width for a sofa (20 cm)');
const r3 = await review({photo: BIG, furniture:'Sofá', w:20, h:85, d:90});
check('flags the measurement, not the image', [r3.items[0].warn, r3.items[1].warn], [false, true]);
check('names which measurement is off', r3.items[1].detail.includes('ancho'), true);

console.log('\nThe same 20 cm width is fine for a Silla');
const r4 = await review({photo: BIG, furniture:'Silla', w:45, h:95, d:50});
check('ranges are per furniture type', r4.items[1].warn, false);

console.log('\npage errors: ' + (errs.length?errs.join(' | '):'none'));
console.log(fails?`\n${fails} FAILING`:'\nALL PASS');
await b.close(); process.exit(fails?1:0);
