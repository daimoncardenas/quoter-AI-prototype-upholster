/* ------------------------------------------------------------------------------------------------
 * LA ATENCIÓN, EN EL ÚLTIMO PASO DE TODAS LAS LÍNEAS
 * El dueño, 20/09: «"punto de atencion"...is another key... and this should be standard in the last
 * step for all lines... with aditional data. of user "En que ciudad te encuentras"....and another
 * "para que ciudad es el servicio"...and finally "cual sede eliges"».
 *
 * «Punto de atención» vivía en Preferencias —paso que tres líneas no tienen— y se ofrecía solo. Ahora
 * el bloque vive en el paso del contacto (CONTACT), que todas las líneas tienen, con las tres
 * preguntas: ciudad del cliente, ciudad del servicio y sede. Las ciudades salen de las sedes activas
 * del cliente (`Store.activeServicePoints()`), sin inventar ninguna, y cada campo de ciudad ofrece
 * «Otra ciudad…» con su texto. Detalle y porqué: docs/punto-de-atencion.md.
 * --------------------------------------------------------------------------------------------- */
import { chromium } from 'playwright';
const D = 'file://' + process.cwd() + '/generated/';
let fails = 0;
const check = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)); };

const browser = await chromium.launch();
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto(D + 'index.html');
await page.evaluate(() => localStorage.clear());
await page.goto(D + 'index.html');
await page.waitForTimeout(700);

const TRES = ['1', '2', '3'].map(n => new URL(`./fixture-sofa-${n}.png`, import.meta.url).pathname);
/* Caminar hasta el último paso respondiendo lo que cada paso pida, como una persona. */
const alUltimoPaso = async () => {
  await page.setInputFiles('#furniturePhoto', TRES);
  await page.waitForFunction(() => state.photos.length >= 3);
  for (let i = 0; i < 9; i++) {
    const paso = await page.evaluate(() => { const p = document.querySelector('.wizard-step.active'); return p ? (p.dataset.brain || p.dataset.ask) : null; });
    if (paso === 'CONTACT') return true;
    if (paso === 'REVIEW') { await page.click('#analyzeButton').catch(() => {}); await page.waitForTimeout(1800); }
    await page.evaluate(() => { const p = document.querySelector('.wizard-step.active');
      p.querySelectorAll('.chip-grid label:first-child input').forEach(x => { if (!x.checked) x.click(); });
      /* Las medidas, en el medio de lo que el cotizador considera habitual para el mueble activo:
       * fuera de rango, el paso no deja pasar (y la caminata se queda ahí). */
      const r = (ACI.context().measurements || {}).ranges || {};
      /* Las claves de los rangos llegan con su prefijo («measurements.width»): se busca por sufijo. */
      const medio = k => { const e = Object.entries(r).find(([key]) => key.endsWith(k));
        return e ? Math.round((e[1][0] + e[1][1]) / 2) : 200; };
      const nums = [...p.querySelectorAll('input[type="number"]')].filter(x => x.offsetParent);
      nums.forEach((el, k) => { const v = String(medio(['width', 'height', 'depth'][k] || 'width'));
        if (!el.value) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); } });
      p.querySelectorAll('select').forEach(sel => { if (!sel.value && sel.options.length > 1) sel.selectedIndex = 1; }); });
    await page.waitForTimeout(260);
    await page.click('#nextButton').catch(() => {});
    await page.waitForTimeout(700);
  }
  return false;
};

const CIUDADES = await page.evaluate(() => [...new Set(Store.activeServicePoints().map(p => p.city))].sort());
check('las sedes activas del cliente traen sus ciudades (es de ahí de donde salen las opciones)',
  [CIUDADES.length > 0, CIUDADES.every(c => typeof c === 'string' && c.trim().length)], [true, true]);

console.log('\nEL BLOQUE VIVE EN EL ÚLTIMO PASO — Y AHÍ ESTÁ EN LAS OCHO LÍNEAS');
const lineas = await page.$$eval('#serviceGrid .service-choice', els => els.map(e => e.querySelector('b').textContent.trim()));
check('el catálogo trae las ocho líneas', lineas.length, 8);
for (const nombre of lineas) {
  await page.evaluate(n => { const c = [...document.querySelectorAll('#serviceGrid .service-choice')].find(x => x.textContent.includes(n)); if (c) c.click(); }, nombre);
  await page.waitForTimeout(280);
  const leido = await page.evaluate(() => {
    const caja = document.getElementById('atencionField');
    return { enContacto: !!caja.closest('[data-brain="CONTACT"]'),
      enPreferencias: !!caja.closest('[data-brain="PREFERENCES"]'),
      peguntas: [...caja.querySelectorAll('label')].map(l => l.textContent.trim()),
      ciudades: [...document.getElementById('customerCity').options].map(o => o.textContent.trim()),
      sedes: [...document.getElementById('city').options].map(o => o.textContent.trim()) };
  });
  check(`«${nombre}»: el bloque de atención está en el último paso (y no en Preferencias)`,
    [leido.enContacto, leido.enPreferencias], [true, false]);
  check(`«${nombre}»: pregunta las tres cosas`,
    leido.peguntas.filter(t => /ciudad te encuentras/i.test(t)).length === 1 &&
    leido.peguntas.filter(t => /ciudad es el servicio/i.test(t)).length === 1 &&
    leido.peguntas.filter(t => /sede eliges/i.test(t)).length === 1, true);
  check(`«${nombre}»: las ciudades que ofrece son las de sus sedes (y ofrece «Otra ciudad…»)`,
    [leido.ciudades.includes('Otra ciudad…'), CIUDADES.every(c => leido.ciudades.includes(c))], [true, true]);
}

