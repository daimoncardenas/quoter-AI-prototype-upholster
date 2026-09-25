/* E2E DESDE LA INTERFAZ DE USUARIO — un recorrido por línea, contrarreloj.
 *
 * Un cliente no sabe de `data-step`, ni de `#priceRange`, ni de `state`: sabe de lo que LEE. Aquí todo
 * se busca por ROL, RÓTULO, PLACEHOLDER o TEXTO VISIBLE —lo que anunciaría un lector de pantalla—, las
 * fotos entran por el diálogo de archivos del navegador, cada paso deja una captura y la bitácora sale
 * EN VIVO con los segundos al lado. Cuando un paso no avanza, se lee lo que la pantalla dice.
 *
 * Presupuesto: una línea ≈ 1 minuto. Si se pasa, el sospechoso es este guion, no la app.
 *
 * Uso:  node tools/e2e-lineas.mjs             (las dos líneas)
 *       node tools/e2e-lineas.mjs retapizado  (una sola)
 *       node tools/e2e-lineas.mjs tapiceria
 */
import { chromium } from 'playwright';

const D = process.env.E2E_URL || 'http://127.0.0.1:3000/';
const FOTOS = [1, 2, 3].map(n => new URL(`../tests/fixture-sofa-${n}.png`, import.meta.url).pathname);
const CUAL = process.argv[2] || 'todas';

const navegador = await chromium.launch();
const errores = [];

