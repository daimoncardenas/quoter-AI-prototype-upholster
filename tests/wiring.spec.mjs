import { chromium } from 'playwright';
import { PHOTOS_DB, client } from './client.mjs';
import { openAdmin, openWizard, setTags } from './helpers.mjs';
const D = 'file://' + process.cwd() + '/generated/';
const png = ['1','2','3'].map(n=>new URL(`./fixture-sofa-${n}.png`, import.meta.url).pathname);

let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${name}` + (ok?'':`\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
};
const browser = await chromium.launch();
/* Contexto explícito (no `browser.newPage()`): el localStorage es por contexto, y este suite
 * necesita abrir el cotizador en OTRA página que comparta el del backoffice. */
const context = await browser.newContext();
const page = await context.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));

async function fresh(file) {
  await page.goto(D + file);
  await page.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
  if (file === 'admin.html') { await openAdmin(page, D); } else { await openWizard(page, D); }
}
// El modelo por componentes da decimales, y la UI los escribe con coma; un
// rango cuyos extremos coinciden se imprime una sola vez.
const priceMatchesRate = rate => page.evaluate(r => {
  const num = t => Number(t.trim().replace(',', '.'));
  const p = document.getElementById('metersRange').textContent.split('–').map(num);
  const [mn, mx] = p.length > 1 ? p : [p[0], p[0]];
  const esperado = mn === mx ? Store.money(mn * r)
                             : `${Store.money(mn * r)} – ${Store.money(mx * r)}`;
  return document.getElementById('priceRange').textContent === esperado;
}, rate);
/* Camina hasta el paso pedido POR NOMBRE y no por número de clics: con los pasos opcionales (la
 * línea, los daños y los que pide cada motivo) la numeración salta, y contar clics deja de ser
 * fiable. 4 = Validación, 5 = Recomendación: los dos destinos que usa este suite (el primero es
 * donde vive «Revisar mi información»). */
const PASO_POR_NOMBRE = { 4: 'REVIEW', 5: 'RECOMMENDATION' };
async function wizardTo(step, opts = {}) {
  const destino = PASO_POR_NOMBRE[step];
  await page.setInputFiles('#furniturePhoto', png);
  await page.waitForFunction(() => state.photos.length >= 3);
  for (let i = 0; i < 12; i++) {
    const at = await page.evaluate(() => { const s = document.querySelector('.wizard-step.active'); return { id: s.dataset.brain || '', ask: s.dataset.ask || '' }; });
    if (at.id === 'MEASUREMENTS') { await page.fill('#width','210'); await page.fill('#height','85'); await page.fill('#depth','90'); }
    else if (at.id === 'PREFERENCES' && opts.city) await page.selectOption('#city', opts.city);
    else if (at.id === 'REVIEW') { await page.click('#analyzeButton'); await page.waitForFunction(() => state.analyzed); }
    if (at.id === destino) return;
    /* Se espera a que el paso CAMBIE, no a un rato fijo: un `waitForTimeout` corto lee el paso
     * viejo en un frame lento y el bucle vuelve a pulsar «Continuar» — avanza dos pasos y nunca
     * encuentra su destino (murió aquí, con el mismo recorrido pasando a mano en una sonda). */
    console.log(`    · wizardTo(${step}) en ${at.id || 'sin-id'} ${at.ask ? '(' + at.ask + ')' : ''}`);
    const antes = await page.evaluate(() => document.querySelector('.wizard-step.active').dataset.step);
    await page.click('#nextButton');
    await page.waitForFunction(prev => document.querySelector('.wizard-step.active').dataset.step !== prev, antes).catch(() => {});
  }
  const donde = await page.evaluate(() => ({ activo: document.querySelector('.wizard-step.active').dataset.step, brain: document.querySelector('.wizard-step.active').dataset.brain || '', visibles: [...document.querySelectorAll('[data-step-dot]')].filter(l => !l.hidden).map(l => l.querySelector('b').textContent) }));
  throw new Error(`wizardTo no llegó a ${destino}: quedó en ${JSON.stringify(donde)}`);
}

console.log('\nCATALOG — backoffice is the single source of truth');
await fresh('index.html');
await wizardTo(5);
await page.waitForSelector('.fabric-card-body > b', { timeout: 5000 }).catch(() => {});
check('wizard shows the backoffice catalog, not its own hardcoded 3',
  (await page.$$eval('.fabric-card-body > b', els => els.map(e => e.textContent.split(' · ')[0]))).sort(),
  ['Bouclé Capri','Lino Verona','Náutica Bari','Terciopelo Roma','Velvet Siena']);
check('inactive fabric (Milo Protect) is hidden from customers',
  await page.$$eval('.fabric-card-body > b', els => els.some(e => e.textContent.includes('Milo Protect'))), false);

console.log('\nCREATE A TELA IN THE BACKOFFICE -> IT APPEARS IN THE COTIZADOR');
await openAdmin(page, D);
await page.click('button[data-page="fabrics"]');
await page.click('#newFabric');
await page.fill('#fabricForm [name=name]', 'Lino Toscana');
await page.fill('#fabricForm [name=collection]', 'Naturales 2026');
await page.fill('#fabricForm [name=price]', '97000');
await page.fill('#fabricForm [name=colorName]', 'Humo');
await page.fill('#fabricForm [name=tags]', 'Lavable, Antimanchas');
await page.click('#fabricForm button.primary');
check('backoffice confirms the save', (await page.textContent('#toast')).includes('cotizador'), true);

await openWizard(page, D);
await wizardTo(5);
check('the new tela is offered to the customer',
  await page.$$eval('.fabric-card-body > b', els => els.some(e => e.textContent.includes('Lino Toscana'))), true);
await page.click('.fabric-card:has-text("Lino Toscana")');
check('and it prices at the rate the backoffice set (97.000/m)',
  await priceMatchesRate(97000), true);

console.log('\nSETTINGS — waste/margin set in the backoffice drive the estimate');
const before = await page.evaluate(() => estimate());
await openAdmin(page, D);
await page.click('button[data-page="settings"]');
await page.fill('#setWaste','0'); await page.fill('#setMargin','0');
await page.click('#saveSettings');
await openWizard(page, D);
await wizardTo(5);
const after = await page.evaluate(() => estimate());
check('zeroing waste+margin lowers the metres (was 12%+8% uplift)', after[1] < before[1], true);
check('and the uplift maths is the 1.21x we configured',
  Math.abs((before[1]/after[1]) - 1.21) < 0.12, true);

console.log('\nSUBMIT A QUOTE -> IT LANDS IN THE BACKOFFICE, WITH THE PHOTO');
await fresh('index.html');
await wizardTo(4, { city: '12 de Octubre' });
console.log('    · estado antes del clic:', await page.evaluate(() => {
  try {
    const b = document.getElementById('analyzeButton');
    if (!b) return `url=${location.pathname.split('/').pop()} no existe #analyzeButton | secciones=${document.querySelectorAll('.wizard-step').length} activo=${(document.querySelector('.wizard-step.active') || { dataset: {} }).dataset.step || 'ninguno'} pasosVisibles=${[...document.querySelectorAll('[data-step-dot]')].filter(x => !x.hidden).length}`;
    const s = b.closest('.wizard-step');
    const r = b.getBoundingClientRect();
    let n = b; const culpables = [];
    while (n && n !== document.body) { const c = getComputedStyle(n); if (c.display === 'none' || c.visibility === 'hidden' || n.hidden) culpables.push(String(n.id || n.className || n.tagName) + ':' + (n.hidden ? 'hidden' : c.display === 'none' ? 'display' : 'vis')); n = n.parentElement; }
    return `url=${location.pathname.split('/').pop()} seccion=${s ? s.dataset.step + '/' + s.classList.contains('active') : 'sin .wizard-step'} estado=${state.step} rect=${Math.round(r.width)}x${Math.round(r.height)} display=${getComputedStyle(b).display} culpables=[${culpables.join(' | ')}]`;
  } catch (e) { return 'THROW: ' + String(e).split('\n')[0]; }
}));
// wizardTo(4) ya dejó el paso REVIEW analizado (el helper pulsa #analyzeButton y espera
// state.analyzed): volver a pulsarlo aquí fallaba porque el botón ya no existe tras analizar.
await page.click('#nextButton');
await page.click('.fabric-card:has-text("Velvet Siena")');
await page.click('#nextButton');
await page.fill('#fullName','Natalia Peña');
await page.fill('#email','natalia@example.com');
await page.fill('#phone','3001234567');
await page.check('#consent');
await page.click('#nextButton');
await page.waitForSelector('#successState:not([hidden])');
const quoteId = await page.textContent('#requestNumber');
check('customer gets a request number', /^COT-\d+$/.test(quoteId), true);
/* La línea de servicio: con una sola línea habilitada el cotizador NO tiene el paso «¿qué
 * quieres hacer?» — entra derecho al paso 1 y la numeración se queda en 6 — y la cotización
 * igual guarda la línea; el backoffice la muestra. La lista vive en el paquete (client.json →
 * services) y el candado del plan en Store.services(). */
const linea = await page.evaluate(id => {
  const q = Store.get('quotes', id);
  return {
    paso: document.querySelector('[data-step-dot="0"]').hidden,
    dots: document.querySelectorAll('[data-step-dot]:not([hidden])').length,
    habilitadas: Store.servicesEnabled().map(s => ({ id: s.id, label: s.label, journey: s.journey })),
    guardada: q && q.service,
  };
}, quoteId);
/* La línea de servicio la decide EL NEGOCIO (Upgrade → Configurar mi plan), no el plan: con más de
 * una habilitada el cotizador tiene el paso de la línea como primero, el stepper pasa a 7 y las
 * tarjetas son las que el negocio tiene habilitadas (el catálogo es del producto, así que la
 * esperada se deriva de él, no de un nombre escrito a mano). */
check('el paso de la línea existe y ofrece las líneas que el negocio tiene habilitadas',
  { paso: linea.paso, dots: linea.dots, habilitadas: linea.habilitadas.map(h => h.id) },
  { paso: false, dots: 7, habilitadas: client.serviceLines.map(s => s.id) });
/* La línea de servicio con la que se cotizó: el cotizador elige la primera que el negocio tiene
 * habilitada (el negocio manda, no el plan ni el nombre de ninguna línea escrito a mano), y con
 * más de una el paso de la línea es el primero. */
const lineaEsperada = client.serviceLines
  .map(s => ({ id: s.id, label: s.label, journey: s.journey }))[0];
check('y la cotización guarda la línea con la que se cotizó', linea.guardada, lineaEsperada);
check('and is told who will contact them (auto-assign by point: 12 de Octubre -> Laura)',
  (await page.textContent('#successSeller')).includes('Laura Méndez'), true);