console.log('\n«OTRA CIUDAD…» REVELA EL TEXTO Y ES LO QUE SE DECLARA');
await page.evaluate(() => { const c = [...document.querySelectorAll('#serviceGrid .service-choice')].find(x => /Suministro/.test(x.textContent)); if (c) c.click(); });
await page.waitForTimeout(300);
const ciudadPropia = await page.evaluate(() => {
  const sel = document.getElementById('customerCity');
  sel.value = '__otra__';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  const texto = document.getElementById('customerCityOther');
  const visible = !document.getElementById('customerCityOtherField').hidden;
  texto.value = 'Pereira'; texto.dispatchEvent(new Event('input', { bubbles: true }));
  return { visible, declarado: (ACI.context().location || {}).customerCity };
});
check('elegir «Otra ciudad…» abre el campo y lo escrito es lo declarado',
  [ciudadPropia.visible, ciudadPropia.declarado], [true, 'Pereira']);

console.log('\nSIN LOS TRES CAMPOS NO SE CIERRA — Y LO DICE ELLA');
const enElUltimo = await alUltimoPaso();
check('la caminata llega al último paso (Tu pre-cotización)', enElUltimo, true);
await page.evaluate(() => {
  const sel = document.getElementById('customerCity');
  sel.selectedIndex = 0;            // vuelve al marcador de «elige»
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  for (const id of ['fullName', 'email', 'phone']) document.getElementById(id).value =
    id === 'fullName' ? 'Cliente Prueba' : id === 'email' ? 'cliente@example.com' : '3001234567';
  document.getElementById('consent').checked = true;
  document.getElementById('city').selectedIndex = 1;
});
const dicho = await page.evaluate(() => {
  const antes = state.step;
  document.getElementById('nextButton').click();
  return { antes, despues: state.step, burbuja: (document.querySelector('#assistantBubble .bubble-text') || {}).textContent || null,
    foco: document.activeElement.id };
});
check('sin ciudad del cliente no avanza, y su burbuja lo dice',
  [dicho.despues === dicho.antes, dicho.foco, /ciudad/i.test(dicho.burbuja || '')], [true, 'customerCity', true]);

console.log('\nANTES DE DECLARARLA NO EXISTE (EL PASO DE LA REVISIÓN VA ANTES)');
/* El dueño lo vio en su captura: la revisión enseñaba «SEDE · Medellín · El Poblado» —el primero de
 * sus puntos, elegido por defecto— como si el cliente lo hubiera declarado. Doce pasos antes. */
await page.goto(D + 'index.html');
await page.evaluate(() => Store.saveSettings({ plan: 'Business', disabledLines: [] }));
await page.goto(D + 'index.html');
await page.waitForTimeout(500);
await page.click('#serviceGrid .service-choice:has-text("Suministro de tela")');
await page.waitForTimeout(350);
const sinDeclarar = await page.evaluate(() => {
  const filas = declaredRows().map(r => r[0]);
  const l = ACI.context().location;
  return { filasAtencion: ['Ciudad del cliente', 'Ciudad del servicio', 'Sede'].filter(f => filas.includes(f)),
    contexto: [l.customerCity, l.serviceCity, l.servicePoint, l.declared] };
});
check('recién elegida la línea, la atención no está declarada ni aparece en las filas',
  [sinDeclarar.filasAtencion, sinDeclarar.contexto], [[], [null, null, null, false]]);

console.log('\nEL CONTEXTO Y EL RESUMEN LOS LLEVAN');
await page.evaluate(() => {
  const sel = document.getElementById('customerCity');
  const opcion = [...sel.options].find(o => o.value && o.value !== '__otra__');
  sel.value = opcion.value; sel.dispatchEvent(new Event('change', { bubbles: true }));
  const dos = document.getElementById('serviceCity');
  dos.value = opcion.value; dos.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(250);
const enTodo = await page.evaluate(() => {
  const l = ACI.context().location || {};
  const filas = declaredRows().map(r => r[0]);
  return { cliente: l.customerCity, servicio: l.serviceCity, sede: l.servicePoint ? l.servicePoint.name : null,
    filas: ['Ciudad del cliente', 'Ciudad del servicio', 'Sede'].map(f => filas.includes(f)) };
});
check('el contexto declara las tres, por su nombre',
  [!!enTodo.cliente, enTodo.cliente === enTodo.servicio, enTodo.filas], [true, true, [true, true, true]]);
check('y una vez declarada, el contexto lo dice', await page.evaluate(() => ACI.context().location.declared), true);

console.log('\nCAMBIAR DE LÍNEA NO LOS BORRA (SON DE LA PERSONA, NO DEL PROYECTO)');
const antesCambio = await page.evaluate(() => ({ c: document.getElementById('customerCity').value, s: document.getElementById('serviceCity').value }));
await page.evaluate(() => { const c = [...document.querySelectorAll('#serviceGrid .service-choice')].find(x => /Mantenimiento/.test(x.textContent)); if (c) c.click(); });
await page.waitForTimeout(400);
const despuesCambio = await page.evaluate(() => ({ c: document.getElementById('customerCity').value, s: document.getElementById('serviceCity').value,
  l: ACI.context().location }));
check('la ciudad y la sede siguen ahí tras cambiar de línea',
  [despuesCambio.c === antesCambio.c, despuesCambio.s === antesCambio.s, !!despuesCambio.l], [true, true, true]);

console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'none'));
console.log(fails ? `\n${fails} FALLAN` : '\nTODO PASA');
await browser.close();
process.exit(fails ? 1 : 0);
