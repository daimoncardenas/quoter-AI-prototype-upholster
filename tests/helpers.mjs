import { ADMIN_EMAIL, DEMO_PASSWORD } from './client.mjs';

/* The backoffice now sits behind a login, so tests have to sign in first. */
/* Abre el cotizador y elige la primera línea si el plan ofrece más de una: el paso de la línea
 * es el primero y su "Continuar" está deshabilitado hasta elegir. Deja el wizard en el paso 1
 * (Tu mueble), que es donde arrancan todas las suites que recorren el formulario. Un solo lugar
 * para esa mecánica: las suites no repiten el gesto. */
/* La línea puede traer CAMINOS (docs/flujo-de-suministro.md, diagrama del dueño): qué quieres hacer
 * → para qué → qué sabes. El recorrido COMPLETO —«mi mueble o proyecto personal» + «no tengo claro
 * ninguna de las dos»— es el de siempre (mueble, medidas, preferencias, validación, recomendación) y
 * es donde arrancan las suites que recorren el formulario. El que quiera otro camino lo elige él
 * (tests/ruta-*.spec). */
export async function elegirElRecorridoCompleto(page) {
  if (!await page.isVisible('.wizard-step[data-step="18"].active')) return false;
  await page.click('#routeGrid .service-choice:has-text("Nueva compra")');
  await continuar(page);
  await page.click('#purposeGrid .service-choice:has-text("Mi mueble o proyecto personal")');
  await continuar(page);
  await page.click('#saberGrid .service-choice:has-text("No tengo claro ninguna de las dos")');
  await continuar(page);
  return true;
}

/* «Continuar» como lo haría una persona: el mueble ya no viene marcado por defecto (dueño, 25/09:
 * «no you need put without select default»), así que si su paso está a la vista y nadie eligió, se
 * elige el primer mueble de la lista antes de avanzar — o el paso no deja pasar. */
export async function continuar(page) {
  if (await page.isVisible('.wizard-step.active .piezas-lista')) await elegirPrimerMueble(page);
  await page.click('#nextButton');
}

/* ELEGIR EL MUEBLE — la lista del paso 1 trae un desplegable por pieza (dueño, 25/09: «I prefer list
 * and dropdown for each select... because the first part is waste space»; ya no hay rejilla de tarjetas).
 * `elegirMueble` deja el mueble en la pieza que se diga (la primera por defecto) y devuelve su nombre;
 * `elegirMueblePorIndice` usa la posición en el catálogo, como los `nth-child` de las pruebas viejas;
 * `elegirPrimerMueble` es «el primero de la lista» y NUNCA pisa un mueble ya elegido. */
export async function elegirMueble(page, nombre, pieza = 0) {
  const sel = `.piezas-lista .pieza-fila:nth-child(${pieza + 1}) .pieza-mueble`;
  await page.selectOption(sel, nombre);
  await page.waitForTimeout(140);
  return nombre;
}
export async function elegirMueblePorIndice(page, i, pieza = 0) {
  const sel = `.piezas-lista .pieza-fila:nth-child(${pieza + 1}) .pieza-mueble`;
  const nombres = await page.$$eval(`${sel} option`, os => os.map(o => o.value).filter(Boolean));
  return elegirMueble(page, nombres[i], pieza);
}
export async function elegirPrimerMueble(page, pieza = 0) {
  const sel = `.piezas-lista .pieza-fila:nth-child(${pieza + 1}) .pieza-mueble`;
  const actual = await page.$eval(sel, s => s.value).catch(() => '');
  if (actual) return actual;
  return elegirMueblePorIndice(page, 0, pieza);
}

export async function openWizard(page, D) {
  await page.goto(D + 'index.html');
  if (await page.isVisible('#serviceGrid .service-choice')) {
    await page.click('#serviceGrid .service-choice');
    await page.click('#nextButton');
  }
  /* El mueble ya no viene marcado por defecto (dueño, 25/09: «no you need put without select
   * default»): se elige como lo haría una persona, o el paso no deja avanzar. */
  if (await page.isVisible('.wizard-step.active .piezas-lista')) await elegirPrimerMueble(page);
  await elegirElRecorridoCompleto(page);
  /* Y SE ELIGE OTRA VEZ AL FINAL: con una línea que trae CAMINOS, el paso del mueble (1) llega DESPUÉS
   * de los caminos (18/22/23) — la primera elección caía en un paso que todavía no estaba a la vista, y
   * el wizard quedaba parado en su paso 1 sin mueble (medido: `wizard.spec` se caía en `reach(3)` con
   * `measurements.ranges` en null porque no había mueble activo). */
  if (await page.isVisible('.wizard-step.active .piezas-lista')) await elegirPrimerMueble(page);
}

export async function openAdmin(page, D, email = ADMIN_EMAIL) {
  await page.goto(D + 'admin.html');
  if (await page.isVisible('#loginScreen')) {
    await page.fill('#loginEmail', email);
    await page.fill('#loginPassword', DEMO_PASSWORD);
    await page.click('#loginSubmit');
    await page.waitForSelector('#appShell:not([hidden])');
  }
  return page;
}

/* Los campos de lista del backoffice son etiquetas, no texto separado por comas.
 * Para dejar una lista EXACTA hay que quitar las que están y escribir las nuevas;
 * escribir sin más agrega, que es justo lo que un page.fill() ya no hace. */
export async function setTags(page, selector, values) {
  const quitar = page.locator(`${selector} .tag button`);
  while (await quitar.count()) await quitar.first().click();
  await page.click(`${selector} input`);
  // La coma final confirma la última etiqueta.
  if (values.length) await page.keyboard.type(values.join(',') + ',');
}

/* La sede («¿Cuál sede eliges?», antes «Punto de atención») vive en el último paso desde
 * docs/punto-de-atencion.md: se elige por el DOM —por su id o por su nombre— porque el paso de
 * Preferencias ya no la tiene a la vista. Devuelve el id elegido, o null si no existe. */
export async function elegirSede(page, cual) {
  return page.evaluate(c => {
    const s = document.getElementById('city');
    if (!s) return null;
    const o = [...s.options].find(x => x.value === c) || [...s.options].find(x => x.textContent.trim() === c);
    if (!o) return null;
    s.value = o.value;
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return o.value;
  }, cual);
}
/* La atención (ciudad del cliente, ciudad del servicio y sede) es requerida en el último paso desde
 * docs/punto-de-atencion.md: cualquier spec que cierre una solicitud tiene que declararla. Por
 * defecto toma la primera ciudad y la primera sede de los datos del cliente; `opts.city` elige la
 * sede por su id o por su nombre (es lo que usaban los flujos que enviaban con un punto concreto). */
export async function elegirAtencion(page, opts = {}) {
  return page.evaluate(o => {
    const elige = (sel, valor) => { if (!sel) return null;
      const pedido = valor !== undefined && valor !== null;
      if (!pedido && sel.value && sel.value !== '__otra__') return sel.value;   // lo ya declarado no se pisa
      const o2 = (pedido ? ([...sel.options].find(x => x.value === valor) || [...sel.options].find(x => x.textContent.trim() === valor)) : null)
        || [...sel.options].find(x => x.value && x.value !== '__otra__');
      if (o2) { sel.value = o2.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      return sel.value || null; };
    return { customerCity: elige(document.getElementById('customerCity'), o.customerCity),
      serviceCity: elige(document.getElementById('serviceCity'), o.serviceCity),
      sede: elige(document.getElementById('city'), o.city) };
  }, opts);
}