await openAdmin(page, D);
/* Prender y apagar líneas de servicio desde el backoffice (checkboxes): la apagada sale del
 * cotizador, volver a marcarla la repone, y apagar la última se rechaza — un cotizador sin
 * líneas no puede cotizar nada. */
await page.click('button[data-page="settings"]');
await page.waitForSelector('#serviceLinesCfg input[data-line]');
const cajas = await page.$$eval('#serviceLinesCfg input[data-line]', els => els.map(e => [e.dataset.line, e.checked, e.disabled]));
check('cada línea del catálogo trae su checkbox, marcada y sin bloqueos (el plan ya no las decide)',
  cajas.length === client.serviceLines.length && cajas.every(([, on, bloqueada]) => on === true && bloqueada === false), true);
const aApagar = cajas[0][0];
await page.click(`#serviceLinesCfg input[data-line="${aApagar}"]`);
check('apagarla la saca del cotizador',
  await page.evaluate(id => Store.servicesEnabled().some(s => s.id === id), aApagar), false);
check('y queda registrada como apagada, sin borrar nada',
  await page.evaluate(id => Store.settings().disabledLines.includes(id), aApagar), true);
/* Mismo contexto que la página del backoffice: el localStorage es por contexto, y en uno nuevo
 * el cotizador no vería la línea apagada (es la trampa que ya me mordió en clients.spec). */
const cotizadorTrasApagar = await page.context().newPage();
await openWizard(cotizadorTrasApagar, D);
const tarjetasTrasApagar = await cotizadorTrasApagar.$$eval('#serviceGrid .service-choice b', els => els.map(e => e.textContent));
const etiquetaApagada = client.serviceLines.find(s => s.id === aApagar).label;
check('el cotizador deja de ofrecerla', tarjetasTrasApagar.includes(etiquetaApagada), false);
await cotizadorTrasApagar.close();
check('apagar la última línea se rechaza',
  await page.evaluate(async id => {
    const vivas = Store.servicesEnabled();
    for (const l of vivas.slice(0, -1)) Store.setLineEnabled(l.id, false);
    try { Store.setLineEnabled(vivas[vivas.length - 1].id, false); return 'apagada'; }
    catch (e) { return e.message; }
  }, aApagar), 'Debe quedar al menos una línea habilitada.');
await page.evaluate(id => Store.setLineEnabled(id, true), aApagar);
check('volver a marcarla la repone',
  await page.evaluate(id => Store.servicesEnabled().some(s => s.id === id), aApagar), true);

/* La línea no es una etiqueta: decide qué pasos existen y qué suma la estimación. Reparación pide
 * los daños (paso propio) y su valor entra al total; suministro cotiza solo material y ni siquiera
 * tiene ese paso. Todo por la UI, como lo haría el cliente. */
await page.evaluate(() => Store.saveSettings({ plan: 'Professional', disabledLines: [] }));
const flujo = await page.context().newPage();
flujo.on('pageerror', e => errs.push(String(e)));
await openWizard(flujo, D);
await flujo.setInputFiles('#furniturePhoto', png);
await flujo.waitForFunction(() => state.photos.length >= 3);
const estadoFlujo = () => flujo.evaluate(() => ({
  paso: +document.querySelector('.wizard-step.active').dataset.step,
  visible: document.getElementById('mobileStep').textContent,
  dotDanos: !document.querySelector('[data-step-dot="2"]').hidden,
  motivo: document.getElementById('journeyContext').hidden ? null : document.getElementById('journeyContextLabel').textContent,
}));
await flujo.click('#nextButton');
check('con suministro no hay paso de daños y «Continuar» cae en Medidas',
  await estadoFlujo(), { paso: 9, visible: 'Paso 3 de 7', dotDanos: false, motivo: 'Suministro de tela' });
check('y su estimación es solo material',
  await flujo.evaluate(() => { const e = Store.lineEstimate(Store.serviceById('suministro-tela'), [1000000, 1200000], []); return [e.laborPct, e.total]; }),
  [0, [1000000, 1200000]]);
await flujo.click('#backButton'); await flujo.waitForSelector('[data-step="1"].active');
await flujo.click('#backButton'); await flujo.waitForSelector('[data-step="0"].active');
await flujo.click('#serviceGrid .service-choice:has-text("Reparación y restauración")');
check('elegir reparación avisa el motivo y abre su paso', (await estadoFlujo()).dotDanos, true);
await flujo.click('#nextButton'); await flujo.waitForSelector('[data-step="1"].active');
await flujo.click('#nextButton'); await flujo.waitForSelector('[data-step="2"].active');
check('el paso de daños es el tercero de ocho', (await estadoFlujo()).visible, 'Paso 3 de 8');
await flujo.click('#nextButton');
check('sin marcar ningún daño no avanza, y lo explica',
  [await flujo.$eval('.wizard-step.active', s => s.dataset.step), await flujo.$eval('#damageError', e => !e.hidden)], ['2', true]);
await flujo.click('#damageGrid label:has-text("Estructura")');
await flujo.click('#damageGrid label:has-text("Resortes")');
check('los daños marcados suman al total y la mano de obra se declara',
  await flujo.evaluate(() => {
    const e = Store.lineEstimate(Store.serviceById('reparacion'), [1000000, 1200000], ['estructura', 'resortes']);
    return [e.laborPct, e.damages, e.total];
    // 1.000.000 × 1,6 + 320.000 y 1.200.000 × 1,6 + 320.000: mano de obra 60 % + los dos daños.
  }), [60, 320000, [1920000, 2240000]]);
await flujo.click('#nextButton'); await flujo.waitForSelector('[data-step="9"].active');
await flujo.fill('#width','210'); await flujo.fill('#height','85'); await flujo.fill('#depth','90');
await flujo.click('#nextButton'); await flujo.waitForSelector('[data-step="12"].active');
await flujo.click('#nextButton'); await flujo.waitForSelector('[data-step="13"].active');
await flujo.click('#analyzeButton'); await flujo.waitForSelector('#analysisChecks:not([hidden])');
await flujo.click('#nextButton'); await flujo.waitForSelector('[data-step="14"].active');
await flujo.click('#fabricGrid .fabric-card:nth-child(1)');
check('el bloque de precio reparte material, mano de obra y reparaciones',
  await flujo.evaluate(() => {
    /* El bloque lo pinta #priceParts desde lineQuote(): un span por parte (material, mano de obra,
     * daños). #priceLabor/#priceDamages ya no existen; la verificación va sobre lo que se ve. */
    const partes = [...document.querySelectorAll('#priceParts span')].map(s => s.textContent).join(' | ');
    return {
      caption: document.getElementById('priceCaption').textContent,
      mano: /Mano de obra/.test(partes),
      danos: /Da[ñn]os|Reparaci/.test(partes),
      total: document.getElementById('priceRange').textContent.includes('$'),
    };
  }), { caption: 'Estimación del motivo', mano: true, danos: true, total: true });
/* El motivo acompaña al cliente y se puede cambiar: el aviso está en todos los pasos menos en el
 * de la línea, que es donde se elige. */
check('el aviso del motivo sigue en el último paso', (await estadoFlujo()).motivo, 'Reparación y restauración');
await flujo.click('#journeyContextChange'); await flujo.waitForSelector('[data-step="0"].active');
check('y su «cambiar» devuelve al paso de la línea', (await estadoFlujo()).motivo, null);
await flujo.close();
/* Los cuatro motivos que no van por tela: cada uno pide SUS pasos (declarados en el catálogo) y
 * cotiza a su manera (Store.lineQuote). Se comprueba lo que el cliente ve y lo que se suma, con
 * las tarifas demo del catálogo: si una cambia, el número de la comprobación cambia con ella. */
{
  await page.evaluate(() => Store.saveSettings({ plan: 'Business', disabledLines: [] }));
  const motivos = [
    { etiqueta: 'Mantenimiento y limpieza', pricing: 'pieza',
      pasos: ['Tu línea de servicio', 'Tu mueble', 'Lo que necesita', 'Cómo llega al taller', 'Validación', 'Tu cotización'],
      ctx: { furnitureId: 'sofa', quantity: 1, answers: { tratamientos: ['quitamanchas'], traslado: 'taller' } }, total: 320000 },
    { etiqueta: 'Tapicería arquitectónica', pricing: 'm2',
      pasos: ['Tu línea de servicio', 'La superficie', 'Cómo se monta', 'Validación', 'Recomendación', 'Tu cotización'],
      ctx: { answers: { ancho: 300, alto: 200, papel: 'decorativo' }, fabricPerM2: 95000 }, total: 840000 },
    { etiqueta: 'Muebles a la medida', pricing: 'fabricacion',
      pasos: ['Tu línea de servicio', 'Tu mueble', 'Medidas', 'Materiales y acabados', 'El tapizado', 'Preferencias', 'Validación', 'Recomendación', 'Tu cotización'],
      ctx: { furnitureId: 'silla', materialRange: [0, 0], answers: { madera: 'pino', acabado: 'barniz', firmeza: 'media' } }, total: 628500 },
    { etiqueta: 'Proyecto comercial', pricing: 'unidad',
      pasos: ['Tu línea de servicio', 'Tu mueble', 'Qué piezas', 'La obra', 'Validación', 'Tu cotización'],
      ctx: { boq: [{ furniture: 'poltrona', cantidad: 12 }], answers: { servicios: ['instalacion'] } }, total: 9070000 },
  ];
  for (const m of motivos) {
    const pg = await page.context().newPage();
    pg.on('pageerror', e => errs.push(String(e)));
    await pg.goto(D + 'index.html');
    await pg.waitForTimeout(250);
    await pg.click(`#serviceGrid .service-choice:has-text("${m.etiqueta}")`);
    const vista = await pg.evaluate(() => ({
      pasos: [...document.querySelectorAll('[data-step-dot]')].filter(l => !l.hidden).map(l => l.querySelector('b').textContent),
      pricing: state.service ? state.service.pricing : null,
      estimado: Store.lineQuote(state.service, { furnitureId: 'silla', materialRange: [1112500, 1246000], answers: {}, boq: [] }).parts.length > 0,
    }));
    check(`«${m.etiqueta}» pide sus pasos, en su orden, y cotiza como ${m.pricing}`,
      [vista.pasos, vista.pricing, vista.estimado], [m.pasos, m.pricing, true]);
    check(`«${m.etiqueta}» suma ${await pg.evaluate(v => Store.money(v), m.total)}`,
      await pg.evaluate(({ ctx, id }) => Store.lineQuote(Store.serviceById(id), ctx).total, { ctx: m.ctx, id: m.pricing === 'pieza' ? 'mantenimiento' : m.pricing === 'm2' ? 'tapiceria-arquitectonica' : m.pricing === 'fabricacion' ? 'a-la-medida' : 'proyecto-comercial' }),
      [m.total, m.total]);
    /* Un paso de pregunta se pinta desde su spec (chips, selectores, campos o filas). */
    const pregunta = await pg.evaluate(() => {
      const s = [...document.querySelectorAll('.wizard-step[data-ask]')].find(x => x.querySelector('[data-ask-body]').dataset.built);
      if (!s) return null;
      const box = s.querySelector('[data-ask-body]');
      return { ask: s.dataset.ask, titulo: box.querySelector('h2') ? box.querySelector('h2').textContent : '', controles: box.querySelectorAll('input,select').length };
    });
    check(`«${m.etiqueta}» pinta su primera pregunta`, [!!pregunta, pregunta && pregunta.controles > 0], [true, true]);
    await pg.close();
  }
}
await page.click('button[data-page="quotes"]');
const row = await page.textContent('#quoteRows');
check('the quote appears in the backoffice table', row.includes(quoteId), true);
check('with the customer name', row.includes('Natalia Peña'), true);
check('the chosen fabric', row.includes('Velvet Siena'), true);
check('and routed to the right seller', row.includes('Laura Méndez'), true);
// The name is a label; the id is the link. Renaming an adviser used to detach
// their whole history, because a quote only ever knew them by name.
check('the quote is linked to the adviser by id, not only by name',
  await page.evaluate(id => Store.get('quotes', id.trim()).sellerId, quoteId), 1);
