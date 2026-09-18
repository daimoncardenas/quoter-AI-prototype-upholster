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
