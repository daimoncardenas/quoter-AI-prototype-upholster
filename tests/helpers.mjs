import { ADMIN_EMAIL, DEMO_PASSWORD } from './client.mjs';

/* The backoffice now sits behind a login, so tests have to sign in first. */
/* Abre el cotizador y elige la primera línea si el plan ofrece más de una: el paso de la línea
 * es el primero y su "Continuar" está deshabilitado hasta elegir. Deja el wizard en el paso 1
 * (Tu mueble), que es donde arrancan todas las suites que recorren el formulario. Un solo lugar
 * para esa mecánica: las suites no repiten el gesto. */
export async function openWizard(page, D) {
  await page.goto(D + 'index.html');
  if (await page.isVisible('#serviceGrid .service-choice')) {
    await page.click('#serviceGrid .service-choice');
    await page.click('#nextButton');
  }
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