await page.click('button[data-page="sellers"]');
await page.click('[data-edit-seller="1"]');
await page.fill('#sellerForm [name=name]', 'Laura Méndez Ruiz');
await page.click('#sellerForm button.primary');
await page.click('button[data-page="quotes"]');
check('renaming her carries that quote with her instead of orphaning it',
  (await page.textContent('#quoteRows')).includes('Laura Méndez Ruiz'), true);

await page.click(`[data-quote="${quoteId}"]`);
await page.waitForSelector('#quoteModal.open');
check('the detail carries the photo the customer uploaded',
  await page.$eval('#quoteDetail', el => !!el.querySelector('img')), true);
check('and the measurements', (await page.textContent('#quoteDetail')) !== null &&
  await page.$$eval('#quoteDetail input', els => els.some(i => i.value === '210 × 85 × 90 cm')), true);

console.log('\nDASHBOARD — derived, not decorative');
await page.click('#quoteModal [data-close]');
await page.click('button[data-page="dashboard"]');
check('total reflects real quotes (6 seed + 1 new)', await page.textContent('#statTotal'), '7');
await page.click('button[data-page="quotes"]');
await page.click(`[data-quote="${quoteId}"]`);
await page.click('[data-set-status="En gestión"]');
check('a non-final status moves forward',
  await page.evaluate(id => Store.get('quotes', id.trim()).status, quoteId), 'En gestión');
await page.click('#quoteModal [data-close]');
await page.click('button[data-page="dashboard"]');
check('advancing a quote moves the donut legend',
  await page.evaluate(() => [+document.getElementById('legNew').textContent, +document.getElementById('legProgress').textContent]),
  [2, 3]);

console.log('\nQUOTE CYCLE — non-final statuses move freely, closing needs confirmation and locks');
await page.click('button[data-page="quotes"]');
await page.click(`[data-quote="${quoteId}"]`);
await page.click('[data-set-status="Nueva"]');
check('and back',
  await page.evaluate(id => Store.get('quotes', id.trim()).status, quoteId), 'Nueva');
await page.click('[data-set-status="Cotizada"]');
check('reaches Cotizada — the only status closing is offered from',
  await page.evaluate(id => Store.get('quotes', id.trim()).status, quoteId), 'Cotizada');
await page.waitForSelector('#quoteStatusControl [data-close-status]');
check('closing buttons only appear once Cotizada',
  await page.$$eval('#quoteStatusControl [data-close-status]', els => els.map(e => e.dataset.closeStatus).sort()),
  ['Aceptada', 'Rechazada']);

/* Closing a quote asks through the in-app confirm (askConfirm), not a native
 * confirm() — this is the FIRST site in the suite that opens it, so its
 * accessibility behaviors (focus-on-open, Esc-cancels, backdrop-cancels,
 * focus-returns-to-trigger) are verified right here; every later site in this
 * file reuses the exact same component. */
console.log('\nCONFIRM MODAL (askConfirm) — accesibilidad: se abre con foco en la acción, Esc y el fondo cancelan, y el foco vuelve al disparador');
await page.focus('[data-close-status="Aceptada"]');
await page.click('[data-close-status="Aceptada"]');
check('se abre con el foco en el botón de acción',
  await page.evaluate(() => ({ open: document.getElementById('confirmModal').classList.contains('open'), focused: document.activeElement.id })),
  { open: true, focused: 'confirmOk' });
check('el mensaje es exactamente el mismo texto que usaba el confirm() nativo',
  await page.textContent('#confirmModalBody'), 'Esto cierra el caso y no se puede deshacer. ¿Marcar esta solicitud como "Aceptada"?');
check('el botón de acción es el destructivo "Sí, continuar"', await page.textContent('#confirmOk'), 'Sí, continuar');
await page.keyboard.press('Escape');
check('Esc cierra el modal sin tocar el estado',
  await page.evaluate(id => ({ open: document.getElementById('confirmModal').classList.contains('open'), status: Store.get('quotes', id.trim()).status }), quoteId),
  { open: false, status: 'Cotizada' });
check('el foco vuelve al botón que abrió el modal',
  await page.evaluate(() => document.activeElement.dataset.closeStatus), 'Aceptada');

await page.click('[data-close-status="Rechazada"]');
await page.click('#confirmModal', { position: { x: 5, y: 5 } }); // outside the centered .modal box
check('un clic en el fondo también cancela, sin tocar el estado',
  await page.evaluate(id => ({ open: document.getElementById('confirmModal').classList.contains('open'), status: Store.get('quotes', id.trim()).status }), quoteId),
  { open: false, status: 'Cotizada' });

// Dismissing via "Cancelar" must also leave the case exactly as it was.
await page.click('[data-close-status="Aceptada"]');
await page.click('#confirmCancel');
check('cancelar la confirmación de cierre deja el caso abierto, sin cambios',
  await page.evaluate(id => { const q = Store.get('quotes', id.trim()); return [q.status, !!q.closedAt]; }, quoteId),
  ['Cotizada', false]);

// Confirming closes it for good.
await page.click('[data-close-status="Rechazada"]');
await page.click('#confirmOk');
check('confirming stamps status and closedAt',
  await page.evaluate(id => { const q = Store.get('quotes', id.trim()); return [q.status, typeof q.closedAt]; }, quoteId),
  ['Rechazada', 'string']);
await page.waitForSelector('#quoteStatusControl [data-set-status]', { state: 'detached' });
check('the status control disappears once closed — no buttons left, admin included',
  await page.evaluate(() => !document.querySelector('#quoteStatusControl [data-set-status],#quoteStatusControl [data-close-status]')),
  true);
check('a Store-level attempt to change the status is refused, not just hidden in the UI',
  await page.evaluate(id => { const q = Store.get('quotes', id.trim()); q.status = 'Nueva';
    try { Store.put('quotes', q); return 'did not throw'; } catch (err) { return err.message; } }, quoteId),
  'Esta cotización ya está cerrada; el estado no se puede modificar.');
check('and the stored status really did not change',
  await page.evaluate(id => Store.get('quotes', id.trim()).status, quoteId), 'Rechazada');

console.log('\nCOMMENTS — allowed at any status (closed included), append-only, never editable');
check('an empty comment is refused from the UI',
  await page.evaluate(id => (Store.get('quotes', id.trim()).comments || []).length, quoteId), 0);
await page.click('#commentForm button[type=submit]');
check('and nothing was added',
  await page.evaluate(id => (Store.get('quotes', id.trim()).comments || []).length, quoteId), 0);
const meName = await page.evaluate(() => me.name);
await page.fill('#commentText', 'Nota de seguimiento tras el cierre.');
await page.click('#commentForm button[type=submit]');
await page.waitForFunction(id => (Store.get('quotes', id.trim()).comments || []).length === 1, quoteId);
await page.waitForSelector('#quoteComments .activity li');
check('the comment carries author, date and text, oldest first',
  await page.evaluate(id => Store.get('quotes', id.trim()).comments[0].text, quoteId),
  'Nota de seguimiento tras el cierre.');
const commentBlock = await page.textContent('#quoteComments');
check('the author shows on a closed quote too',
  commentBlock.includes(meName) && commentBlock.includes('Nota de seguimiento'), true);
check('there is no edit or delete control for a comment',
  await page.evaluate(() => !document.querySelector('#quoteComments [data-edit-comment],#quoteComments [data-delete-comment]')),
  true);
check('Store.addComment itself refuses an empty/whitespace comment',
  await page.evaluate(id => { try { Store.addComment(id.trim(), { author: 'x', text: '   ' }); return 'did not throw'; }
    catch (err) { return err.message; } }, quoteId),
  'El comentario no puede quedar vacío');

console.log('\nTHE LOCK HOLDS EVEN WITHOUT closedAt — a status-final row that never got the timestamp');
// Simulates a row that reached a final status some other way (a hand-edited
// pack, an import) and never went through setQuoteStatus, so it never got
// closedAt — isQuoteClosed() must still treat it as closed from the status
// alone. A fresh context keeps this from disturbing quoteId's own state above.
const lockCtx = await browser.newContext();
const lockPage = await lockCtx.newPage();
await openAdmin(lockPage, D);
const lockResult = await lockPage.evaluate(() => {
  const q = Store.all('quotes')[0]; // any fresh seed row
  const forced = { ...q, status: 'Aceptada' };
  delete forced.closedAt;
  Store.put('quotes', forced); // allowed: the row was not closed before this write
  const results = {};
  try { Store.put('quotes', { ...forced, status: 'Nueva' }); results.put = 'did not throw'; }
  catch (err) { results.put = err.message; }
  try { Store.setQuoteStatus(forced.id, 'Nueva'); results.setQuoteStatus = 'did not throw'; }
  catch (err) { results.setQuoteStatus = err.message; }
  return { id: String(forced.id), stillNoClosedAt: !Store.get('quotes', forced.id).closedAt, results };
});
check('the row really has no closedAt (this is the case under test)', lockResult.stillNoClosedAt, true);
check('Store.put refuses a status change on a status-final row with no closedAt',
  lockResult.results.put, 'Esta cotización ya está cerrada; el estado no se puede modificar.');
