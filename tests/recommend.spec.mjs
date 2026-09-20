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

/* ---- La IA local recomienda telas, con lo declarado por delante (dueño, 19/09) ---- */
console.log('\nLA IA LOCAL RECOMIENDA: ORDENA LAS TELAS CON LO DECLARADO POR DELANTE');
{
  const p = await b.newPage(); p.on('pageerror', e => errs.push('recomendación: ' + e));
  await p.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true });
    window.__sistema = ''; window.__pedido = null;
    window.LanguageModel = { availability: async () => 'available',
      create: async (o) => { window.__sistema = (o.initialPrompts || []).map(x => x.content).join('\n');
        return { prompt: async (mensajes) => {
          if (!Array.isArray(mensajes) || !mensajes.every(m => m && m.role && Array.isArray(m.content)))
            throw new Error("Failed to read the 'content' property from 'LanguageModelMessage': Required member is undefined.");
          window.__pedido = mensajes;
          /* Tarda un poco a propósito: así se puede mirar la pantalla MIENTRAS la IA ordena
           * (y la hoja de Lía alcanza su pose: la levanta en ~0,6 s). */
          await new Promise(r => setTimeout(r, 1600));
          /* Un orden al revés del determinista: si la parrilla lo respeta, el orden es SUYO. */
          return '{"orden": ["3","5","2","1","4"], "razon": "La Bouclé Capri te va por el uso y el estilo que declaraste."}';
        }, destroy(){} }; } };
  });
  await p.goto(D + 'index.html');
  await p.evaluate(() => localStorage.clear());
  await openWizard(p, D);
  /* La capa 3D tarda en levantar (modelos + WebGL): sin ella no hay hoja que mirar. */
  await p.waitForFunction(() => document.querySelector('#assistantStage')?.dataset.pose === 'standing', null, { timeout: 15000 });
  /* A la recomendación por el atajo del paso: el orden de las telas no depende del paseo. */
  await p.evaluate(() => { document.getElementById('style').value = 'Moderno';
    document.getElementById('color').value = 'Grises'; document.getElementById('budget').value = '160000';
    const s = document.querySelector('.wizard-step[data-brain="RECOMMENDATION"]'); showStep(+s.dataset.step); });
  /* MIENTRAS la IA ordena: la parrilla no se enseña (el modelo doble tarda 1,6 s). La hoja
   * y los brazos necesitan su tiempo: el peso de la pose sube desde 0 en ~0,6 s. */
  await p.waitForTimeout(1100);
  /* La pose se levanta en ~0,6 s y en la cadena completa el reloj se atrasa: se espera —con tope— a
   * que estén los HECHOS que la comprobación mide (leyendo, con tamaño real y las dos manos), no a
   * que la pose se congele: la hoja se mece, así que «dos lecturas iguales» nunca llega. */
  await p.evaluate(async () => {
    const listo = () => { const st = document.getElementById('assistantStage').dataset;
      const [w] = (st.sheetPx || '0x0').split('x').map(Number);
      return st.reading === 'on' && w >= 16 && (st.sheetHands || '').split('|').filter(Boolean).length === 2; };
    for (let i = 0; i < 30 && !listo(); i++) await new Promise(r => setTimeout(r, 100));
  });
  const esperando = await p.evaluate(() => ({ telas: document.getElementById('fabricGrid').hidden,
    fila: /Pidiéndole una recomendación/.test(document.getElementById('aiPick').innerText),
    filaVisible: !document.getElementById('aiPick').hidden,
    /* El bloque de metros aparece CON las telas: mientras la IA ordena, no está. */
    metros: (() => { const q = document.querySelector('.wizard-step.active .quote-preview'); return q ? q.offsetParent === null : true; })(),
    /* Y ella está leyendo su documento: la espera de las telas es una de las dos esperas con barra. */
    hoja: (() => { const st = document.getElementById('assistantStage').dataset;
      const [w, h] = (st.sheetPx || '0x0').split('x').map(Number);
      const [l, r] = (st.sheetGap || '1|1').split('|').map(Number);
      return { reading: st.reading, w, h, l, r }; })() }));
  check('mientras la IA elige, las telas NO se enseñan: la parrilla está oculta y la fila lo dice',
    [esperando.telas, esperando.fila, esperando.filaVisible, esperando.metros], [true, true, true, true]);
  /* El papel es media carta (20x28 px a esta ventana) y la manopla de este rig mide ~4 cm: los
   * mismos umbrales que la revisión (menos de 7 cm de la muñeca al canto, tamaño de verdad). */
  check('mientras ordena las telas, ella lee su documento con las dos manos (la espera con barra)',
    [esperando.hoja.reading, esperando.hoja.w >= 16, esperando.hoja.h >= 22,
     esperando.hoja.l < 0.07, esperando.hoja.r < 0.07],
    ['on', true, true, true, true]);
  await p.waitForFunction(() => /Bouclé Capri/.test(document.getElementById('aiPick').innerText), null, {timeout: 8000}).catch(()=>{});
  const est = await p.evaluate(() => ({
    telas: document.getElementById('fabricGrid').hidden,
    fila: document.getElementById('aiPick').innerText,
    orden: [...document.querySelectorAll('#fabricGrid .fabric-card-body > b')].map(e => e.textContent),
    primera: (document.querySelector('#fabricGrid .fabric-card b') || {}).textContent || '',
    mejor: document.querySelector('#fabricGrid .fabric-card .best-match') ? document.querySelector('#fabricGrid .fabric-card b').textContent : null,
    sistema: window.__sistema,
    pedido: (window.__pedido[0].content.filter(x => x.type === 'text').map(x => x.value).join('\n'))
  }));
  check('con modelo, la fila enseña lo que recomienda y va firmada por ella',
    [/Bouclé Capri/.test(est.fila), /lía/i.test(est.fila)], [true, true]);
  check('y al terminar, la parrilla aparece (las telas se enseñan DESPUÉS del análisis)',
    est.telas, false);
  check('y lo declarado viaja al modelo: mueble, estilo y color, y el presupuesto por metro',
    [/Mueble: /.test(est.sistema), /Estilo y color: Moderno · Grises/.test(est.sistema), /160\.000 o menos/.test(est.sistema)],
    [true, true, true]);
  /* Y al llegar la recomendación, el documento se guarda (el peso de la pose se deja en ~0,6 s). */
  await p.waitForTimeout(1200);
  check('cuando llega la recomendación, el documento se guarda',
    await p.evaluate(() => { const st = document.getElementById('assistantStage').dataset;
      return [st.reading, st.sheetPx]; }), ['off', '']);
  check('y en el prompt van las telas del catálogo, con su id, su precio y sus etiquetas',
    [/- 4: Náutica Bari · Gris océano/.test(est.sistema), /por metro/.test(est.sistema), /- 3: Bouclé Capri · Marfil/.test(est.sistema)],
    [true, true, true]);
  check('y su orden manda en la parrilla, con la mejor coincidencia en su primera tela',
    [est.orden[0].startsWith('Bouclé Capri'), est.mejor && est.mejor.startsWith('Bouclé Capri')], [true, true]);
  check('y sin soltar los precios del catálogo, que son los que ve el cliente',
    (await p.textContent('.fabric-card:first-child small')).includes('por metro · Precio de referencia'), true);
  await p.close();
}
{
  /* Una razón que promete no se muestra: cae la fila, y la parrilla vuelve al orden determinista. */
  const p = await b.newPage(); p.on('pageerror', e => errs.push('promesa: ' + e));
  await p.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true });
    window.LanguageModel = { availability: async () => 'available',
      create: async () => ({ prompt: async (mensajes) => {
        if (!Array.isArray(mensajes) || !mensajes.every(m => m && m.role && Array.isArray(m.content)))
          throw new Error("Failed to read the 'content' property from 'LanguageModelMessage': Required member is undefined.");
        return '{"orden": ["3","4"], "razon": "Te la dejo con garantía de un año y te la entrego en 5 días hábiles."}';
      }, destroy(){} }) };
  });
  await p.goto(D + 'index.html');
  await p.evaluate(() => localStorage.clear());
  await openWizard(p, D);
  await p.evaluate(() => { document.getElementById('style').value = 'Clásico';
    const s = document.querySelector('.wizard-step[data-brain="RECOMMENDATION"]'); showStep(+s.dataset.step); });
  await p.waitForFunction(() => /no pudo darte una recomendación/.test(document.getElementById('aiPick').innerText), null, {timeout: 8000}).catch(()=>{});
  const fila = await p.innerText('#aiPick');
  check('una razón que promete NO se muestra: la fila lo dice', fila.includes('garantía'), false);
  const det = await p.evaluate(() => Store.recommend(pedidoDeTelas()).map(r => `${r.fabric.name} · ${r.fabric.colorName}`));
  const pan = await p.evaluate(() => [...document.querySelectorAll('#fabricGrid .fabric-card-body > b')].map(e => e.textContent));
  check('y la parrilla se queda con el orden determinista (el de la promesa no se aplicó)',
    [pan[0].startsWith('Bouclé Capri'), pan.join('|') === det.join('|')], [false, true]);
  if (pan.join('|') !== det.join('|')) console.log('        pantalla: ' + pan.join(' | ') + '\n        determinista: ' + det.join(' | '));
  await p.close();
}
{
  /* Un modelo que NUNCA contesta: la pantalla no puede quedarse sin telas. El tope de producción son
   * 15 s; aquí se baja para probar la salida sin esperarlos. */
  const p = await b.newPage(); p.on('pageerror', e => errs.push('tope: ' + e));
  await p.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true });
    window.LanguageModel = { availability: async () => 'available',
      create: async () => ({ prompt: async () => new Promise(() => {}), destroy(){} }) };
  });
  await p.goto(D + 'index.html');
  await p.evaluate(() => localStorage.clear());
  await openWizard(p, D);
  await p.evaluate(() => { TOPE_RECOMENDACION_MS = 300;   // el tope, corto: la salida se prueba rápido
    const s = document.querySelector('.wizard-step[data-brain="RECOMMENDATION"]'); showStep(+s.dataset.step); });
  await p.waitForFunction(() => /no pudo darte una recomendación/.test(document.getElementById('aiPick').innerText), null, { timeout: 5000 });
  const trasTope = await p.evaluate(() => ({
    telas: document.getElementById('fabricGrid').hidden,
    fila: document.getElementById('aiPick').innerText,
    tarjetas: document.querySelectorAll('#fabricGrid .fabric-card').length,
    orden: [...document.querySelectorAll('#fabricGrid .fabric-card-body > b')].map(e => e.textContent),
    det: Store.recommend(pedidoDeTelas()).map(r => `${r.fabric.name} · ${r.fabric.colorName}`) }));
  check('si la IA no contesta dentro del tope, las telas vuelven con el orden determinista y la fila lo dice',
    [trasTope.telas === false, trasTope.tarjetas > 0, /no pudo darte una recomendación/.test(trasTope.fila), trasTope.orden.join('|') === trasTope.det.join('|')],
    [true, true, true, true]);
  await p.close();
}
{
  /* Sin modelo no hay fila ni recomendación fingida: el orden determinista, tal cual. */
  const p = await b.newPage(); p.on('pageerror', e => errs.push('sin modelo: ' + e));
  await p.addInitScript(() => { delete window.LanguageModel; if (window.ai) delete window.ai.languageModel; });
  await p.goto(D + 'index.html');
  await p.evaluate(() => localStorage.clear());
  await openWizard(p, D);
  await p.evaluate(() => { const s = document.querySelector('.wizard-step[data-brain="RECOMMENDATION"]'); showStep(+s.dataset.step); });
  await p.waitForTimeout(600);
  check('sin modelo, la recomendación no finge: la fila no se pinta y la parrilla está',
    await p.evaluate(() => [document.getElementById('aiPick').hidden, document.querySelectorAll('#fabricGrid .fabric-card').length > 0]),
    [true, true]);
  await p.close();
}

console.log('\nerrores de pagina: ' + (errs.length?errs.join(' | '):'ninguno'));
console.log(fails?`\n${fails} FALLAN`:'\nTODO PASA');
await b.close(); process.exit(fails?1:0);