async function correrLinea({ motivo, nombre, piezas }) {
  const t0 = Date.now();
  const ctx = await navegador.newContext({ viewport: { width: 1500, height: 950 } });
  /* La corrida se marca a sí misma: la solicitud que nazca aquí viaja con `source: "e2e"` (regla 5 de
   * docs/base-de-datos.md) y en el backoffice no se confunde con un cliente real. */
  await ctx.addInitScript(() => { window.__E2E__ = true; });
  const p = await ctx.newPage();
  p.on('pageerror', e => errores.push(`${nombre}: ${String(e.message).slice(0, 90)}`));

  const seg = () => String(((Date.now() - t0) / 1000).toFixed(0)).padStart(3, '0') + 's';
  const anota = x => console.log(`  ${seg()} · ${x}`);
  const texto = async lo => (await lo.textContent().catch(() => '')).replace(/\s+/g, ' ').trim();
  const titulo = () => texto(p.locator('.wizard-step.active h2').first());
  const paso = p.locator('.wizard-step.active');
  const cta = () => p.getByRole('button', { name: /^(continuar|enviar)/i }).first();
  const aLaVista = async re => {
    const l = p.getByText(re);
    for (let i = 0; i < await l.count(); i++) { const n = l.nth(i); if (await n.isVisible().catch(() => false)) return n; }
    return null;
  };
  const precio = async () => {
    const l = p.getByText(/^\$\s?[\d.]+\s?–\s?\$\s?[\d.]+$/);
    for (let i = 0; i < await l.count(); i++) { const n = l.nth(i); if (await n.isVisible().catch(() => false)) return texto(n); }
    return '';
  };

  console.log(`\n=== ${nombre} ===`);
  await p.goto(D + 'index.html');
  await p.getByText(motivo, { exact: false }).first().click();       // la tarjeta del motivo
  await cta().click();
  await p.waitForTimeout(250);

  /* ── LAS FILAS: mueble, cantidad, tapizar y medidas por su nombre accesible; las fotos por el diálogo. */
  if (piezas.length && await p.getByRole('combobox', { name: /^Mueble de la pieza/i }).first().isVisible().catch(() => false)) {
    for (let i = 0; i < piezas.length; i++) {
      const n = i + 1;
      if (i) { await p.getByRole('button', { name: /agregar otra pieza/i }).click(); await p.waitForTimeout(150); }
      await p.getByRole('combobox', { name: new RegExp(`^Mueble de la pieza ${n}`, 'i') }).selectOption(piezas[i].mueble);
      if (piezas[i].cantidad) await p.getByRole('combobox', { name: new RegExp(`piezas ${n}`, 'i') }).selectOption(piezas[i].cantidad).catch(() => {});
      if (piezas[i].tapizar) await p.getByRole('combobox', { name: new RegExp(`tapiza en la pieza ${n}`, 'i') }).selectOption(piezas[i].tapizar).catch(() => {});
      for (const [rot, val] of [['Ancho', piezas[i].medidas.width], ['Alto', piezas[i].medidas.height], ['Largo', piezas[i].medidas.depth]])
        await p.getByRole('spinbutton', { name: new RegExp(`^${rot} de la pieza ${n}`, 'i') }).fill(String(val)).catch(() => {});
      const [d] = await Promise.all([
        p.waitForEvent('filechooser').catch(() => null),
        p.getByRole('button', { name: new RegExp(`fotos de la pieza ${n}`, 'i') }).click().catch(() => {})
      ]);
      if (d) await d.setFiles(FOTOS.slice(0, 2)); else anota(`FALTA: el «+» de fotos de la fila ${n} no abrió el diálogo`);
      anota(`fila ${n}: ` + (await p.locator('.pieza-fila').nth(i).locator('select, input').evaluateAll(xs => xs.map(x => x.value || '—').join(' · '))));
    }
  }

  /* ── EL RECORRIDO: se lee el titular, se hace lo que el paso pida y se avanza hasta que CAMBIE. ─── */
  for (let vuelta = 0; vuelta < 16; vuelta++) {
    const t = await titulo();
    if (!t) break;
    if (await aLaVista(/solicitud recibida/i)) break;
    const cifra = await precio();
    anota(`paso · «${t}»${cifra ? ' · en pantalla: ' + cifra : ''}`);
    await p.screenshot({ path: `generated/e2e-${nombre}/paso-${String(vuelta).padStart(2, '0')}.png` });

    /* las fotos que la línea pida (el botón visible del bloque de subida) */
    for (const boton of await p.getByRole('button', { name: /seleccionar fotos/i }).all()) {
      if (!(await boton.isVisible().catch(() => false))) continue;
      const [f] = await Promise.all([p.waitForEvent('filechooser').catch(() => null), boton.click().catch(() => {})]);
      if (f) await f.setFiles(FOTOS);
    }
    /* las casillas de medidas del paso, por su rótulo, si están vacías */
    for (const rot of [/^Ancho/i, /^Alto/i, /^Largo/i]) {
      const casilla = paso.getByLabel(rot).first();
      if (await casilla.count().catch(() => 0) && await casilla.isVisible().catch(() => false) && !(await casilla.inputValue().catch(() => '')))
        await casilla.fill(/Alto/i.test(rot.source) ? '240' : '300').catch(() => {});
    }
    /* una opción del paso (chip o tarjeta) si no hay ninguna elegida */
    if (!(await paso.locator('[aria-pressed="true"], input:checked').first().count().catch(() => 0))) {
      const opciones = p.locator('.chip-grid label, .service-choice');
      for (let k = 0; k < await opciones.count(); k++) {
        if (await opciones.nth(k).isVisible().catch(() => false)) { await opciones.nth(k).click().catch(() => {}); break; }
      }
    }
    /* la lista de telas de un ask: la primera referencia y su cantidad */
    const refs = p.getByLabel(/referencia/i);
    for (let k = 0; k < await refs.count(); k++) {
      const ref = refs.nth(k);
      if (!(await ref.isVisible().catch(() => false))) continue;
      const opciones = await ref.locator('option').evaluateAll(o => o.map(x => x.value).filter(Boolean));
      if (opciones[0]) await ref.selectOption(opciones[0]).catch(() => {});
      const cant = p.getByLabel(/cantidad/i).first();
      if (await cant.count().catch(() => 0) && await cant.isVisible().catch(() => false) && !(await cant.inputValue().catch(() => ''))) await cant.fill('3').catch(() => {});
      break;
    }
    /* la revisión: se pulsa su botón y se espera a que los chequeos aparezcan */
    const analizar = p.getByRole('button', { name: /revisar|analizar|mirada/i }).first();
    if (await analizar.isVisible().catch(() => false)) {
      await analizar.click().catch(() => {});
      const llego = await p.locator('.analysis-checks > *').first().waitFor({ timeout: 6000 }).then(() => true).catch(() => false);
      anota('revisión: ' + (llego ? 'los chequeos aparecieron' : 'no aparecieron'));
    }
    /* la tela: la primera tarjeta de telas a la vista */
    const telas = p.locator('.fabric-card');
    for (let k = 0; k < await telas.count(); k++) {
      const tarjeta = telas.nth(k);
      if (!(await tarjeta.isVisible().catch(() => false))) continue;
      await tarjeta.click().catch(() => {});
      anota('tela: ' + (await texto(tarjeta)).slice(0, 40));
      break;
    }
    /* EL CIERRE: nombre, correo y celular por su PLACEHOLDER (lo que lee el cliente), sedes y permiso. */
    const campoNombre = paso.getByPlaceholder(/escribe tu nombre/i).first();
    if (await campoNombre.count().catch(() => 0) && await campoNombre.isVisible().catch(() => false)) {
      await campoNombre.fill('Cliente E2E').catch(() => {});
      await paso.getByPlaceholder(/nombre@correo/i).first().fill('e2e@example.com').catch(() => {});
      await paso.getByPlaceholder(/300 123 4567/i).first().fill('3001112233').catch(() => {});
      const llenados = [];
      for (const sel of await paso.locator('select').all()) {
        if (!(await sel.isVisible().catch(() => false))) continue;
        const vals = await sel.locator('option').evaluateAll(o => o.map(x => x.value).filter(v => v && v !== '__otra__')).catch(() => []);
        if (vals[0] && !(await sel.inputValue().catch(() => ''))) await sel.selectOption(vals[0]).catch(() => {});
        llenados.push(`«${(await sel.inputValue().catch(() => '')) || 'vacío'}»`);
      }
      await paso.getByRole('checkbox').first().check().catch(() => {});
      anota('cierre: nombre, correo, celular, desplegables ' + llenados.join(' ') + ' y el permiso');
    }

    /* ── avanzar: se pulsa y se espera a que el TITULAR cambie (nada de dormir a ojo) ── */
    const antes = t;
    await cta().click();
    for (let e = 0; e < 20; e++) {
      await p.waitForTimeout(200);
      if (await aLaVista(/solicitud recibida/i)) break;
      if (await titulo() !== antes) break;
    }
    if (await aLaVista(/solicitud recibida/i)) break;
    if (await titulo() === antes) {
      const dice = (await texto(p.getByRole('status').first())) || (await texto(p.getByText(/falta|necesito|agrega|elige|revisa/i).first()));
      anota(`⛔ se quedó en «${antes}» · en pantalla: «${(dice || 'nada: ni aviso ni burbuja').slice(0, 150)}»`);
      break;
    }
  }

  const recibida = await aLaVista(/solicitud recibida/i);
  const radicado = (await texto(p.locator('.success-state'))).match(/COT-\d+/)?.[0] || '';
  anota(`CIERRE: ${recibida ? 'pantalla de solicitud recibida' : 'NO llegó'}${radicado ? ' · ' + radicado : ''}`);
  await p.screenshot({ path: `generated/e2e-${nombre}/paso-final.png` });

  /* ── EL BACKOFFICE, EN EL MISMO NAVEGADOR: como un asesor, se abre el detalle de la primera fila. ── */
  const { openAdmin } = await import('../tests/helpers.mjs');
  await openAdmin(p, D);
  await p.waitForTimeout(900);
  /* Como un asesor: primero la vista de Cotizaciones, luego la fila de esta corrida y su «⋯». */
  for (const etiqueta of [/cotizaciones/i, /ver solicitudes/i]) {
    for (const b of await p.getByRole('link', { name: etiqueta }).all()) if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); break; }
    for (const b of await p.getByRole('button', { name: etiqueta }).all()) if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); break; }
  }
  await p.waitForTimeout(700);
  const todas = p.locator('table tbody tr');
  let laFila = null, cuantas = 0;
  for (let i = 0; i < await todas.count().catch(() => 0); i++) {
    const f = todas.nth(i);
    if (!(await f.isVisible().catch(() => false))) continue;
    cuantas++;
    if (/Cliente E2E/i.test(await texto(f))) laFila = f;
  }
  anota(`backoffice · cotizaciones a la vista: ${cuantas}`);
  if (laFila) {
    anota('backoffice · fila de esta corrida: ' + (await texto(laFila)).slice(0, 170));
    await laFila.hover().catch(() => {});
    await p.waitForTimeout(300);
    const abrir = laFila.getByRole('button', { name: /detalle/i }).last();
    if (await abrir.count().catch(() => 0)) {
      await abrir.click({ timeout: 4000 }).catch(() => {});
      for (let e = 0; e < 30; e++) { await p.waitForTimeout(200); if ((await texto(p.locator('#quoteDetail'))).length > 40) break; }
    }
    await p.screenshot({ path: `generated/e2e-${nombre}/backoffice-detalle.png`, fullPage: true });
    const detalle = await texto(p.locator('#quoteDetail'));
    anota('backoffice · ¿abrió el detalle? ' + (detalle.length > 40 ? 'sí' : 'no'));
    anota('backoffice · detalle: ' + detalle.slice(0, 420));
    for (const f of await p.locator('#quoteDetail table tr').allTextContents().catch(() => []))
      anota('backoffice · fila: ' + f.replace(/\s+/g, ' ').trim().slice(0, 150));
  } else {
    anota('backoffice · FALTA: la fila de esta corrida no está a la vista en Cotizaciones');
  }
  anota(`tiempo de la línea: ${seg()} de reloj (presupuesto: 60 s)`);
  await ctx.close();
}

try {
  if (CUAL === 'todas' || CUAL === 'retapizado')
    await correrLinea({
      motivo: 'Retapizado de muebles', nombre: 'retapizado',
      piezas: [
        { mueble: 'Sofá en L', cantidad: '1', tapizar: 'complete', medidas: { width: 260, height: 85, depth: 170 } },
        { mueble: 'Poltrona', cantidad: '2', tapizar: 'seats', medidas: { width: 95, height: 95, depth: 85 } }
      ]
    });
  if (CUAL === 'todas' || CUAL === 'tapiceria')
    await correrLinea({ motivo: 'Tapicería arquitectónica', nombre: 'tapiceria', piezas: [] });
} finally {
  console.log('\nerrores de página:', errores.length ? errores : 'ninguno');
  await navegador.close();
}