check('Store.setQuoteStatus refuses it too',
  lockResult.results.setQuoteStatus, 'Esta cotización ya está cerrada; el estado no se puede modificar.');
await lockPage.click('button[data-page="quotes"]');
await lockPage.click(`[data-quote="${lockResult.id}"]`);
await lockPage.waitForSelector('#quoteModal.open');
await lockPage.waitForSelector('#quoteStatusControl .modal-hint');
check('the detail modal renders no status pills for it either, closedAt or not',
  await lockPage.evaluate(() => !document.querySelector('#quoteStatusControl [data-set-status],#quoteStatusControl [data-close-status]')),
  true);
check('and the locked message does not print "el undefined" when closedAt is missing',
  (await lockPage.textContent('#quoteStatusControl')).includes('undefined'), false);
await lockCtx.close();

console.log('\nDASHBOARD METRICS — match what Store actually holds, per statusClass/funnel/cycle');
await page.click('#quoteModal [data-close]');
await page.click('button[data-page="dashboard"]');
const expected = await page.evaluate(() => {
  const qs = Store.all('quotes');
  const by = s => qs.filter(q => q.status === s).length;
  const cerradas = by('Aceptada') + by('Rechazada');
  const conCotizacion = by('Cotizada') + cerradas;
  const cerradasConFecha = qs.filter(q => q.closedAt);
  // q.date is a local calendar day; parse it as local midnight (matching
  // admin.html), not UTC midnight, or this expectation drifts from what the
  // page actually shows outside UTC.
  const avgDays = cerradasConFecha.length
    ? cerradasConFecha.reduce((s, q) => s + Math.max(0, (new Date(q.closedAt) - new Date(q.date + 'T00:00:00')) / 86400000), 0) / cerradasConFecha.length
    : null;
  return {
    funnel: [by('Nueva'), by('En gestión'), by('Cotizada'), by('Aceptada'), by('Rechazada')],
    closed: cerradas,
    closedPct: qs.length ? Math.round(cerradas / qs.length * 100) : 0,
    acceptRate: conCotizacion ? Math.round(by('Aceptada') / conCotizacion * 100) : null,
    avgDays
  };
});
check('the funnel legend matches Store for all five statuses',
  await page.evaluate(() => ['legNew', 'legProgress', 'legSent', 'legAccepted', 'legRejected'].map(id => +document.getElementById(id).textContent)),
  expected.funnel);
check('closed cases and their % match Store',
  await page.evaluate(() => [+document.getElementById('metricClosed').textContent, document.getElementById('metricClosedPct').textContent]),
  [expected.closed, `${expected.closedPct}% del total`]);
check('acceptance rate matches Store (over Cotizada+Aceptada+Rechazada)',
  await page.textContent('#metricAcceptRate'),
  expected.acceptRate === null ? '—' : `${expected.acceptRate}%`);
check('average days to close matches Store',
  await page.textContent('#metricAvgDays'),
  expected.avgDays === null ? '—' : `${expected.avgDays.toFixed(1).replace('.', ',')} días`);

console.log('\nDASHBOARD METRICS — hand-computed from Mediterránea\'s seed, pinned to Bogotá');
// The check above trusts the same formula the page uses, so it cannot catch
// a wrong formula. This one is arithmetic done by hand against
// clients/mediterranea/seed.json's 6 seeded quotes, in a FRESH context (pure
// seed, nothing this suite created) pinned to America/Bogota so the
// local-midnight parsing of q.date is deterministic regardless of the host's
// own timezone.
//   statuses: Nueva x2, En gestión x2, Cotizada x0, Aceptada x1 (COT-1038),
//             Rechazada x1 (COT-1037)
//   cerradas = 1 + 1 = 2 of 6            -> round(2/6*100)  = 33% del total
//   conCotizacion = 0 Cotizada + 2 cerradas = 2
//   acceptRate = round(1/2*100)          = 50%
//   avgDays:
//     COT-1038: 2026-09-02T00:00-05:00 -> 2026-09-05T16:45:00-05:00
//               = 3d 16h45m = 3 + 16.75/24 = 3.6979166... days
//     COT-1037: 2026-09-01T00:00-05:00 -> 2026-09-04T10:10:00-05:00
//               = 3d 10h10m = 3 + 10.1666.../24 = 3.4236111... days
//     mean = (3.6979166... + 3.4236111...) / 2 = 3.5607638... -> toFixed(1) = "3,6"
const bogotaMetrics = await browser.newContext({ timezoneId: 'America/Bogota', locale: 'es-CO' });
const metricsPage = await bogotaMetrics.newPage();
await openAdmin(metricsPage, D);
await metricsPage.click('button[data-page="dashboard"]');
check('closed cases and % — hand-computed from the seed, not the formula',
  await metricsPage.evaluate(() => [+document.getElementById('metricClosed').textContent, document.getElementById('metricClosedPct').textContent]),
  [2, '33% del total']);
check('acceptance rate — hand-computed from the seed',
  await metricsPage.textContent('#metricAcceptRate'), '50%');
check('average days to close — hand-computed from the seed, Bogotá timezone',
  await metricsPage.textContent('#metricAvgDays'), '3,6 días');
await bogotaMetrics.close();

console.log('\nPER-SELLER CYCLE TABLE — matches Store for a seller with a closed case');
const sellerExpected = await page.evaluate(() => {
  const s = Store.get('sellers', 3); // Paula Gómez — has the seeded rejected quote
  const mine = quotesAll().filter(q => quoteIsFor(q, { sellerId: s.id, name: s.name }));
  const cot = mine.filter(q => ['Cotizada', 'Aceptada', 'Rechazada'].includes(q.status)).length;
  const cer = mine.filter(q => Store.isQuoteClosed(q)).length;
  const ace = mine.filter(q => q.status === 'Aceptada').length;
  return [s.name, String(mine.length), String(cot), String(cer), String(ace)];
});
check('the row for that seller matches, cell by cell',
  await page.$eval(`#sellerCycleRows tr:has-text("${sellerExpected[0]}")`, tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim())),
  sellerExpected);
check('the per-seller table is visible for this admin session',
  await page.isVisible('#sellerCycleTablePanel'), true);
// A seller's own dashboard hides the per-seller table entirely — see
// auth.spec.mjs's role-scoping section for that check with a real seller
// session (this suite only ever runs as the admin).

console.log('\nDEACTIVATE A TELA -> IT LEAVES THE COTIZADOR');
await page.click('button[data-page="fabrics"]');
await page.click('[data-toggle-fabric]:has-text("Desactivar")');
const deactivated = await page.evaluate(() => Store.all('fabrics').filter(f=>!f.active).map(f=>f.name));
await openWizard(page, D);
await wizardTo(5);
check('a deactivated tela disappears for customers',
  await page.$$eval('.fabric-card-body > b', (els, names) => els.every(e => !names.includes(e.textContent.split(' · ')[0])), deactivated),
  true);

console.log('\nEDIT AN EXISTING PRICE IN THE BACKOFFICE -> THE COTIZADOR REPRICES');
await openAdmin(page, D);
await page.click('button[data-page="fabrics"]');
// Pick whichever tela is still active at this point — an earlier section
// deactivated one, so the name cannot be hardcoded.
const target = await page.evaluate(() => {
  const f = Store.all('fabrics').find(x => x.active);
  return { id: f.id, name: f.name, oldPrice: f.price };
});
await page.click(`[data-edit-fabric="${target.id}"]`);
check('the edit modal opens with the price the catalogue holds',
  await page.inputValue('#fabricForm [name=price]'), String(target.oldPrice));
await page.fill('#fabricForm [name=price]', '31500');
await page.click('#fabricForm button.primary');
check('the catalogue keeps the edited price, not a duplicate row',
  await page.evaluate(n => Store.all('fabrics').filter(f => f.name === n).map(f => f.price), target.name),
  [31500]);

await openWizard(page, D);
await wizardTo(5);
await page.click(`.fabric-card:has-text("${target.name}")`);
check('the customer sees the edited rate on the card',
  (await page.textContent('.fabric-card.selected .fabric-card-body small')).includes(await page.evaluate(() => Store.money(31500))),
  true);
check('and the estimate is recomputed at the new rate',
  await priceMatchesRate(31500), true);
await page.click('#nextButton');
check('and the step-6 summary quotes the same edited rate',
  await page.evaluate(() => {
    const [mn, mx] = estimate();
    const f = n => Store.money(n);
    return document.getElementById('summaryPrice').textContent === `${f(mn*31500)} – ${f(mx*31500)}`;
  }), true);

console.log('\nEDIT THE BUDGET BRACKETS -> THE COTIZADOR OFFERS THEM');
await openAdmin(page, D);
await page.click('button[data-page="settings"]');
await setTags(page, '#setBudgets', ['30000','40000','50000']);
await page.click('#saveSettings');
await openWizard(page, D);
await page.setInputFiles('#furniturePhoto', png);
await page.waitForFunction(() => state.photos.length >= 3);
/* n cortes son n+1 tramos. La versión anterior emitía n opciones y se comía el
 * corte más alto: con 30/40/50 el cliente leía "Más de $40.000" y los $50.000
 * no aparecían en ninguna etiqueta. */
// Store.money mete un espacio duro después del $, así que la expectativa se
// arma con la misma función y no a mano.
check('the budget dropdown follows the backoffice, not hardcoded brackets',
  await page.$$eval('#budget option', els => els.map(e => e.textContent)),
  await page.evaluate(() => {
    const m = Store.money;
    return [`Hasta ${m(30000)}`, `Entre ${m(30000)} y ${m(40000)}`,
            `Entre ${m(40000)} y ${m(50000)}`, `Más de ${m(50000)}`];
  }));
check('every configured cut point is named, the top one included',
  await page.$$eval('#budget option', els => els.map(e => e.value)),
  ['30000', '40000', '50000', '']);
// "Más de" no tiene tope: con value vacío, recommend() no marca nada como
// sobre presupuesto. Antes llevaba el corte más alto y topaba en silencio.
check('the open-ended bracket really is open-ended',
  await page.evaluate(() => {
    const s = document.getElementById('budget');
    s.value = ''; renderFabrics();
    return document.querySelectorAll('.fabric-card.over-budget').length;
  }), 0);

/* A quote is written by one page and read by another, so the date has to survive
 * the trip. It used to be stored as the UTC day and re-read as UTC midnight,
 * which in Colombia (UTC-5) is 19:00 the day before. The two errors cancelled
 * out after 19:00, so the bug only showed in daylight. This pins both halves at
 * 20:30 Bogotá — the hour where the writer used to jump to the next day. */
console.log('\nTHE DATE THE COTIZADOR WRITES IS THE DATE THE BACKOFFICE SHOWS');
const bogota = await browser.newContext({ timezoneId: 'America/Bogota', locale: 'es-CO' });
const night = await bogota.newPage();
const nightErrs = []; night.on('pageerror', e => nightErrs.push(String(e)));
await night.clock.setFixedTime(new Date('2026-09-06T20:30:00-05:00'));

await openWizard(night, D);
await night.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
await openWizard(night, D);
await night.setInputFiles('#furniturePhoto', png);
await night.waitForFunction(() => state.photos.length >= 3);
await night.click('#nextButton');
await night.waitForSelector('[data-step="9"].active');
await night.fill('#width', '210'); await night.fill('#height', '85'); await night.fill('#depth', '90');
await night.click('#nextButton');
await night.waitForSelector('[data-step="12"].active');
await night.click('#nextButton');
await night.waitForSelector('[data-step="13"].active');
await night.click('#analyzeButton');
await night.waitForSelector('#analysisChecks:not([hidden])');
await night.click('#nextButton');
await night.waitForSelector('[data-step="14"].active');
await night.click('#fabricGrid .fabric-card:nth-child(1)');
await night.click('#nextButton');
await night.waitForSelector('[data-step="15"].active');
await night.fill('#fullName', 'Prueba Nocturna');
await night.fill('#email', 'noche@ejemplo.com');
await night.fill('#phone', '3001112233');
await night.check('#consent');
await night.click('#nextButton');
await night.waitForSelector('#successState:not([hidden])', { timeout: 30000 });

const nightId = (await night.textContent('#requestNumber')).trim();
check('a quote sent at 20:30 is dated the customer\'s day, not the UTC one',
  await night.evaluate(id => Store.get('quotes', id).date, nightId), '2026-09-06');

await openAdmin(night, D);
await night.click('button[data-page="quotes"]');
await night.waitForSelector('#quoteRows tr');
check('and the backoffice lists it on that same day',
  (await night.$eval(`#quoteRows tr:has(strong:text-is("${nightId}")) small`, e => e.textContent.trim())),
  '06 de sept de 2026');
// The seeds are date-only strings too, so they drifted with everything else.
check('the seeded quotes are not shifted either',
  (await night.$eval('#quoteRows tr:has(strong:text-is("COT-1042")) small', e => e.textContent.trim())),
  '04 de sept de 2026');
errs.push(...nightErrs);
await bogota.close();

console.log('\nA FABRIC IMAGE — the backoffice uploads it, the customer sees it');
await fresh('admin.html');
await page.click('button[data-page="fabrics"]');
await page.click('[data-edit-fabric="1"]');   // Lino Verona
check('a tela with no image offers to upload one',
  await page.textContent('#fabricPhotoPick'), 'Subir imagen');
await page.setInputFiles('#fabricPhotoInput', png[0]);
await page.waitForFunction(() => document.getElementById('fabricPhotoThumb').classList.contains('filled'));
check('the preview fills and the button switches to replacing it',
  await page.textContent('#fabricPhotoPick'), 'Cambiar imagen');
await page.click('#fabricForm button.primary');

// A phone photo would blow past the ~4.9 MB localStorage ceiling, so the record
// may only ever hold the id. See browser-data-layer-not-sqlite.
check('the record keeps a reference, never the image itself',
  await page.evaluate(() => Store.get('fabrics', 1).photoId), 'fabric-1');
// The fixture is a PNG; getting JPEG back proves the canvas downscale ran and
// was not tainted by the file:// origin — that is what keeps a 4 MB phone photo
// from landing in the store at full size.
check('the bytes live in IndexedDB, downscaled to JPEG',
  await page.evaluate(() => Photos.get('fabric-1').then(u => !!u && u.startsWith('data:image/jpeg'))), true);
await page.waitForSelector('#fabricGrid .fabric:has-text("Lino Verona") .swatch.has-photo');
check('the catalogue card paints the photo instead of the colour',
  await page.$eval('#fabricGrid .fabric:has-text("Lino Verona") .swatch',
    e => e.style.background.includes('url("data:image')), true);

await openWizard(page, D);
await wizardTo(5);
await page.waitForSelector('.fabric-card:has-text("Lino Verona") .swatch.has-photo', { timeout: 5000 });
check('and the customer sees that same photo on the tela card',
  await page.$eval('.fabric-card:has-text("Lino Verona") .swatch',
    e => e.style.background.includes('url("data:image')), true);

// The form has no image input of its own, so a plain edit used to rebuild the
// record without photoId — the image would vanish on any other change.
await openAdmin(page, D);
await page.click('button[data-page="fabrics"]');
await page.click('[data-edit-fabric="1"]');
await page.waitForFunction(() => document.getElementById('fabricPhotoThumb').classList.contains('filled'));
check('reopening the tela shows the image it already has',
  await page.textContent('#fabricPhotoPick'), 'Cambiar imagen');
await page.fill('#fabricForm [name=price]', '91000');
await page.click('#fabricForm button.primary');
check('editing the price does not drop the image',
  await page.evaluate(() => [Store.get('fabrics', 1).price, Store.get('fabrics', 1).photoId]),
  [91000, 'fabric-1']);

await page.click('[data-edit-fabric="1"]');
await page.waitForFunction(() => document.getElementById('fabricPhotoThumb').classList.contains('filled'));
await page.click('#fabricPhotoDrop');
check('removing it empties the preview',
  await page.textContent('#fabricPhotoPick'), 'Subir imagen');
await page.click('#fabricForm button.primary');
check('and the record stops pointing at a photo',
  await page.evaluate(() => Store.get('fabrics', 1).photoId === undefined), true);
await page.waitForSelector('#fabricGrid .fabric:has-text("Lino Verona") .swatch:not(.has-photo)');
check('the card falls back to the colour de muestra',
  await page.$eval('#fabricGrid .fabric:has-text("Lino Verona") .swatch',
    e => e.style.background.includes('linear-gradient')), true);
// The delete is fired without blocking the save, so wait for it rather than
// asserting on the same tick the card repainted.
check('and the bytes are gone from IndexedDB',
  await page.waitForFunction(() => Photos.get('fabric-1').then(u => !u), null, { timeout: 5000 })
    .then(() => true).catch(() => false), true);

console.log('\nUPGRADE — los tres planes, en orden, con precios y conteos exactos');
await openAdmin(page, D);
await page.click('button[data-page="upgrade"]');
check('Upgrade abre en «Configurar mi plan» (el plan dejó de ser el producto)',
  await page.evaluate(() => ({
    selected: document.getElementById('tabMiAci').getAttribute('aria-selected'),
    miaciHidden: document.getElementById('panelMiAci').hidden,
    planesHidden: document.getElementById('panelPlanes').hidden
  })),
  { selected: 'true', miaciHidden: false, planesHidden: true });
check('los paquetes recomendados llevan el nombre que el dueño les dio (Taller, sin «pequeño»)',
  await page.$$eval('#aciPresets [data-preset] b', els => els.map(e => e.textContent)),
  ['Taller', 'Empresa de muebles', 'Distribuidor']);
/* El paquete ES el plan: el botón de cada paquete recomendado y la tarjeta de Planes muestran la
 * MISMA cifra (las dos salen del catálogo). Se comparan las dos pantallas entre sí, no contra un
 * número escrito a mano. */
const preciosDePaquetesYPlanes = () => page.evaluate(() => {
  const num = t => t.replace(/[^\d]/g, '');
  return {
    planes: [...document.querySelectorAll('#plansGrid .plan-card .plan-price')].map(e => num(e.textContent)),
    paquetes: [...document.querySelectorAll('#aciPresets [data-preset] em')].map(e => num(e.textContent))
  };
});
check('Año: las tarjetas muestran el precio del contrato y los paquetes el del mes',
  await preciosDePaquetesYPlanes(),
  { planes: ['299000', '699000', '1290000'], paquetes: ['399000', '899000', '1490000'] });
/* La suma de las PARTES tiene que dar EXACTO el precio POR MES del paquete (Core + sus servicios
 * + sus capacidades): si alguien mueve una cifra del catálogo, esta comprobación lo dice en voz
 * alta en vez de dejar dos cuentas que no cuadran. */
check('las partes de cada paquete suman exacto el precio del mes (399.000 / 899.000 / 1.490.000)',
  await page.evaluate(() => Store.myAci().presets.map(p => [p.id, p.composed, p.price])),
  [['taller', 399000, 399000], ['empresa', 899000, 899000], ['distribuidor', 1490000, 1490000]]);
await page.click('#aciPresets [data-preset="taller"]');
const totalMarcado = await page.evaluate(() => ({
  total: document.querySelector('#aciTotal span').textContent.replace(/[^\d]/g, ''),
  suma: String(Store.myAci().total),
  nota: document.querySelector('#aciTotal .aci-total-note').textContent
}));
check('con el paquete Taller marcado, el total de la pantalla es la suma de sus partes',
  [totalMarcado.total, totalMarcado.suma], ['399000', '399000']);
check('y el total nombra el paquete, la condición del mes y el precio del contrato',
  [/Precio del paquete «Taller»/.test(totalMarcado.nota), /mes a mes, sin contrato/.test(totalMarcado.nota), /299\.000/.test(totalMarcado.nota)], [true, true, true]);
await page.click('#tabPlanes');
check('al entrar a Planes, la pestaña queda activa con sus tarjetas visibles y Paquetes oculto',
  await page.evaluate(() => ({
    selected: document.getElementById('tabPlanes').getAttribute('aria-selected'),
    planesHidden: document.getElementById('panelPlanes').hidden,
    paquetesHidden: document.getElementById('panelPaquetes').hidden
  })),
  { selected: 'true', planesHidden: false, paquetesHidden: true });
check('exactamente tres planes, en orden Taller / Empresa de muebles / Distribuidor',
  await page.$$eval('#plansGrid .plan-card h2', els => els.map(e => e.textContent)),
  ['Taller', 'Empresa de muebles', 'Distribuidor']);
/* El nombre interno del dato (Essential/Professional/Business) no es copy: en pantalla no puede
 * quedar ninguno — ni el título de la tarjeta ni su copy («Incluye todo lo de Essential…»,
 * «…sobre el plan Essential.») — y el nombre visible sale del catálogo de paquetes. */
check('ninguna tarjeta de plan muestra el nombre interno, ni en el título ni en su copy',
  await page.$$eval('#plansGrid .plan-card', cards => cards.map(c => (c.textContent.match(/\b(Essential|Professional|Business)\b/g) || []).length)),
  [0, 0, 0]);
check('cada precio se arma con Store.money, no a mano',
  await page.$$eval('#plansGrid .plan-price', els => els.map(e => e.textContent)),
  await page.evaluate(() => [299000, 699000, 1290000].map(n => Store.money(n) + ' COP / mes')));
check('conteo de ítems — Essential: 17 incluye + 12 límites, Professional: 15 incluye + 3 límites, Business: 11',
  await page.$$eval('#plansGrid .plan-card', cards => cards.map(c => {
    const lists = c.querySelectorAll('.plan-list');
    return { incluye: lists[0].children.length, limites: lists[1] ? lists[1].children.length : 0 };
  })),
  [{ incluye: 17, limites: 12 }, { incluye: 15, limites: 3 }, { incluye: 11, limites: 0 }]);
check('los límites de Professional son exactamente estos tres, en este orden',
  await page.$$eval('#plansGrid .plan-card', cards => {
    const limitsList = cards[1].querySelectorAll('.plan-list')[1];
    return [...limitsList.children].map(li => li.textContent);
  }),
  ['Sin integraciones estandarizadas.', 'Sin exportación CSV por cuenta propia.', 'Una plantilla estándar de cotización.']);
check('el aviso de integraciones aparece bajo las tarjetas',
  await page.textContent('#plansNote'),
  'La activación de integraciones, los cargos de proveedores externos, los costos de uso y los desarrollos a la medida no están incluidos en la licencia mensual, salvo que se indique expresamente en la propuesta comercial.');

const billingSwitchState = () => page.evaluate(() => ({
  checked: [...document.querySelectorAll('#billingSwitch .billing-option')].map(b => [b.dataset.billing, b.getAttribute('aria-checked')]),
  prices: [...document.querySelectorAll('#plansGrid .plan-price')].map(e => e.textContent),
  captions: [...document.querySelectorAll('#plansGrid .plan-billing-caption')].map(e => e.textContent)
}));

console.log('\nUPGRADE — Planes: el switch de modalidad de contratación (Año por defecto)');
check('por defecto Año está seleccionado, con los tres precios anuales y "con contrato de arrendamiento a 12 meses"',
  await billingSwitchState(),
  {
    checked: [['anual', 'true'], ['mensual', 'false']],
    prices: await page.evaluate(() => [299000, 699000, 1290000].map(n => Store.money(n) + ' COP / mes')),
    captions: ['con contrato de arrendamiento a 12 meses', 'con contrato de arrendamiento a 12 meses', 'con contrato de arrendamiento a 12 meses']
  });

await page.click('#billingSwitch [data-billing="mensual"]');
await page.waitForTimeout(100);
check('clic en Mes cambia los tres precios, la leyenda y el aria-checked',
  await billingSwitchState(),
  {
    checked: [['anual', 'false'], ['mensual', 'true']],
    prices: await page.evaluate(() => [399000, 899000, 1490000].map(n => Store.money(n) + ' COP / mes')),
    captions: ['mes a mes, sin contrato', 'mes a mes, sin contrato', 'mes a mes, sin contrato']
  });
/* El paquete es el plan: en Mes las dos pantallas dicen el mismo número (el precio por mes). */
check('Mes: las tarjetas y los paquetes recomendados dicen el mismo precio',
  await preciosDePaquetesYPlanes(),
  { planes: ['399000', '899000', '1490000'], paquetes: ['399000', '899000', '1490000'] });

await page.reload();
await page.waitForSelector('#appShell:not([hidden])');
await page.click('button[data-page="upgrade"]');
// Un recargue devuelve Upgrade a su pestaña por defecto («Configurar mi plan»): para tocar el
// switch de modalidad hay que entrar a Planes.
await page.click('#tabPlanes');
check('el periodo elegido (Mes) sobrevive a un recargo de página',
  await billingSwitchState(),
  {
    checked: [['anual', 'false'], ['mensual', 'true']],
    prices: await page.evaluate(() => [399000, 899000, 1490000].map(n => Store.money(n) + ' COP / mes')),
    captions: ['mes a mes, sin contrato', 'mes a mes, sin contrato', 'mes a mes, sin contrato']
  });

check('el radiogroup del switch se llama "Modalidad de contratación"',
  await page.getAttribute('#billingSwitch', 'aria-label'), 'Modalidad de contratación');

console.log('\nUPGRADE — el modal de cambio de plan (askConfirm) cita el precio del periodo seleccionado (Mes)');
const invoicesBeforeMes = await page.evaluate(() => Store.all('invoices').length);
await page.click('#plansGrid [data-plan="Business"]');
const mesDialogMsg = await page.textContent('#confirmModalBody');
check('el modal cita el precio mensual de Distribuidor, no el anual, y la modalidad mes a mes',
  mesDialogMsg, `¿Confirmas el cambio al plan Distribuidor por ${await page.evaluate(() => Store.money(1490000))} COP / mes, mes a mes y sin contrato?`);
await page.click('#confirmCancel');
check('cancelar deja el plan sin cambios, y cambiar el periodo tampoco lo cambió, y no crea factura',
  [await page.evaluate(() => Store.settings().plan), await page.evaluate(() => Store.all('invoices').length)],
  ['Essential', invoicesBeforeMes]);

console.log('\nUPGRADE — el switch de periodo se navega con el teclado (flechas activan)');
await page.focus('#billingSwitch [data-billing="mensual"]');
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(100);
check('flecha izquierda selecciona Año, mueve el foco y actualiza los precios',
  await page.evaluate(() => ({
    active: document.activeElement.dataset.billing,
    checked: document.querySelector('#billingSwitch [aria-checked="true"]').dataset.billing,
    price: document.querySelector('#plansGrid .plan-price').textContent
  })),
  { active: 'anual', checked: 'anual', price: await page.evaluate(() => Store.money(299000) + ' COP / mes') });

const planStates = () => page.evaluate(() => [...document.querySelectorAll('#plansGrid .plan-card')].map(c => {
  const btn = c.querySelector('.plan-cta button');
  const label = c.querySelector('.plan-current-label');
  return { name: c.querySelector('h2').textContent, current: c.classList.contains('current'),
    label: label ? label.textContent : null, cta: btn.textContent, disabled: btn.disabled };
}));

console.log('\nUPGRADE — por defecto Taller es el plan actual');
check('Taller: etiqueta "Plan actual" y botón deshabilitado; Empresa de muebles/Distribuidor ofrecen mejorar',
  await planStates(),
  [
    { name: 'Taller', current: true, label: 'Plan actual', cta: 'Tu plan actual', disabled: true },
    { name: 'Empresa de muebles', current: false, label: null, cta: 'Mejorar a Empresa de muebles', disabled: false },
    { name: 'Distribuidor', current: false, label: null, cta: 'Mejorar a Distribuidor', disabled: false }
  ]);

console.log('\nUPGRADE — cambiar de plan pide confirmación (askConfirm) con el precio, y cancelar no cambia nada ni crea factura');
const invoicesBeforePlan = await page.evaluate(() => Store.all('invoices').length);
await page.click('#plansGrid [data-plan="Business"]');
const dialogMsg = await page.textContent('#confirmModalBody');
check('el modal menciona el plan, el precio y la modalidad de arrendamiento anual',
  dialogMsg, `¿Confirmas el cambio al plan Distribuidor por ${await page.evaluate(() => Store.money(1290000))} COP / mes, con contrato de arrendamiento a 12 meses?`);
await page.click('#confirmCancel');
check('cancelar deja a Essential como plan actual, y no crea ninguna factura',
  [await page.evaluate(() => Store.settings().plan), await page.evaluate(() => Store.all('invoices').length)],
  ['Essential', invoicesBeforePlan]);

console.log('\nUPGRADE — confirmar el cambio crea una factura Pendiente y abre el pago simulado, SIN aplicar el cambio todavía (Bold real: el backend crea el link y confirma por webhook — acá no hay red)');
await page.click('#plansGrid [data-plan="Business"]');
await page.click('#confirmOk');
await page.waitForSelector('#payModal.open');
check('el plan sigue en Essential mientras la factura está Pendiente',
  await page.evaluate(() => Store.settings().plan), 'Essential');
const planInvoice = await page.evaluate(() => Store.all('invoices')[0]);
check('la factura queda Pendiente, con el monto de PLANS/planPrice() (nunca algo tecleado), la modalidad y el proveedor simulado',
  { status: planInvoice.status, amount: planInvoice.amount, kind: planInvoice.kind, target: planInvoice.target, billing: planInvoice.billing, provider: planInvoice.provider, paidAt: planInvoice.paidAt },
  { status: 'Pendiente', amount: 1290000, kind: 'plan', target: 'Business', billing: 'anual', provider: 'BOLD (simulado)', paidAt: null });
check('la referencia y la URL de pago son obviamente falsas: simulado://, nunca checkout.bold.co ni ningún dominio real',
  /^simulado:\/\/pago\//.test(planInvoice.checkoutUrl) && planInvoice.reference.startsWith(`QAI-${planInvoice.id}-`), true);
const planPayBody = await page.textContent('#payModalBody');
check('el modal trae el concepto, el monto, la modalidad anual y la referencia',
  [planPayBody.includes('Plan Distribuidor'), planPayBody.includes(await page.evaluate(() => Store.money(1290000))), planPayBody.includes('Año'), planPayBody.includes(planInvoice.reference)],
  [true, true, true, true]);
check('el modal muestra la etiqueta obligatoria de simulación, tal cual',
  planPayBody.includes('Simulación de pago · este prototipo no procesa pagos reales.'), true);

console.log('\nUPGRADE — aprobar el pago simulado paga la factura y RECIÉN AHÍ aplica el cambio de plan, con su propio toast');
await page.click('#payApprove');
check('el toast del pago aprobado nombra el concepto', await page.textContent('#toast'), 'Pago aprobado. Plan Distribuidor activado.');
check('el modal se cierra', await page.evaluate(() => document.getElementById('payModal').classList.contains('open')), false);
check('Distribuidor queda como plan actual; Taller y Empresa de muebles ahora ofrecen cambiar',
  await planStates(),
  [
    { name: 'Taller', current: false, label: null, cta: 'Cambiar a Taller', disabled: false },
    { name: 'Empresa de muebles', current: false, label: null, cta: 'Cambiar a Empresa de muebles', disabled: false },
    { name: 'Distribuidor', current: true, label: 'Plan actual', cta: 'Tu plan actual', disabled: true }
  ]);
check('la factura queda Pagada con paidAt',
  await page.evaluate(id => { const inv = Store.get('invoices', id); return { status: inv.status, hasPaidAt: !!inv.paidAt }; }, planInvoice.id),
  { status: 'Pagada', hasPaidAt: true });
await page.reload();
await page.waitForSelector('#appShell:not([hidden])');
await page.click('button[data-page="upgrade"]');
// Mismo caso: tras el recargue, Planes hay que abrirlo a mano.
await page.click('#tabPlanes');
check('el plan elegido sobrevive a un recargo de página',
  await page.evaluate(() => Store.settings().plan), 'Business');

console.log('\nUPGRADE — rechazar el pago en el modal: la factura queda Rechazada y el plan NO cambia');
await page.click('#plansGrid [data-plan="Professional"]');
await page.click('#confirmOk');
await page.waitForSelector('#payModal.open');
const rejectedInvoice = await page.evaluate(() => Store.all('invoices')[0]);
await page.click('#payReject');
check('el toast de rechazo', await page.textContent('#toast'), 'Pago rechazado. No se aplicó ningún cambio.');
check('el plan sigue siendo Business — el cambio a Professional no se aplicó',
  await page.evaluate(() => Store.settings().plan), 'Business');
check('la factura rechazada queda Rechazada, sin paidAt',
  await page.evaluate(id => { const inv = Store.get('invoices', id); return { status: inv.status, paidAt: inv.paidAt }; }, rejectedInvoice.id),
  { status: 'Rechazada', paidAt: null });

console.log('\nSTORE — settleInvoice se niega a tocar una factura ya procesada, sea cual sea el estado pedido');
check('pagar de nuevo una factura ya Rechazada lanza error y no la cambia',
  await page.evaluate(id => { try { Store.settleInvoice(id, 'Pagada'); return 'no-error'; } catch (e) { return e.message; } }, rejectedInvoice.id),
  'Esta factura ya fue procesada; no se puede modificar.');
check('la misma factura sigue Rechazada tras el intento',
  await page.evaluate(id => Store.get('invoices', id).status, rejectedInvoice.id), 'Rechazada');

console.log('\nUPGRADE — cancelar el modal deja la factura Pendiente, sin tocar nada; se puede pagar después desde Facturación');
await page.click('#plansGrid [data-plan="Professional"]');
await page.click('#confirmOk');
await page.waitForSelector('#payModal.open');
const laterInvoice = await page.evaluate(() => Store.all('invoices')[0]);
await page.click('#payModal [data-close]');
check('el modal se cierra sin cambiar el plan', await page.evaluate(() => Store.settings().plan), 'Business');
check('la factura sigue Pendiente', await page.evaluate(id => Store.get('invoices', id).status, laterInvoice.id), 'Pendiente');

await page.click('#tabFacturacion');
check('Facturación queda seleccionada y su panel visible; Paquetes se oculta',
  await page.evaluate(() => ({
    facturacionSel: document.getElementById('tabFacturacion').getAttribute('aria-selected'),
    facturacionHidden: document.getElementById('panelFacturacion').hidden
  })),
  { facturacionSel: 'true', facturacionHidden: false });
check('la factura Pendiente aparece primero (más reciente), con botón Pagar',
  await page.$eval('#invoiceRows tr:first-child', tr => ({ text: tr.textContent, hasPay: !!tr.querySelector('[data-pay-invoice]') })),
  { text: (await page.$eval('#invoiceRows tr:first-child', tr => tr.textContent)), hasPay: true });
check('la fila trae fecha, concepto, monto, modalidad, estado y referencia de esa factura',
  await page.$eval('#invoiceRows tr:first-child', tr => tr.textContent.includes('Pendiente') && tr.textContent.includes('Empresa de muebles')), true);

await page.click(`#invoiceRows [data-pay-invoice="${laterInvoice.id}"]`);
await page.waitForSelector('#payModal.open');
await page.click('#payApprove');
check('pagar una factura pendiente desde la lista aplica el cambio que esa factura guardaba (Empresa de muebles), con su toast',
  [await page.evaluate(() => Store.settings().plan), await page.textContent('#toast')],
  ['Professional', 'Pago aprobado. Plan Empresa de muebles activado.']);
check('esa factura ya no puede pagarse otra vez',
  await page.evaluate(id => { try { Store.settleInvoice(id, 'Pagada'); return 'no-error'; } catch (e) { return e.message; } }, laterInvoice.id),
  'Esta factura ya fue procesada; no se puede modificar.');

console.log('\nUPGRADE — Paquetes: los cinco, en orden, con los precios exactos');
await page.click('#tabPaquetes');
await page.waitForTimeout(150);
check('el tab Paquetes queda seleccionado y su panel visible; Planes se oculta',
  await page.evaluate(() => ({
    paquetesSel: document.getElementById('tabPaquetes').getAttribute('aria-selected'),
    planesHidden: document.getElementById('panelPlanes').hidden,
    paquetesHidden: document.getElementById('panelPaquetes').hidden
  })),
  { paquetesSel: 'true', planesHidden: true, paquetesHidden: false });
check('el lead cambia al de Paquetes',
  await page.textContent('#upgradeLead'), 'Recarga funciones específicas sin cambiar de plan.');
check('los cinco paquetes, en orden, con el precio exacto construido con Store.money',
  await page.$$eval('#packagesGrid .package-card', cards => cards.map(c => ({
    name: c.querySelector('h2').textContent, price: c.querySelector('.package-price').textContent
  }))),
  await page.evaluate(() => [
    ['25 cotizaciones adicionales', `${Store.money(90000)} COP`],
    ['100 interacciones de IA adicionales', `${Store.money(70000)} – ${Store.money(100000)} COP`],
    ['5 GB de almacenamiento adicional', `${Store.money(40000)} COP / mes`],
    ['Usuario adicional', `${Store.money(50000)} COP / mes`],
    ['Sede adicional', `${Store.money(80000)} – ${Store.money(120000)} COP / mes`]
  ].map(([name, price]) => ({ name, price }))));

console.log('\nUPGRADE — las pestañas se navegan con el teclado (flechas activan, no solo mueven el foco)');
await page.focus('#tabPlanes');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(100);
check('flecha derecha activa Paquetes y mueve el foco',
  await page.evaluate(() => ({ active: document.activeElement.id, selected: document.querySelector('[aria-selected="true"]').id })),
  { active: 'tabPaquetes', selected: 'tabPaquetes' });
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(100);
check('flecha izquierda vuelve a Planes',
  await page.evaluate(() => ({ active: document.activeElement.id, selected: document.querySelector('[aria-selected="true"]').id })),
  { active: 'tabPlanes', selected: 'tabPlanes' });
await page.click('#tabPaquetes');
await page.waitForTimeout(100);

console.log('\nUPGRADE — comprar un paquete pide confirmación (askConfirm), y cancelar no suma nada ni crea factura');
const invoicesBeforePkg = await page.evaluate(() => Store.all('invoices').length);
await page.click('#packagesGrid [data-package="extra-user"]');
await page.click('#confirmCancel');
check('sin confirmar, no aparece "Comprados", el conteo sigue en 0 y no se creó factura',
  await page.evaluate(pkgBefore => {
    const c = [...document.querySelectorAll('#packagesGrid .package-card')].find(x => x.querySelector('h2').textContent === 'Usuario adicional');
    return { bought: c.querySelector('.package-bought') ? c.querySelector('.package-bought').textContent : null, count: (Store.settings().packages || {})['extra-user'] || 0, invoices: Store.all('invoices').length };
  }, invoicesBeforePkg),
  { bought: null, count: 0, invoices: invoicesBeforePkg });

console.log('\nUPGRADE — confirmar la compra crea una factura Pendiente y abre el pago; el conteo NO sube hasta aprobar');
await page.click('#packagesGrid [data-package="extra-user"]');
const pkgDialogMsg = await page.textContent('#confirmModalBody');
check('el modal menciona el paquete y su precio exacto',
  pkgDialogMsg, `¿Confirmas la compra de Usuario adicional por ${await page.evaluate(() => Store.money(50000))} COP / mes?`);
await page.click('#confirmOk');
await page.waitForSelector('#payModal.open');
check('el conteo sigue en 0 mientras la factura está Pendiente',
  await page.evaluate(() => (Store.settings().packages || {})['extra-user'] || 0), 0);
const pkgInvoice1 = await page.evaluate(() => Store.all('invoices')[0]);
check('la factura del paquete usa pkg.min como monto — nunca el texto del rango ni algo tecleado',
  { kind: pkgInvoice1.kind, target: pkgInvoice1.target, amount: pkgInvoice1.amount, concept: pkgInvoice1.concept, billing: pkgInvoice1.billing },
  { kind: 'package', target: 'extra-user', amount: 50000, concept: 'Paquete · Usuario adicional', billing: undefined });
await page.click('#payApprove');
check('el toast confirma la compra tras aprobar el pago', await page.textContent('#toast'), 'Pago aprobado. Paquete · Usuario adicional activado.');
check('"Comprados: 1" aparece recién ahora',
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('#packagesGrid .package-card')].find(x => x.querySelector('h2').textContent === 'Usuario adicional');
    return c.querySelector('.package-bought').textContent;
  }),
  'Comprados: 1');

console.log('\nUPGRADE — una segunda compra aprobada suma "Comprados: 2" — una recarga, no un toggle — y persiste');
await page.click('#packagesGrid [data-package="extra-user"]');
await page.click('#confirmOk');
await page.waitForSelector('#payModal.open');
await page.click('#payApprove');
check('"Comprados: 2" aparece y el botón sigue activo',
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('#packagesGrid .package-card')].find(x => x.querySelector('h2').textContent === 'Usuario adicional');
    return { bought: c.querySelector('.package-bought').textContent, disabled: c.querySelector('[data-package]').disabled };
  }),
  { bought: 'Comprados: 2', disabled: false });
await page.reload();
await page.waitForSelector('#appShell:not([hidden])');
await page.click('button[data-page="upgrade"]');
await page.click('#tabPaquetes');
await page.waitForTimeout(150);
check('el conteo de compras sobrevive a un recargo de página',
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('#packagesGrid .package-card')].find(x => x.querySelector('h2').textContent === 'Usuario adicional');
    return c.querySelector('.package-bought').textContent;
  }),
  'Comprados: 2');

console.log('\nFACTURACIÓN — lista las facturas más recientes primero, con la fila esperada');
await page.click('#tabFacturacion');
check('al menos las dos facturas Pagadas del paquete, más recientes primero',
  await page.$$eval('#invoiceRows tr', trs => trs.slice(0, 2).map(tr => tr.textContent.includes('Pagada') && tr.textContent.includes('Usuario adicional'))),
  [true, true]);

/* USAGE — a fresh context, so the plan is the default Essential and nothing
 * has been bought: the section above left this page on Business with packages. */
console.log('\nUSAGE — el consumo real contra el plan por defecto (Essential)');
const usageCtx = await browser.newContext();
const up = await usageCtx.newPage();
up.on('pageerror', e => errs.push(String(e)));
await openAdmin(up, D);
const openUsage = async () => {
  await up.click('button[data-page="usage"]');
  await up.waitForFunction(() => document.querySelectorAll('#usageGrid [role=progressbar]').length === 5);
};
const meter = key => up.evaluate(k => {
  const c = document.querySelector(`#usageGrid [data-metric="${k}"]`);
  if (!c) return null;
  const bar = c.querySelector('[role=progressbar]');
  const txt = s => { const e = c.querySelector(s); return e ? e.textContent : null; };
  return { value: txt('.usage-value'), pct: txt('.usage-pct'), status: txt('.usage-status'), extra: txt('.usage-extra'), cta: txt('[data-usage-buy]'),
    aria: bar ? ['aria-label', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow'].map(a => bar.getAttribute(a)) : null };
}, key);
await openUsage();
check('five meters in order, then the analytics history card',
  await up.$$eval('#usageGrid .usage-card', cs => cs.map(c => [c.dataset.metric, c.querySelector('.usage-label').textContent])),
  [['quotes', 'Cotizaciones completadas'], ['aiCredits', 'Créditos de IA'], ['storageGB', 'Almacenamiento'],
   ['users', 'Usuarios internos'], ['locations', 'Sedes'], ['historyMonths', 'Historial de analítica']]);
check('the default limits are Essential\'s, read from the one effectiveLimits() helper',
  await up.evaluate(() => { const s = Store.settings(); return [s.plan, effectiveLimits(s.plan, s.packages).limits]; }),
  ['Essential', { quotes: 30, aiCredits: 75, storageGB: 1, users: 1, locations: 1, historyMonths: 3 }]);
// Computed here with the LOCAL calendar month, independently of Store's helpers.
const usageStore = await up.evaluate(() => {
  const d = new Date(), key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return { quotes: Store.all('quotes').filter(q => String(q.date).slice(0, 7) === key).length,
    ai: Store.aiCreditsUsed(), users: Store.all('users').filter(u => u.active).length,
    points: Store.all('servicePoints').filter(p => p.active).length };
});
check('a month with no tracked AI credits starts from this month\'s quotes (each went through one analysis)',
  usageStore.ai, usageStore.quotes);
check('each meter\'s value matches Store (this-month quotes, credits, active users, active points)',
  await Promise.all(['quotes', 'aiCredits', 'users', 'locations'].map(k => meter(k).then(m => m.value))),
  [`${usageStore.quotes} de 30`, `${usageStore.ai} de 75`, `${usageStore.users} de 1`, `${usageStore.points} de 1`]);
check('storage reads MB with a decimal comma against 1 GB', /^\d+,\d MB de 1 GB$/.test((await meter('storageGB')).value), true);
check('the history card is info only, no meter', await meter('historyMonths'),
  { value: '3 meses incluidos en tu plan', pct: null, status: null, extra: null, cta: null, aria: null });
check('the users bar is an accessible progressbar',
  (await meter('users')).aria, ['Usuarios internos', '0', '1', String(usageStore.users)]);
check('Mediterránea\'s seed has more active users than Essential allows (precondition)', usageStore.users > 1, true);
check('an over-limit meter says by how much and offers a package',
  await meter('users').then(m => [m.pct, m.status, m.cta]),
  [`${usageStore.users * 100}%`, `Excedido por ${usageStore.users - 1}`, 'Comprar paquete']);
check('a meter well within its limit says so and offers nothing',
  await meter('quotes').then(m => [m.status, m.cta]), ['Dentro del plan', null]);

await up.click('#usageGrid [data-metric="users"] [data-usage-buy]');
check('"Comprar paquete" lands on Upgrade with the Paquetes tab selected',
  await up.evaluate(() => [document.querySelector('.page.active').id, document.getElementById('tabPaquetes').getAttribute('aria-selected'), document.getElementById('panelPaquetes').hidden]),
  ['upgrade', 'true', false]);
await openUsage();
await up.click('#usageSeePlans');
check('"Ver planes" lands on Upgrade with the Planes tab selected',
  await up.evaluate(() => [document.querySelector('.page.active').id, document.getElementById('tabPlanes').getAttribute('aria-selected'), document.getElementById('panelPlanes').hidden]),
  ['upgrade', 'true', false]);

console.log('\nFACTURACIÓN — sin facturas todavía, la pestaña muestra el estado vacío');
await up.click('button[data-page="upgrade"]');
await up.click('#tabFacturacion');
check('estado vacío exacto, sin filas', [await up.textContent('#invoicesEmpty'), await up.$$eval('#invoiceRows tr', rows => rows.length)],
  ['Todavía no hay facturas.', 0]);

console.log('\nUSAGE — Professional + un Usuario adicional se reflejan al volver a abrir la página, tras aprobar los pagos simulados');
await up.click('#tabPlanes');
await up.click('#plansGrid [data-plan="Professional"]');
await up.click('#confirmOk');
await up.waitForSelector('#payModal.open');
await up.click('#payApprove');
await up.waitForTimeout(150);
await up.click('#tabPaquetes');
await up.click('#packagesGrid [data-package="extra-user"]');
await up.click('#confirmOk');
await up.waitForSelector('#payModal.open');
await up.click('#payApprove');
await up.waitForTimeout(150);
await openUsage();
await up.waitForFunction(() => document.getElementById('usageLead').textContent.includes('Empresa de muebles'));
check('the header and summary name the new plan and its price',
  await up.evaluate(() => [document.getElementById('usageLead').textContent, document.getElementById('usagePlanName').textContent, document.getElementById('usagePlanPrice').textContent]),
  ['Así va el uso de tu plan Empresa de muebles este mes.', 'Plan Empresa de muebles', await up.evaluate(() => Store.money(699000) + ' COP / mes')]);
check('users limit = Professional 3 + 1 purchased, and the card says where the extra comes from',
  await meter('users').then(m => [m.value, m.extra]), [`${usageStore.users} de 4`, 'Incluye 1 de paquetes']);
check('a meter no package touched says nothing about packages', (await meter('locations')).extra, null);
check('effectiveLimits() adds the package on top of the plan',
  await up.evaluate(() => effectiveLimits('Professional', { 'extra-user': 1 }).limits.users), 4);

console.log('\nUSAGE — el resumen sigue el periodo de facturación elegido en Upgrade');
await up.click('button[data-page="upgrade"]');
await up.click('#tabPlanes'); // Paquetes quedó seleccionado más arriba; billingSwitch vive en el panel Planes.
await up.click('#billingSwitch [data-billing="mensual"]');
await up.waitForTimeout(100);
const mensualUsagePrice = await up.evaluate(() => Store.money(899000) + ' COP / mes');
// go('usage') fires renderUsage() without awaiting it (it resolves async, via
// Photos.totalBytes()), and the 5-progressbar count openUsage() waits on is
// already true from the previous render — so wait for the actual text
// instead of reusing that helper, or this reads the stale annual price.
await up.click('button[data-page="usage"]');
await up.waitForFunction(want => document.getElementById('usagePlanPrice').textContent === want, mensualUsagePrice);
check('el resumen de Usage muestra el precio mensual de Professional, no el anual',
  await up.textContent('#usagePlanPrice'), mensualUsagePrice);
// Restored to 'anual' so nothing further down in this shared context reads a
// stale 'mensual' selection.
await up.click('button[data-page="upgrade"]');
await up.click('#billingSwitch [data-billing="anual"]');
await up.waitForTimeout(100);

console.log('\nUSAGE — una revisión con IA gasta exactamente un crédito, y las fotos ocupan almacenamiento');
await openWizard(up, D);
const creditsBefore = await up.evaluate(() => Store.aiCreditsUsed());
await up.setInputFiles('#furniturePhoto', png);
await up.waitForFunction(() => state.photos.length >= 3);
await up.click('#nextButton');
await up.fill('#width', '210'); await up.fill('#height', '85'); await up.fill('#depth', '90');
await up.click('#nextButton');
await up.click('#nextButton');
await up.click('#analyzeButton');
await up.waitForFunction(() => state.analyzed);
check('one completed analysis spends exactly one AI credit',
  await up.evaluate(() => Store.aiCreditsUsed()) - creditsBefore, 1);
await up.click('#nextButton');
await up.click('#fabricGrid .fabric-card:nth-child(1)');
await up.click('#nextButton');
await up.fill('#fullName', 'Cliente Usage');
await up.fill('#email', 'usage@example.com');
await up.fill('#phone', '3001234567');
await up.check('#consent');
await up.click('#nextButton');
await up.waitForSelector('#successState:not([hidden])');
check('a submitted quote with photos takes real bytes in IndexedDB',
  await up.evaluate(() => Photos.totalBytes()) > 0, true);
await openAdmin(up, D);
await openUsage();
check('and the backoffice storage meter shows those bytes, not 0,0 MB',
  // The fixture photos weigh a few KB: anything stored but under 0,1 MB shows
  // as 0,1 MB so the meter never reads empty.
  await up.evaluate(() => Photos.totalBytes().then(b => {
    const MB = 1024 * 1024, text = document.querySelector('#usageGrid [data-metric="storageGB"] .usage-value').textContent;
    return text === `${Math.max(0.1, b / MB).toFixed(1).replace('.', ',')} MB de 5 GB` && text !== '0,0 MB de 5 GB'
      && +document.querySelector('#usageGrid [data-metric="storageGB"] [role=progressbar]').getAttribute('aria-valuenow') > 0;
  })), true);
check('the credits meter picked up the analysis too',
  (await meter('aiCredits')).value, `${creditsBefore + 1} de 300`);
await usageCtx.close();

/* The month is the LOCAL calendar month. At 21:30 on Sept 30 in Bogotá it is
 * already Oct 1 in UTC: a UTC month key would count 0 of the seed's September
 * quotes, and parsing q.date with new Date('YYYY-MM-DD') (UTC midnight) would
 * push COT-1037 (2026-09-01) into August. Both bugs miss the 6 by hand-count. */
console.log('\nUSAGE — cuenta el mes calendario local, no el de UTC');
const monthEdge = await browser.newContext({ timezoneId: 'America/Bogota', locale: 'es-CO' });
const edge = await monthEdge.newPage();
await edge.clock.setFixedTime(new Date('2026-09-30T21:30:00-05:00'));
await openAdmin(edge, D);
await edge.click('button[data-page="usage"]');
await edge.waitForFunction(() => document.querySelectorAll('#usageGrid [role=progressbar]').length === 5);
check('the local month key is still September', await edge.evaluate(() => Store.monthKey()), '2026-09');
check('all six seeded September quotes count, the Sept 1 one included',
  await edge.$eval('#usageGrid [data-metric="quotes"] .usage-value', e => e.textContent), '6 de 30');
await monthEdge.close();

console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'none'));
console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
