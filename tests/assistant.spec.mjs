/* "Presencia del asistente": the backoffice section that configures the 3D
 * assistant the cotizador shows (store.js Store.assistant / saveAssistant /
 * Assistant.apply, assistant-presence.js). Proves the loop without depending on
 * pixels or on WebGL being available: the section is admin-only, what the admin
 * saves is exactly what the cotizador paints (name in the chat header and in the
 * character's and "Preguntar"'s accessible names, on/off), turning it off removes
 * the presence only (no character layer, no "Preguntar", no chat, neutral copy,
 * AI analysis card still there), turning it back on restores it, the reset
 * restores the pack defaults, and a pack with a bad `assistant` block is rejected.
 * Written against whichever pack generated/ holds: defaults are read from
 * tests/client.mjs, never hardcoded. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { client, slug, userEmail } from './client.mjs';
import { openAdmin, openWizard, elegirMueble, elegirMueblePorIndice, elegirPrimerMueble } from './helpers.mjs';
import { validateAssistant } from '../tools/client-pack.mjs';

const D = 'file://' + process.cwd() + '/generated/';
const KEY = client.storageNamespace + 'assistant';
const DEF = client.assistant;
// Las mismas fotos reales del repo que usa photos.spec.mjs (no una caché fuera del proyecto).
const TRES = ['1', '2', '3'].map(n => new URL(`./fixture-sofa-${n}.png`, import.meta.url).pathname);

let fails = 0;
const check = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
};
// Stored overrides compared by content, not by key insertion order.
const sorted = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
const throws = fn => { try { fn(); return false; } catch (err) { return true; } };

console.log('\nEL PAQUETE DECLARA UN ASISTENTE VÁLIDO Y LA VALIDACIÓN RECHAZA LOS MALOS');
check('el asistente del paquete pasa la validación', throws(() => validateAssistant(DEF, slug)), false);
check('sin bloque assistant falla', throws(() => validateAssistant(undefined, slug)), true);
check('un personaje desconocido falla', throws(() => validateAssistant({ ...DEF, character: 'robot' }, slug)), true);
check('un nombre vacío falla', throws(() => validateAssistant({ ...DEF, name: '' }, slug)), true);
check('un nombre con espacios alrededor falla', throws(() => validateAssistant({ ...DEF, name: ' Lía ' }, slug)), true);
check('un nombre de 41 caracteres falla', throws(() => validateAssistant({ ...DEF, name: 'x'.repeat(41) }, slug)), true);
check('enabled que no es booleano falla', throws(() => validateAssistant({ ...DEF, enabled: 'sí' }, slug)), true);
check('brandSuit que no es booleano falla', throws(() => validateAssistant({ ...DEF, brandSuit: 1 }, slug)), true);
/* Y el build que la suite va a abrir tiene que ser EL DEL PAQUETE ACTIVO. `tools/dev.mjs`
 * deja en generated/ el suyo —el de .env— cada vez que alguien edita una plantilla, y una
 * corrida contra el otro paquete compara manzanas con peras: pasa por casualidad (los
 * nombres sugeridos, los usuarios de demo y media configuración son los mismos) y después
 * revienta o falla donde menos se espera (medido: la sección de configuración del asistente
 * termina en "Cannot convert undefined or null to object"). Un segundo aquí ahorra media hora. */
check('generated/ es el build del paquete activo, no el de .env',
  readFileSync('generated/store.js', 'utf8').match(/var NS = '([^']+)'/)?.[1], client.storageNamespace);

const b = await chromium.launch();
const errs = [];
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', e => errs.push(String(e)));
/* El cotizador abre en el paso de la línea cuando el plan habilita más de una (esta suite corre
 * en Professional a propósito). Se elige la primera como haría el cliente y el resto del
 * formulario queda donde siempre: paso 1 = Tu mueble. */
async function gotoWizard(){
  await openWizard(page, D);
}
await page.goto(D + 'admin.html');
await page.evaluate(() => localStorage.clear());

const openAssistant = async () => {
  await openAdmin(page, D);
  await page.click('button[data-page="dashboard"]');
  await page.click('button[data-page="assistant"]');
  await page.waitForSelector('#assistant.active');
};
const save = async () => {
  await page.evaluate(() => document.getElementById('toast').classList.remove('show'));
  await page.click('#saveAssistant');
};
const stored = () => page.evaluate(k => localStorage.getItem(k), KEY);
const form = () => page.evaluate(() => ({
  enabled: document.getElementById('assistantEnabled').getAttribute('aria-checked'),
  character: document.querySelector('input[name="assistantCharacter"]:checked')?.value,
  name: document.getElementById('assistantName').value,
  brandSuit: document.getElementById('assistantBrandSuit').getAttribute('aria-checked')
}));
const wizard = async () => {
  await gotoWizard();
  return page.evaluate(() => ({
    presence: document.documentElement.getAttribute('data-assistant'),
    chatName: document.querySelector('#chatPanel [data-assistant-name]').textContent,
    chatLabel: document.getElementById('chatPanel').getAttribute('aria-label'),
    hitLabel: document.getElementById('assistantHit').getAttribute('aria-label'),
    askLabel: document.querySelector('.help-card [data-open-chat]').getAttribute('aria-label'),
    fabLabel: document.querySelector('.chat-fab').getAttribute('aria-label')
  }));
};
const shown = sel => page.evaluate(s => { const el = document.querySelector(s); return !!el && getComputedStyle(el).display !== 'none' && !el.closest('[hidden]'); }, sel);

console.log('\nLA SECCIÓN ES SOLO DE ADMINISTRACIÓN');
await openAdmin(page, D);
check('"Presencia del asistente" va justo después de "Configuración de estilos"',
  await page.$$eval('.nav button', bs => { const i = bs.findIndex(x => x.dataset.page === 'styles'); return [bs[i + 1].dataset.page, bs[i + 1].lastChild.textContent]; }),
  ['assistant', 'Presencia del asistente']);
check('la administradora la ve', await page.isVisible('button[data-page="assistant"]'), true);
{
  const sellerCtx = await b.newContext();
  const sp = await sellerCtx.newPage();
  sp.on('pageerror', e => errs.push(String(e)));
  await openAdmin(sp, D, userEmail('u-laura'));
  check('una vendedora no ve el botón', await sp.isVisible('button[data-page="assistant"]'), false);
  await sp.evaluate(() => document.querySelector('[data-page="assistant"]').click());
  check('y forzar el clic no abre la página', await sp.evaluate(() => document.getElementById('assistant').classList.contains('active')), false);
  await sellerCtx.close();
}

console.log('\nSIN NADA GUARDADO, EL FORMULARIO Y EL COTIZADOR MUESTRAN EL ASISTENTE DEL PAQUETE');
await openAssistant();
check('el formulario arranca con los valores del paquete', await form(),
  { enabled: String(DEF.enabled), character: DEF.character, name: DEF.name, brandSuit: String(DEF.brandSuit) });
check('no hay nada guardado', await stored(), null);
check('el cotizador pinta el nombre del paquete', await wizard(), {
  presence: DEF.enabled ? 'on' : 'off', chatName: DEF.name, chatLabel: DEF.name,
  hitLabel: `Hablar con ${DEF.name}`, askLabel: `Preguntar a ${DEF.name}`, fabLabel: `Hablar con ${DEF.name}`
});

console.log('\nEN ESSENTIAL LA PRESENCIA NO SE PUEDE CONFIGURAR');
const setPlan = plan => page.evaluate(p => Store.saveSettings({ plan: p }), plan);
const controls = () => page.evaluate(() => ['#assistantEnabled', '#assistantBrandSuit', '#assistantName', '#saveAssistant', '#resetAssistant', 'input[name="assistantCharacter"][value="female"]', 'input[name="assistantCharacter"][value="male"]']
  .map(sel => { const el = document.querySelector(sel); return [el.disabled, el.getAttribute('aria-describedby')]; }));
await openAssistant();
check('el plan por defecto es Essential', await page.evaluate(() => Store.settings().plan), 'Essential');
check('Store dice que no es configurable y desde qué plan', await page.evaluate(() => { const a = Store.assistant(); return [Store.assistantConfigurable(), a.locked, a.requiredPlan]; }), [false, true, 'Professional']);
check('la sección sigue visible para la administradora', await page.isVisible('#assistant .settings-grid'), true);
check('muestra el aviso', await page.isVisible('#assistantLocked'), true);
check('el aviso dice desde qué plan', (await page.textContent('#assistantLockedText')).includes('desde el plan Empresa de muebles'), true);
check('todos los controles están deshabilitados y describidos por el aviso', await controls(), Array(7).fill([true, 'assistantLockedText']));
check('muestra los valores efectivos (los del paquete)', await form(),
  { enabled: String(DEF.enabled), character: DEF.character, name: DEF.name, brandSuit: String(DEF.brandSuit) });
check('Store.saveAssistant se niega en Essential', await page.evaluate(() => { try { Store.saveAssistant({ name: 'Camilo' }); return 'saved'; } catch (e) { return e.message; } }),
  'La presencia del asistente se configura desde el plan Empresa de muebles.');
check('y no guardó nada', await stored(), null);
await page.click('#assistantSeePlans');
check('"Ver planes" lleva a Upgrade, pestaña Planes', await page.evaluate(() => [document.getElementById('upgrade').classList.contains('active'), document.getElementById('tabPlanes').getAttribute('aria-selected')]), [true, 'true']);
// The simulated payment flow writes this same setting; go('assistant') must unlock without a reload.
await setPlan('Professional');
await page.click('button[data-page="assistant"]');
check('al pasar a Professional se desbloquea sin recargar', [await page.isVisible('#assistantLocked'), (await controls()).every(([d]) => d === false)], [false, true]);
check('y el nombre vuelve a describirse con su ayuda', (await controls())[2][1], 'assistantNameHint');

console.log('\nGUARDAR PERSONAJE, NOMBRE Y TRAJE LLEGA AL COTIZADOR (plan Professional)');
await openAssistant();
const other = DEF.character === 'female' ? 'male' : 'female';
const chars = await page.evaluate(() => Store.assistantCharacters());
await page.check(`input[name="assistantCharacter"][value="${other}"]`);
if (DEF.name === chars.find(c => c.id === DEF.character).defaultName) {
  check('cambiar de personaje cambia el nombre sugerido', await page.inputValue('#assistantName'), chars.find(c => c.id === other).defaultName);
}
await page.fill('#assistantName', '');
await save();
check('un nombre vacío no se guarda', await stored(), null);
check('y avisa por qué', await page.isVisible('#assistantNameError'), true);
await page.fill('#assistantName', '  Camilo  ');
await page.click('#assistantBrandSuit');
await save();
await page.waitForFunction(() => document.getElementById('toast').classList.contains('show'));
// El panel se repinta al cambiar personaje o traje: da un instante a que el guardado esté
// escrito antes de leerlo (si no lo está, el diagnóstico de abajo dice exactamente qué pasó).
await page.waitForFunction(k => localStorage.getItem(k) !== null, KEY, { timeout: 5000 }).catch(() => {});
{
  const raw = await stored();
  if (raw === null) console.log('DIAG-NULL', JSON.stringify(await page.evaluate(() => ({
    url: location.pathname,
    llaves: Object.keys(localStorage),
    nombreEnElCampo: document.getElementById('assistantName').value,
    errorVisible: !document.getElementById('assistantNameError').hidden,
    toastVisible: document.getElementById('toast').classList.contains('show'),
    toastTexto: document.getElementById('toast').textContent.trim()
  }))));
  check('guarda solo lo que cambió, con el nombre recortado', raw ? sorted(JSON.parse(raw)) : null,
    sorted({ character: other, name: 'Camilo', brandSuit: !DEF.brandSuit }));
}
check('Store.assistant() lo refleja', await page.evaluate(() => { const a = Store.assistant(); return [a.character, a.name, a.brandSuit]; }),
  [other, 'Camilo', !DEF.brandSuit]);
await openAssistant();
check('sobrevive a recargar el backoffice', await form(),
  { enabled: String(DEF.enabled), character: other, name: 'Camilo', brandSuit: String(!DEF.brandSuit) });
check('el cotizador usa el nombre guardado en el chat, el personaje y "Preguntar"', await wizard(), {
  presence: 'on', chatName: 'Camilo', chatLabel: 'Camilo',
  hitLabel: 'Hablar con Camilo', askLabel: 'Preguntar a Camilo', fabLabel: 'Hablar con Camilo'
});
check('un nombre con HTML se pinta como texto', await page.evaluate(() => {
  Store.saveAssistant({ name: '<b>Sara</b>' }); Assistant.apply();
  return [document.querySelector('#chatPanel [data-assistant-name]').textContent, document.querySelectorAll('#chatPanel [data-assistant-name] b').length];
}), ['<b>Sara</b>', 0]);
check('Store rechaza un personaje desconocido', await page.evaluate(() => { try { Store.saveAssistant({ character: 'robot' }); return false; } catch (e) { return true; } }), true);
check('y un nombre de más de 40 caracteres', await page.evaluate(() => { try { Store.saveAssistant({ name: 'x'.repeat(41) }); return false; } catch (e) { return true; } }), true);
await page.evaluate(() => Store.saveAssistant({ name: 'Camilo' }));

console.log('\nBAJAR A ESSENTIAL IGNORA LO GUARDADO SIN BORRARLO, Y SUBIR LO DEVUELVE');
await setPlan('Essential');
check('lo guardado sigue en su llave', JSON.parse(await stored()).name, 'Camilo');
check('Store.assistant() lo ignora y lo reporta', await page.evaluate(() => { const a = Store.assistant(); return [a.character, a.name, a.brandSuit, a.locked, a.ignored.sort()]; }),
  [DEF.character, DEF.name, DEF.brandSuit, true, ['brandSuit', 'character', 'name']]);
check('el cotizador muestra el asistente del paquete, encendido', await wizard(), {
  presence: 'on', chatName: DEF.name, chatLabel: DEF.name,
  hitLabel: `Hablar con ${DEF.name}`, askLabel: `Preguntar a ${DEF.name}`, fabLabel: `Hablar con ${DEF.name}`
});
await openAssistant();
check('el backoffice muestra los valores del paquete, bloqueados', [await form(), await page.isDisabled('#saveAssistant')],
  [{ enabled: String(DEF.enabled), character: DEF.character, name: DEF.name, brandSuit: String(DEF.brandSuit) }, true]);
await setPlan('Professional');
check('volver a Professional lo devuelve en el cotizador', (await wizard()).chatName, 'Camilo');
await setPlan('Business');
await openAssistant();
check('Business también puede configurarlo', [await page.evaluate(() => Store.assistantConfigurable()), await page.isDisabled('#saveAssistant'), await page.isVisible('#assistantLocked'), (await form()).name], [true, false, false, 'Camilo']);
await setPlan('Professional');

console.log('\nDESACTIVARLO QUITA SOLO LA PRESENCIA');
await openAssistant();
await page.click('#assistantEnabled');
check('el interruptor refleja el cambio', await page.getAttribute('#assistantEnabled', 'aria-checked'), 'false');
await save();
await page.waitForFunction(() => document.getElementById('toast').classList.contains('show'));
check('queda guardado apagado', JSON.parse(await stored()).enabled, false);
check('el cotizador lo marca apagado', (await wizard()).presence, 'off');
check('no hay capa del personaje', await shown('#assistantStage'), false);
check('ni zona clicable del personaje', await shown('#assistantHit'), false);
check('ni burbuja de bienvenida', await shown('#assistantBubble'), false);
check('ni "Preguntar"', await shown('.help-card'), false);
check('ni panel de chat', await shown('#chatPanel'), false);
check('la tarjeta de análisis con IA sigue ahí', await page.isVisible('#aiCard') || await page.evaluate(() => !!document.getElementById('aiCard')), true);
check('y dice "Análisis inteligente" en vez del asistente', await page.evaluate(() => {
  const badge = document.querySelector('.ai-badge');
  const visible = el => !el.closest('[data-assistant-copy],[data-assistant-off-copy]') || getComputedStyle(el.closest('[data-assistant-copy],[data-assistant-off-copy]')).display !== 'none';
  return [...badge.querySelectorAll('[data-assistant-copy],[data-assistant-off-copy]')].filter(visible).map(s => s.textContent);
}), ['Análisis inteligente']);
await page.setViewportSize({ width: 390, height: 844 });
check('en el celular tampoco aparece el botón de chat', await shown('.chat-fab'), false);

console.log('\nREACTIVARLO LA DEVUELVE');
await page.setViewportSize({ width: 1440, height: 900 });
await openAssistant();
await page.click('#assistantEnabled');
await save();
await page.waitForFunction(() => document.getElementById('toast').classList.contains('show'));
check('ya no guarda enabled (es el valor del paquete)', 'enabled' in JSON.parse(await stored()), false);
check('el cotizador lo marca encendido', (await wizard()).presence, 'on');
check('vuelve "Preguntar"', await shown('.help-card [data-open-chat]'), true);
check('"Preguntar" abre el chat', await page.evaluate(() => { document.querySelector('.help-card [data-open-chat]').click(); return document.getElementById('chatPanel').classList.contains('open'); }), true);
await page.setViewportSize({ width: 390, height: 844 });
await gotoWizard();
check('en el celular vuelve el botón de chat', await shown('.chat-fab'), true);
check('y no hay capa 3D en el celular', await shown('#assistantStage'), false);
await page.setViewportSize({ width: 1440, height: 900 });

console.log('\nLA BIENVENIDA SE MUESTRA UNA VEZ POR NAVEGADOR');
check('marcarla la recuerda', await page.evaluate(() => { localStorage.removeItem(Object.keys(localStorage).find(k => k.endsWith('assistantWelcomed')) || '_'); const before = Store.assistantWelcomed(); Store.markAssistantWelcomed(); return [before, Store.assistantWelcomed()]; }), [false, true]);

console.log('\nDATOS CORRUPTOS EN LA LLAVE DEL ASISTENTE CAEN A LOS VALORES DEL PAQUETE, SIN ROMPER NADA');
const savedBeforeCorrupt = await stored(); // the next section expects it back
const effective = () => page.evaluate(() => { try { const a = Store.assistant(); return { enabled: a.enabled, character: a.character, name: a.name, brandSuit: a.brandSuit }; } catch (e) { return 'threw: ' + e.message; } });
for (const raw of ['not-json{', '[1,2]', 'null', '"x"', '42']) {
  for (const where of ['admin.html', 'index.html']) {
    await page.goto(D + where);
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, raw]);
    // Reload so Assistant.apply() in <head> (wizard) and the backoffice both start from the bad value.
    const before = errs.length;
    await page.goto(D + where);
    check(`${where}: con ${JSON.stringify(raw)} Store.assistant() devuelve el paquete`, await effective(),
      { enabled: DEF.enabled, character: DEF.character, name: DEF.name, brandSuit: DEF.brandSuit });
    if (where === 'index.html') check(`${where}: con ${JSON.stringify(raw)} el cotizador queda encendido y sin errores`,
      [await page.getAttribute('html', 'data-assistant'), errs.length - before], [DEF.enabled ? 'on' : 'off', 0]);
  }
}
await page.evaluate(k => localStorage.removeItem(k), KEY);

/* -------------------------------------------------- contexto y acciones --
 * What the cotizador PUBLISHES (window 'aci:event'), what the (simulated)
 * assistant may READ, and the propose → confirm → apply path. None of this needs
 * WebGL: the event bus, the context and the chat belong to the page, not to the 3D
 * layer (which the last block below checks only if it actually started). */
console.log('\nEL COTIZADOR PUBLICA LO QUE EL CLIENTE HACE (EN VEZ DE VIGILAR EL CURSOR)');
await gotoWizard();
await page.evaluate(() => { Store.resetAssistant(); Store.markAssistantWelcomed(); });
await gotoWizard();
const watch = () => page.evaluate(() => {
  window.__aci = [];
  addEventListener('aci:event', e => window.__aci.push(e.detail));
  return Object.keys(window.ACI).sort();
});
const eventos = tipo => page.evaluate(t => window.__aci.filter(e => e.type === t).map(e => e.payload), tipo);
const ultimo = async tipo => (await eventos(tipo)).at(-1);
check('el adaptador es la superficie del asistente en la página (y en window)', await watch(),
  ['context', 'emit', 'env', 'execute', 'fabricPayload', 'isTyping', 'stepId']);
const mueble = await page.evaluate(() => {
  const s = document.querySelector('.pieza-mueble');
  const name = [...s.options].map(o => o.value).filter(Boolean)[1];
  return { name, id: (furnitureRules[name] || {}).id };
});
await elegirMueble(page, mueble.name);
check('elegir un mueble publica el tipo y su id, no un clic', await ultimo('FURNITURE_SELECTED'), { furniture: mueble.name, furnitureId: mueble.id });
await page.setInputFiles('#furniturePhoto', TRES);
await page.waitForFunction(() => state.photos.length === 3);
check('subir fotos publica cuántas hay', await ultimo('PHOTOS_CHANGED'), { count: 3 });
await page.click('#nextButton');
/* El número del paso sale del propio cerebro: con los pasos opcionales (línea y daños) la
 * numeración corre, y lo que se afirma aquí es que el evento trae el paso correcto con su id. */
const pasoDe = id => page.evaluate(i => AssistantBrain.STEPS.find(s => s.id === i).n, id);
check('cambiar de paso publica cuál, con su id y su nombre', await ultimo('STEP_CHANGED'), { step: await pasoDe('MEASUREMENTS'), id: 'MEASUREMENTS', name: 'Medidas' });
for (const [id, valor] of [['width', 210], ['height', 85], ['depth', 90]]) {
  await page.fill('#' + id, String(valor));
  await page.evaluate(i => document.getElementById(i).dispatchEvent(new Event('change', { bubbles: true })), id);
}
{
  // El nombre de campo que se publica es el del catálogo del asistente
  // (`measurements.width`), no el id del input: un solo vocabulario.
  const porCampo = Object.fromEntries((await eventos('MEASUREMENTS_CHANGED')).map(e => [e.field, e.value]));
  check('escribir una medida publica el campo y su valor', [porCampo['measurements.width'], porCampo['measurements.height'], porCampo['measurements.depth']], [210, 85, 90]);
}
await page.click('#nextButton');
check('el paso 3 se anuncia igual', await ultimo('STEP_CHANGED'), { step: await pasoDe('PREFERENCES'), id: 'PREFERENCES', name: 'Preferencias' });
const chip = await page.evaluate(() => { const i = document.querySelectorAll('#needsGrid input')[0]; i.click(); return i.value; });
check('marcar una preferencia publica cuál y cómo', await ultimo('PREFERENCES_CHANGED'), { field: 'needs', option: chip, checked: true });
await page.selectOption('#style', { index: 0 });
check('cambiar un selector publica el campo y su valor', (await ultimo('PREFERENCES_CHANGED')).field, 'style');

console.log('\nSIN LA AUTORIZACIÓN MARCADA EL ASISTENTE NO VE DATOS PERSONALES');
check('lo que puede leer es el estado del cotizador, y nada más', await page.evaluate(() => Object.keys(ACI.context()).sort()),
  ['analysis','asksFurniture','asksMeasurements','asksPreferences','asksRecommendation', 'budget', 'consent', 'currentStep', 'estimate', 'fabric', 'furnitureNote', 'location', 'measurements', 'photos', 'preferences', 'selectedFurniture', 'service', 'submitted', 'tenant']);
await page.evaluate(() => {
  document.getElementById('fullName').value = 'Natalia Peña';
  document.getElementById('email').value = 'n@example.com';
  document.getElementById('phone').value = '3001234567';
});
check('con los campos escritos y sin autorización, el contexto no los lleva', await page.evaluate(() => ACI.context().contact ?? null), null);
await page.evaluate(() => document.getElementById('consent').click());
check('con la autorización marcada sí, y solo entonces', await page.evaluate(() => ACI.context().contact),
  { name: 'Natalia Peña', email: 'n@example.com', phone: '3001234567' });
check('y el contexto dice que está autorizada', await page.evaluate(() => ACI.context().consent), true);
check('la autorización también se publica como evento', await ultimo('CONSENT_CHANGED'), { checked: true });
check('y los rangos que el cotizador ya conoce para ese mueble', await page.evaluate(() => Object.keys(ACI.context().measurements.ranges || {}).sort()),
  ['measurements.depth', 'measurements.height', 'measurements.width']);
await page.evaluate(() => document.getElementById('consent').click());
check('al desmarcarla deja de verlos', await page.evaluate(() => ACI.context().contact ?? null), null);

console.log('\nEL ASISTENTE PROPONE, EL CLIENTE CONFIRMA, Y EL CAMBIO PASA POR DONDE PASA UNA EDICIÓN MANUAL');
await page.click('#backButton'); // paso 3 → 2
await page.evaluate(() => ['width', 'height', 'depth'].forEach(id => {
  const el = document.getElementById(id); el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true }));
}));
await page.click('.help-card [data-open-chat]');
await page.waitForSelector('#chatPanel.open');
check('al abrir el chat dice lo que tiene a la vista', await page.evaluate(() => [...document.querySelectorAll('#messages .message.bot')].some(m => m.textContent.startsWith('Lo que tengo a la vista:'))), true);
const hablar = async texto => { await page.fill('#chatInput', texto); await page.click('#chatForm button'); };
const propuesta = () => page.evaluate(() => {
  const el = [...document.querySelectorAll('#messages .aci-proposal')].at(-1);
  return el ? {
    titulo: el.querySelector('p').textContent,
    cambios: [...el.querySelectorAll('li')].map(l => l.textContent),
    botones: [...el.querySelectorAll('button')].map(b => b.textContent)
  } : null;
});
await hablar('ancho 210, alto 85');
await page.waitForSelector('#messages .aci-proposal');
check('los dos cambios van en UNA sola pregunta', await propuesta(), {
  titulo: '¿Aplico estos 2 cambios?', cambios: ['Ancho total: 210 cm', 'Alto total: 85 cm'], botones: ['Sí, aplícalos', 'Mantener']
});
check('y todavía no toca nada', await page.evaluate(() => [document.getElementById('width').value, document.getElementById('height').value]), ['', '']);
await page.click('#messages .aci-proposal [data-aci-confirm]');
check('al confirmar, el valor llega al campo como si lo hubiera escrito el cliente',
  await page.evaluate(() => [document.getElementById('width').value, document.getElementById('height').value]), ['210', '85']);
check('y el cotizador publica el cambio igual que en una edición manual',
  Object.fromEntries((await eventos('MEASUREMENTS_CHANGED')).slice(-2).map(e => [e.field, e.value])), { 'measurements.width': 210, 'measurements.height': 85 });
check('con su confirmación en el chat', await page.evaluate(() => [...document.querySelectorAll('#messages .message.bot')].at(-1).textContent), 'Listo, apliqué los 2 cambios.');
await hablar('ancho 300');
await page.waitForFunction(() => document.querySelectorAll('#messages .aci-proposal').length === 2);
check('una propuesta nueva reemplaza a la anterior (una sola viva)', [(await propuesta()).titulo, await page.evaluate(() => [...document.querySelectorAll('#messages .aci-proposal button')].filter(b => !b.disabled).length)], ['¿Aplico este cambio?', 2]);
await page.locator('#messages .aci-proposal').last().locator('[data-aci-keep]').click();
check('«Mantener» deja el campo como estaba', await page.evaluate(() => document.getElementById('width').value), '210');
check('y lo dice', await page.evaluate(() => [...document.querySelectorAll('#messages .message.bot')].at(-1).textContent), 'Perfecto, lo dejamos como estaba.');
{
  const vivas = await page.evaluate(() => document.querySelectorAll('#messages .aci-proposal').length);
  await hablar('cambia el precio a 0');
  await page.waitForFunction(() => [...document.querySelectorAll('#messages .message.bot')].at(-1).textContent.includes('No puedo cambiar el precio'));
  check('pedirle cambiar el precio no propone nada', await page.evaluate(() => document.querySelectorAll('#messages .aci-proposal').length), vivas);
  await hablar('¿cómo tomo las medidas?');
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'depth');
  check('enfocar un campo no pide confirmación: el foco va al primer hueco',
    await page.evaluate(() => [document.activeElement.id, document.getElementById('depth').classList.contains('aci-highlight')]), ['depth', true]);
  check('y tampoco abre una propuesta', await page.evaluate(() => document.querySelectorAll('#messages .aci-proposal').length), vivas);
  // Avisar de lo que el propio cotizador considera fuera de lo habitual: al
  // escribirla, no solo al pulsar "Revisar mi información" en el paso 4, y una
  // sola vez por campo mientras siga fuera de rango.
  const avisos = () => page.evaluate(() => [...document.querySelectorAll('#messages .message.bot')].filter(m => /es mucho para tu|es poco para tu/.test(m.textContent)).length);
  const escribir = async (id, valor) => {
    await page.fill('#' + id, String(valor));
    await page.evaluate(i => document.getElementById(i).dispatchEvent(new Event('change', { bubbles: true })), id);
  };
  await escribir('depth', 543);
  await page.waitForFunction(() => [...document.querySelectorAll('#messages .message.bot')].some(m => /543 cm de fondo es mucho/.test(m.textContent)));
  check('escribir una medida fuera de lo habitual se avisa en el momento', await avisos(), 1);
  await escribir('depth', 600);
  await page.waitForTimeout(500);
  check('y no se repite mientras el mismo campo siga fuera de rango', await avisos(), 1);
  await escribir('depth', 90);
  await page.waitForTimeout(300);
  await escribir('depth', 543);
  await page.waitForFunction(() => [...document.querySelectorAll('#messages .message.bot')].filter(m => /es mucho para tu/.test(m.textContent)).length === 2);
  check('corregirla y volver a escribirla mal avisa otra vez', await avisos(), 2);
  await page.click('#closeChat');
  await page.click('.help-card [data-open-chat]');
  await page.waitForTimeout(300);
  check('el resumen del contexto se dice una sola vez por carga',
    await page.evaluate(() => [...document.querySelectorAll('#messages .message.bot')].filter(m => m.textContent.startsWith('Lo que tengo a la vista:')).length), 1);
}

console.log('\nMIENTRAS PIENSA, EL CHAT LO DICE (Y NO ACEPTA DOS PREGUNTAS A LA VEZ)');
await gotoWizard();
await page.evaluate(() => Store.markAssistantWelcomed());
await gotoWizard();
await page.click('.journey .help-card [data-open-chat]');
await page.waitForTimeout(350);
/* Todo el primer tramo corre dentro de un solo evaluate: la burbuja de espera se dibuja antes
 * del primer await de askAssistant(), así que se puede leer en el mismo instante en que se
 * pregunta, sin carrera contra los 350 ms del cerebro. */
const alPreguntar = await page.evaluate(() => {
  askAssistant('¿cómo tomo las medidas?');
  askAssistant('y otra cosa más'); // el segundo turno se ignora: uno a la vez
  const espera = document.querySelector('#messages .message.typing');
  return {
    espera: document.querySelectorAll('#messages .message.typing').length,
    rol: espera && espera.getAttribute('role'),
    etiqueta: espera && espera.getAttribute('aria-label'),
    nombre: Store.assistant().name,
    envio: document.querySelector('#chatForm button').disabled,
    preguntas: document.querySelectorAll('#messages .message.user').length
  };
});
check('preguntar dibuja que está pensando, en vez de dejar el chat mudo', [alPreguntar.espera, alPreguntar.rol], [1, 'status']);
check('y se anuncia con el nombre del asistente, no como una respuesta vacía', alPreguntar.etiqueta, `${alPreguntar.nombre} está escribiendo…`);
check('el envío espera a la respuesta', alPreguntar.envio, true);
check('y una segunda pregunta no se cuela: un turno a la vez', alPreguntar.preguntas, 1);
await page.waitForFunction(() => !document.querySelector('#messages .message.typing'));
const trasResponder = await page.evaluate(() => ({
  puntos: document.querySelectorAll('#messages .message.typing').length,
  envio: document.querySelector('#chatForm button').disabled,
  respuesta: [...document.querySelectorAll('#messages .message.bot')].at(-1).textContent.trim().length > 0
}));
check('cuando llega la respuesta los puntos se van, el envío vuelve y queda el mensaje',
  [trasResponder.puntos, trasResponder.envio, trasResponder.respuesta], [0, false, true]);

console.log('\nEL AVISO DE UNA MEDIDA RARA SE VE EN EL CHAT (AUNQUE NADIE HAYA PREGUNTADO)');
await gotoWizard();
await page.evaluate(() => Store.markAssistantWelcomed());
await gotoWizard();
/* El cliente abre el chat y llena el formulario: no ha escrito nada EN el chat todavía. */
await page.click('.journey .help-card [data-open-chat]');
await elegirPrimerMueble(page);
await page.setInputFiles('#furniturePhoto', TRES);
await page.waitForFunction(() => state.photos.length >= 3);
for (let i = 0; i < 4 && await page.evaluate(() => ACI.stepId(state.step) !== 'MEASUREMENTS'); i++) { await page.click('#nextButton'); await page.waitForTimeout(200); }
await page.fill('#depth', '543');
await page.evaluate(() => document.getElementById('depth').dispatchEvent(new Event('change', { bubbles: true })));
await page.waitForFunction(() => [...document.querySelectorAll('#messages .message.bot')].some(m => /543 cm de fondo es mucho/.test(m.textContent)));
const aviso = await page.evaluate(() => {
  const m = [...document.querySelectorAll('#messages .message.bot')].find(x => /543 cm de fondo es mucho/.test(x.textContent));
  return { escrito: !!m, visible: m ? getComputedStyle(m).display !== 'none' : false,
           hayPregunta: document.querySelectorAll('#messages .message.user').length };
});
check('el aviso queda escrito en la conversación', aviso.escrito, true);
check('y se ve sin desplegar «Ver toda la conversación»: no hay pregunta que lo tape',
  [aviso.hayPregunta, aviso.visible], [0, true]);

console.log('\nLA CONVERSACIÓN VIVE EN LA BARRA, NO ENCIMA DEL COTIZADOR');
await gotoWizard();
await page.waitForTimeout(300);
const barra = () => page.evaluate(() => {
  const j = document.querySelector('.journey');
  const panel = document.getElementById('chatPanel');
  const jr = j.getBoundingClientRect(), pr = panel.getBoundingClientRect();
  const w = document.querySelector('.workspace').getBoundingClientRect();
  return {
    chatting: j.classList.contains('chatting'),
    progreso: getComputedStyle(document.querySelector('.step-list')).display !== 'none',
    panel: getComputedStyle(panel).display !== 'none',
    dentroDeLaBarra: pr.left >= jr.left - 1 && pr.right <= jr.right + 1,
    sobreElWizard: pr.width > 0 && pr.height > 0 && pr.right > w.left + 1,
    nombre: j.getAttribute('aria-label'),
    boton: document.querySelector('.journey .help-card .text-button').textContent.trim()
  };
});
const nombre = await page.evaluate(() => Store.assistant().name);
check('el asistente se anuncia por su nombre, no como un "Preguntar" suelto', (await barra()).boton, `Pregúntale a ${nombre}`);
await page.click('.journey .help-card [data-open-chat]');
await page.waitForTimeout(350);
const abierta = await barra();
check('abrir la conversación ocupa la barra, guarda el progreso y no tapa el cotizador',
  [abierta.chatting, abierta.panel, abierta.dentroDeLaBarra, abierta.sobreElWizard, abierta.progreso], [true, true, true, false, false]);
check('y la barra se anuncia como conversación', abierta.nombre, `Conversación con ${nombre}`);
check('con "Volver al progreso" arriba', await page.isVisible('#backToProgress'), true);
await page.click('#backToProgress');
await page.waitForTimeout(300);
const cerrada = await barra();
check('y se vuelve al progreso sin recargar', [cerrada.chatting, cerrada.progreso, cerrada.panel], [false, true, false]);
await page.click('.journey .help-card [data-open-chat]');
for (const t of ['hola', '¿cómo tomo las medidas?']) {
  await page.fill('#chatInput', t); await page.click('#chatForm button');
  await page.waitForTimeout(800);
}
const visibles = () => page.evaluate(() => [...document.querySelectorAll('#messages .message')].filter(m => getComputedStyle(m).display !== 'none').length);
const total = await page.evaluate(() => document.querySelectorAll('#messages .message').length);
check('solo el último intercambio a la vista, el resto sigue en el DOM', [await visibles(), total > 4], [2, true]);
await page.click('#toggleMessages');
check('"Ver toda la conversación" la despliega entera', await visibles(), total);
await page.setViewportSize({ width: 390, height: 844 });
await gotoWizard();
await page.click('.chat-fab');
await page.waitForTimeout(300);
check('en el celular el panel vuelve a flotar y la barra no se dibuja', await page.evaluate(() => {
  const panel = document.getElementById('chatPanel');
  const j = document.querySelector('.journey');
  return [panel.classList.contains('open'), getComputedStyle(panel).position, getComputedStyle(j).display, Math.round(j.getBoundingClientRect().height)];
}), [true, 'fixed', 'block', 0]);
await page.setViewportSize({ width: 1440, height: 900 });

console.log('\nLA PRESENCIA REACCIONA A LOS EVENTOS REALES (SI LA CAPA 3D ARRANCA)');
/* La bienvenida se pide EN ESTE arranque (se limpia su marca antes de recargar): su burbuja
 * solo existe cuando la capa 3D midió, y la regla que se comprueba abajo es la del aviso.
 * La carga es SIN TOCAR NADA (un goto pelado): el primer clic en el formulario despide la
 * bienvenida —su propio diseño—, así que elegir la línea antes de medirla la borraría. */
await page.evaluate(() => localStorage.removeItem(Object.keys(localStorage).find(k => k.endsWith('assistantWelcomed')) || '_'));
await page.goto(D + 'index.html');
const stageOk = await page.waitForSelector('#assistantStage.ready', { timeout: 30000 }).then(() => true, () => false);
const skip = n => console.log(`  SKIP  ${n}  (la capa 3D no arrancó en este navegador)`);
if (!stageOk) {
  skip('una acción del cliente produce una reacción, y la siguiente se suprime');
  skip('el sillón viste la tela de la cotización, sin sondeos');
} else {
  /* La bienvenida es el MISMO trato que el aviso: mientras la tarjeta está, la barra guarda
   * su progreso y sus pasos no quedan detrás del texto (dueño, 21/09: «remember when exist
   * message... the system hidden sidebar»). Sin eso, medido a 1440×900, la burbuja tapaba
   * 4 de los 8 pasos de la línea. */
  const hayBienvenida = await page.waitForSelector('#assistantBubble:not([hidden])', { timeout: 12000 }).then(() => true, () => false);
  if (!hayBienvenida) console.log('  estado al faltar la bienvenida: ' + JSON.stringify(await page.evaluate(() => {
    try {
      const bub = document.getElementById('assistantBubble');
      return { welcomed: Store.assistantWelcomed(), enabled: Store.assistant().enabled, stage: document.getElementById('assistantStage').className, oculta: bub.hidden };
    } catch (e) { return 'THROW: ' + e.message; }
  })));
  await page.waitForTimeout(400);
  check('la bienvenida guarda el progreso y no deja un paso tapado', hayBienvenida ? await page.evaluate(() => {
    const j = document.querySelector('.journey'), bub = document.getElementById('assistantBubble');
    const r = bub.getBoundingClientRect();
    const lista = document.querySelector('.step-list');
    const pasos = [...lista.querySelectorAll('li:not([hidden])')];
    const hueco = Math.round(Number(document.getElementById('assistantStage').dataset.crown) - r.bottom);
    const oculta = getComputedStyle(lista).opacity === '0';
    return {
      noticing: j.classList.contains('noticing'),
      intro: getComputedStyle(document.querySelector('.journey-intro')).opacity,
      pasos: getComputedStyle(lista).opacity,
      sobreSuCabeza: hueco >= 2 && hueco <= 14,
      /* Pasos que de verdad quedan DETRÁS de la tarjeta: si el progreso se guardó, ninguno. */
      tapados: oculta ? 0 : pasos.filter(li => { const q = li.getBoundingClientRect(); return q.bottom > r.top && q.top < r.bottom; }).length
    };
  }) : 'la bienvenida no apareció', { noticing: true, intro: '0', pasos: '0', sobreSuCabeza: true, tapados: 0 });
  if (hayBienvenida) {
    await page.click('#assistantBubble .bubble-close');
    await page.waitForTimeout(400);
    check('y al cerrarla el progreso vuelve, sin recargar', await page.evaluate(() => {
      const j = document.querySelector('.journey'), pasos = document.querySelector('.step-list');
      return [j.classList.contains('noticing'), getComputedStyle(pasos).pointerEvents];
    }), [false, 'auto']);
  }
  await gotoWizard(); // y de ahí en adelante, el flujo de siempre (paso 1 = Tu mueble)
  await page.evaluate(() => { window.__aci = []; addEventListener('aci:event', e => window.__aci.push(e.detail)); });
  check('arranca sin tela y sin «pensar»', await page.getAttribute('#assistantStage', 'data-chair-fabric'), '');
  await elegirMueblePorIndice(page, 1);
  await page.waitForFunction(() => document.getElementById('assistantStage').dataset.reactions === '1');
  check('una acción del cliente, una reacción', await page.getAttribute('#assistantStage', 'data-reaction'), 'look-selection');
  check('y mira lo que acaba de tocar', await page.getAttribute('#assistantStage', 'data-glance'), 'selection');
  await elegirMueblePorIndice(page, 0);
  await page.waitForFunction(() => document.getElementById('assistantStage').dataset.reactionsSuppressed === '1');
  check('la siguiente, dentro de la pausa, se suprime y se cuenta',
    await page.evaluate(() => [document.getElementById('assistantStage').dataset.reactions, document.getElementById('assistantStage').dataset.reaction]), ['1', 'look-selection']);
  await page.setInputFiles('#furniturePhoto', TRES);
  await page.waitForFunction(() => state.photos.length === 3);
  await page.click('#nextButton');
  await page.waitForTimeout(300);
  check('un paso nuevo borra la mirada anterior (mira el paso, no el botón)', await page.getAttribute('#assistantStage', 'data-glance'), null);
  await page.click('#coverage');
  check('y sigue al cliente por los controles que toca, sin reacción de por medio', await page.getAttribute('#assistantStage', 'data-glance'), 'coverage');
  // El aviso, como burbuja legible DENTRO de la barra (nunca encima del cotizador), pegada
  // a ella, con el progreso guardado y el punto de no leído en "Pregúntale a".
  const coronilla = await page.evaluate(() => Number(document.getElementById('assistantStage').dataset.crown));
  await page.fill('#depth', '543');
  await page.evaluate(() => document.getElementById('depth').dispatchEvent(new Event('change', { bubbles: true })));
  await page.waitForSelector('#assistantBubble:not([hidden])', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(250);
  const nombreAsistente = await page.evaluate(() => Store.assistant().name);
  check('el aviso aparece pegado a ella, no lejos ni detrás de su cuerpo', await page.evaluate(([nombre, coronilla]) => {
    const bub = document.getElementById('assistantBubble');
    const j = document.querySelector('.journey');
    const w = document.querySelector('.workspace').getBoundingClientRect();
    const r = bub.getBoundingClientRect(), jr = j.getBoundingClientRect();
    const hueco = Math.round(Number(document.getElementById('assistantStage').dataset.crown) - r.bottom);
    const intro = document.querySelector('.journey-intro'), pasos = document.querySelector('.step-list');
    return {
      visible: !bub.hidden && getComputedStyle(bub).display !== 'none',
      quien: bub.querySelector('.bubble-who').textContent.trim() === nombre,
      /* El aviso dice el MENSAJE, no un anzuelo: la MISMA frase que la línea del paso (dueño, 19/09). */
      textoEsElError: bub.querySelector('.bubble-text').textContent === document.getElementById('measureError').textContent,
      sobreSuCabeza: hueco >= 2 && hueco <= 14,
      barraGuardada: getComputedStyle(intro).opacity === '0' && getComputedStyle(pasos).opacity === '0',
      pasosNoRecibenClic: (() => {
        const punto = document.elementFromPoint(60, Math.round(pasos.getBoundingClientRect().top) + 12);
        return !(punto && punto.closest && punto.closest('.step-list'));
      })(),
      sinReacomodo: Math.round(Number(document.getElementById('assistantStage').dataset.crown)) === coronilla,
      dentroDeLaBarra: r.left >= jr.left - 1 && r.right <= jr.right + 1 && r.right <= w.left + 1
    };
  }, [nombreAsistente, coronilla]), { visible: true, quien: true, textoEsElError: true, sobreSuCabeza: true, barraGuardada: true, pasosNoRecibenClic: true, sinReacomodo: true, dentroDeLaBarra: true });
  // El relevo es instantáneo: el progreso no puede tardar un cuadro en irse (su `transition`
  // heredado hacía que el aviso apareciera y la barra se fuera ~250 ms después: un parpadeo).
  check('la barra se guarda en el mismo instante en que aparece el aviso (sin parpadeo)', await page.evaluate(() => {
    const journey = document.querySelector('.journey'), pasos = document.querySelector('.step-list');
    journey.classList.remove('noticing');
    const antes = getComputedStyle(pasos).opacity;
    journey.classList.add('noticing');                       // mismo instante del aviso
    const enElMismoCuadro = getComputedStyle(pasos).opacity;
    const punto = document.elementFromPoint(60, Math.round(pasos.getBoundingClientRect().top) + 12);
    const recibeClic = !!(punto && punto.closest && punto.closest('.step-list'));
    journey.classList.remove('noticing');
    return { antes, enElMismoCuadro, recibeClic };
  }), { antes: '1', enElMismoCuadro: '0', recibeClic: false });
  check('y deja marcado "Pregúntale a" como no leído', await page.evaluate(() => document.querySelector('.journey .help-card .text-button').hasAttribute('data-unread')), true);
  await page.click('#width'); // seguir con el formulario la despide
  await page.waitForTimeout(300);
  // El sillón: sin señales de vida se va caminando y se sienta; cualquier señal la trae.
  // El hook data-idle-ms acorta la espera (60 s es imposible de esperar en una suite).
  const idleMs = v => page.evaluate(ms => { document.getElementById('assistantStage').dataset.idleMs = String(ms); }, v);
  const pose = () => page.getAttribute('#assistantStage', 'data-pose');
  /* El paseo se mide cuadro a cuadro: `data-sit-phase` dice en qué tramo va y `data-travel`
   * el ángulo entre su giro y su desplazamiento (0° de frente, ±90° de lado, ±180° de
   * espaldas). Se muestrea desde antes de que se vaya hasta que vuelve de pie. */
  await page.evaluate(() => {
    const st = document.getElementById('assistantStage');
    window.__walk = [];
    window.__walkOpen = true;
    const step = () => {
      if (!window.__walkOpen) return;
      if (st.dataset.sitPhase) window.__walk.push([st.dataset.sitPhase, st.dataset.travel ?? null]);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  await idleMs(250);
  await page.waitForFunction(() => document.getElementById('assistantStage').dataset.pose === 'sitting', { timeout: 9000 }).catch(() => {});
  check('sin señales de vida se va a su sillón y se sienta', await pose(), 'sitting');
  check('el sillón y ella comparten escena y profundidad (una sola pasada)', await page.getAttribute('#assistantStage', 'data-render'), 'one-pass');
  check('y se sienta en el asiento: ni flotando encima ni hundida en el sillón', await page.evaluate(() => {
    const st = document.getElementById('assistantStage');
    const hip = Number(st.dataset.hip), seat = Number(st.dataset.seat), corona = Number(st.dataset.crown);
    const suelo = Number(st.dataset.floor); // la línea de la que cuelga el lienzo (`data-floor`)
    return { sentada: Math.abs(hip - seat) <= 18, asiento: seat > corona && seat < suelo - 20 };
  }), { sentada: true, asiento: true });
  check('y los pies quedan apoyados en el suelo, no dibujados debajo de la línea', await page.evaluate(() => {
    const st = document.getElementById('assistantStage');
    const foot = Number(st.dataset.foot);
    const suelo = Number(st.dataset.floor); // la línea de la que cuelga el lienzo (`data-floor`)
    /* Los pies se colocan a la altura que PROYECTA sobre la línea del suelo para su propia z:
     * la cámara mira inclinada y lo que está más cerca se dibuja más abajo, así que un tobillo
     * puesto "en el suelo" en el mundo (y = feetY) aparecía 23 px por debajo, fuera del lienzo:
     * eso era "no tiene pies" al sentarse. `data-foot` publica esa proyección, no la altura en
     * el aire. Se mide SENTADA, que es cuando `placeFeet` la coloca. */
    return { resolvio: Number.isFinite(foot), apoyado: Math.abs(foot - suelo) <= 15 };
  }), { resolvio: true, apoyado: true });
  check('y las suelas quedan planas, no colgando del tobillo', await page.evaluate(() => {
    const st = document.getElementById('assistantStage');
    const [l, r] = (st.dataset.feetFlat || '').split('|').map(Number);
    /* `data-feet-flat` es la inclinación de cada pie contra la referencia medida al cargar (de
     * pie, suelas en el suelo). El clip lo deja colgando —punta abajo, taco arriba—, que se
     * veía como un zapato en el aire; la pose lo acuesta. 10° cubre el temblor del clip. */
    return { midio: Number.isFinite(l) && Number.isFinite(r), planas: l <= 10 && r <= 10 };
  }), { midio: true, planas: true });
  check('y las manos se apoyan en los muslos (IK de brazos, no un gesto fijo)', await page.evaluate(() => {
    const st = document.getElementById('assistantStage');
    const [l, r] = (st.dataset.hands || '').split('|').map(Number);
    /* `data-hands` es lo que quedó cada muñeca del blanco sobre el muslo, en px: 0 es apoyada.
     * El gesto fijo que había antes dejaba 22 px (izquierda) y 33 px (derecha) por encima del
     * muslo — manos flotando frente al vientre. La IK las baja a ~0; el margen de 6 px cubre
     * el redondeo y el temblor del clip de reposo. */
    return { midio: Number.isFinite(l) && Number.isFinite(r), apoyadas: l <= 6 && r <= 6 };
  }), { midio: true, apoyadas: true });
  await page.mouse.move(700, 420);
  await page.mouse.move(720, 430);
  await page.waitForFunction(() => document.getElementById('assistantStage').dataset.pose === 'standing', { timeout: 9000 }).catch(() => {});
  check('al primer movimiento del ratón se levanta y vuelve a su sitio', await pose(), 'standing');
  /* Y la vuelta se camina: cada pierna mirando a donde va. Antes la ida empezaba con un paso
   * de lado (~90°) y la vuelta era un desplazamiento de espaldas y en diagonal (~125°) con
   * el clip de caminar hacia adelante — el "moonwalk" que se veía. El ángulo se mide contra
   * el giro que decide la secuencia (la mirada suma aparte, hasta ~13°). */
  const caminata = await page.evaluate(() => {
    window.__walkOpen = false;
    return { m: window.__walk, pico: document.getElementById('assistantStage').dataset.travelPeak };
  });
  const tramos = caminata.m.map(([f]) => f).filter((f, i, a) => f !== a[i - 1]);
  const piernas = caminata.m.map(([f]) => f);
  const angulos = caminata.m.filter(([, a]) => a !== null).map(([, a]) => Math.abs(Number(a)));
  check('camina mirando a donde va: las dos piernas de ida y las dos de vuelta', {
    ida: ['walk1', 'walk2'].every(p => piernas.includes(p)),
    vuelta: ['walkback1', 'walkback2'].every(p => piernas.includes(p)),
    deFrente: angulos.every(a => a <= 45),
    /* No es una aserción de fidelidad, es cobertura: que se hayan muestreado suficientes cuadros
     * del paseo. Bajo carga (varios Chromium y `npm test` a la vez en la misma máquina) el rAF se
     * cae a la mitad y 60 muestras por paseo no llegan: 30 siguen siendo medio segundo de caminata
     * real, y una máquina ocupada no es un fallo del paseo. */
    mide: angulos.length > 30
  }, { ida: true, vuelta: true, deFrente: true, mide: true });
  check('y el peor ángulo del paseo se queda de frente (era ~125° de espaldas)', Number(caminata.pico) <= 45, true);
  check('la vuelta se hace en orden: se levanta, se gira, camina, se gira y camina', {
    orden: ['rise', 'turnback1', 'walkback1', 'turnback2', 'walkback2', 'face'].map((p, i, l) => {
      const at = tramos.indexOf(p);
      return at >= 0 && (i === 0 || at > tramos.indexOf(l[i - 1]));
    }).every(Boolean),
    completa: ['rise', 'turnback1', 'walkback1', 'turnback2', 'walkback2', 'face'].every(p => tramos.includes(p))
  }, { orden: true, completa: true });
  check('y queda DELANTE del respaldo, no en el mismo plano Z', await page.evaluate(() => {
    const st = document.getElementById('assistantStage');
    const [cara, espalda] = (st.dataset.sitZ || '').split('|').map(Number);
    return { medido: Number.isFinite(cara) && Number.isFinite(espalda), delante: espalda > cara };
  }), { medido: true, delante: true });
  check('el asiento y el hueco entre apoyabrazos se miden con rayos en el propio sillón', await page.evaluate(() => {
    const sock = (document.getElementById('assistantStage').dataset.socket || '').split('|');
    const [asiento, centro, ancho] = sock.map(Number);
    return { medido: sock.length >= 3 && [asiento, centro, ancho].every(Number.isFinite), ancho: ancho > 20 };
  }), { medido: true, ancho: true });
  await idleMs(300);
  await page.waitForFunction(() => document.getElementById('assistantStage').dataset.pose === 'sitting', { timeout: 9000 }).catch(() => {});
  check('y el muslo gira de verdad: la rodilla sube a la altura de la cadera (IK)', await page.evaluate(() => {
    const st = document.getElementById('assistantStage');
    const knee = Number(st.dataset.knee), hip = Number(st.dataset.hip);
    /* La tolerancia es 20 px, no 14: la rodilla está ~0.2 u más cerca de la cámara que la
     * cadera, y con la cámara inclinada eso la dibuja ~8 px más abajo (el mismo término que
     * lleva los pies a la línea del suelo). Lo que la prueba exige es que la rodilla esté a la
     * ALTURA de la cadera: una pierna colgando la dejaría ~34 px por debajo. */
    return { resolvio: Number.isFinite(knee), sube: Math.abs(knee - hip) <= 20 };
  }), { resolvio: true, sube: true });
  // Colisiones: sin el mundo físico cargado no hay garantía, y el producto decidió que
  // entonces no se sienta. Si no cargó (sin red), se reporta como SKIP, no como fallo.
  if (await page.evaluate(() => document.getElementById('assistantStage').dataset.phys !== 'rapier')) {
    skip('nunca la atraviesa: ni un cuadro con solape en todo el ciclo');
    skip('y un empujón sostenido contra el sillón no la mete');
  } else {
    await page.waitForTimeout(800);   // que se asiente: el residuo de reposo es el que se exige
    check('nunca la atraviesa: ningún cuadro con solape en el ciclo (caminar, girar, sentarse)', await page.evaluate(() => {
      const st = document.getElementById('assistantStage');
      const [over2, over6, frames] = (st.dataset.penFrames || '0|0|0').split('|').map(Number);
      /* Medido con la IK de piernas: 1 cuadro de ~400 con 2.12 px de hondura, en la fase
       * `settle`, parte `body` — el aterrizaje en el sillón, que la resolución deja en 0.00 px.
       * Lo que esta prueba exige es que no lo ATRAVIESE: un roce de uno o dos cuadros al
       * sentarse no es eso, un solape sostenido sí. De ahí: ningún cuadro por encima de 6 px,
       * a lo sumo 3 por encima de 2 px, el pico acotado y el residuo de reposo en 0.01 u.
       * (Con el arreglo del signo de la proyección el pico era 0.00; la pose de piernas nueva
       * toca el sillón un cuadro al aterrizar.) */
      return { fisica: st.dataset.phys === 'rapier', cuadros: frames > 60, sostenido: over2 <= 3, grave: over6 === 0, pico: Number(st.dataset.penPeak) <= 6, reposo: Number(st.dataset.penUnits || 0) <= 0.01 };
    }), { fisica: true, cuadros: true, sostenido: true, grave: true, pico: true, reposo: true });
    /* Y sentada y quieta la colisión NO tiene que tocarla. El balanceo que se veía era esto:
     * el muelle la devolvía al blanco geométrico del asiento —unos píxeles DENTRO del
     * apoyabrazos, porque su cuerpo no cabe entero en el hueco a la altura del brazo— y la
     * resolución la sacaba otra vez: medido, ~3 px cada ~0.5 s, con los pies moviéndose con
     * ella. El ancla ahora es el sitio RESUELTO, así que los dos están de acuerdo. Y se mide
     * el reposo PURO: esta muestra va ANTES del empujón de prueba, porque la cola de ése
     * (roces de hondura 0.000 px, medidos) se contaba como si fuera reposo. */
    await page.waitForTimeout(800);   // el reposo, sin empujón de prueba de por medio
    const quieta = await page.evaluate(async () => {
      const st = document.getElementById('assistantStage');
      const out = { cuadros: 0, empujes: 0, pen: 0, parte: '', pushes: '', hip: '', seat: '', fases: '', frames: '' };
      const t0 = performance.now();
      await new Promise(done => {
        const step = () => {
          out.cuadros++;
          if ((st.dataset.pushRoot || '') !== '') out.empujes++;
          if (Number(st.dataset.pen) > out.pen) {
            out.pen = Number(st.dataset.pen); out.parte = st.dataset.penPart; out.pushes = st.dataset.pushes;
            out.fases = st.dataset.penPhases; out.frames = st.dataset.penFrames;
          }
          out.hip = st.dataset.hip; out.seat = st.dataset.seat;
          if (performance.now() - t0 < 2500) requestAnimationFrame(step); else done();
        };
        requestAnimationFrame(step);
      });
      return out;
    });
    // Diagnóstico SÓLO por el camino que falla: qué solape, de qué parte y con qué empujes.
    if (quieta.empujes || quieta.pen) console.log(`        diagnóstico: pen=${quieta.pen} parte=${quieta.parte} hip=${quieta.hip} seat=${quieta.seat}\n        pushes=${quieta.pushes}\n        fases=${quieta.fases} frames=${quieta.frames}`);
    check('sentada y quieta la colisión no la empuja: se acabó el vaivén', {
      empujes: quieta.empujes, pen: quieta.pen, corrio: quieta.cuadros >= 20
    }, { empujes: 0, pen: 0, corrio: true });
    // Y con un empujón sostenido contra el sillón (3 px por cuadro, 1 s ≈ 180 px de intento)
    // no la mete: mientras empuja el pico no pasa de 16 px, y al soltarlo vuelve a 0.00 px
    // sentada como estaba. Un empujón que de verdad la metiera no vuelve a cero.
    await page.evaluate(() => { document.getElementById('assistantStage').dataset.shove = '3'; });
    await page.waitForTimeout(1000);
    const peak = await page.evaluate(() => Number(document.getElementById('assistantStage').dataset.penPeak));
    await page.evaluate(() => { delete document.getElementById('assistantStage').dataset.shove; });
    await page.waitForTimeout(1200);   // que se vuelva a asentar por completo
    check('y un empujón sostenido contra el sillón no la mete: sigue sentada y fuera', await page.evaluate(() => {
      const st = document.getElementById('assistantStage');
      const hip = Number(st.dataset.hip), seat = Number(st.dataset.seat);
      // Medido: con 270 px de empuje acumulado el pico es un roce de ~6 px y al soltarlo
      // vuelve a 0.00 px sentada donde estaba. Un empujón que de verdad la metiera no
      // vuelve a cero.
      return { fuera: Number(st.dataset.pen) <= 1, asiento: Math.abs(hip - seat) <= 16 };
    }), { fuera: true, asiento: true });
    check('y el pico del empujón se queda en un roce, no la traga', { pico: peak <= 10 }, { pico: true });
  }
  await page.mouse.move(640, 340); // y la despierta, para no dejar el resto de la suite sentada
  await page.waitForFunction(() => document.getElementById('assistantStage').dataset.pose === 'standing', { timeout: 25000 }).catch(() => {});
  await idleMs(900);
  await page.waitForTimeout(500); // media espera
  await page.mouse.move(600, 300); // una señal reinicia la cuenta
  await page.waitForTimeout(500); // ya venció el plazo original
  check('la espera se reinicia con cada señal (no se sienta al vencer la primera)', await pose(), 'standing');
  await page.click('.journey .help-card [data-open-chat]'); // con la conversación abierta atiende
  await page.waitForTimeout(1000);
  check('con la conversación abierta no se va al sillón', await pose(), 'standing');
  await page.click('#closeChat');
  await idleMs(600000); // de aquí en adelante, sin atajos
  check('el progreso vuelve solo cuando el cliente sigue con el formulario', await page.evaluate(() => {
    const j = document.querySelector('.journey');
    return [document.getElementById('assistantBubble').hidden, j.classList.contains('noticing'), getComputedStyle(document.querySelector('.step-list')).display !== 'none'];
  }), [true, false, true]);
  await page.fill('#depth', '90');
  await page.evaluate(() => document.getElementById('depth').dispatchEvent(new Event('change', { bubbles: true })));
  await page.waitForTimeout(200);
  await page.fill('#width', '210'); await page.fill('#height', '85'); await page.fill('#depth', '90');
  await page.click('#nextButton'); await page.click('#nextButton');
  await page.click('#analyzeButton'); await page.waitForFunction(() => state.analyzed);
  await page.click('#nextButton');
  await page.waitForFunction(() => document.getElementById('assistantStage').dataset.chairFabric !== '');
  const vestida = await page.evaluate(() => ({
    tela: document.getElementById('selectedFabric').value,
    sillon: document.getElementById('assistantStage').dataset.chairFabric,
    eventos: window.__aci.filter(e => e.type === 'FABRIC_SELECTED').map(e => [e.payload.name, e.payload.auto])
  }));
  check('la mejor coincidencia se anuncia sola (auto: true)', vestida.eventos.at(-1), [vestida.tela, true]);
  check('y el sillón la viste sin que nadie lo sondee', vestida.sillon, vestida.tela);
  await page.waitForTimeout(4200); // el presupuesto anti-Clippy es de 4 s: sin esta espera, la reacción se suprime y el clic gana
  const otra = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.fabric-card')];
    const i = cards.findIndex(c => !c.classList.contains('selected'));
    const nombre = cards[i].querySelector('b').textContent.split(' · ')[0];
    cards[i].click();
    return nombre;
  });
  check('elegir otra tela la cambia al instante', await page.getAttribute('#assistantStage', 'data-chair-fabric'), otra);
  // La reacción se agrupa y llega ~60 ms después del clic (COALESCE_MS).
  const miraSillon = await page.waitForFunction(() => document.getElementById('assistantStage').dataset.glance === 'armchair', null, { timeout: 3000 }).then(() => true, () => false);
  check('y el clic no le quita los ojos de encima del sillón (la reacción manda sobre el clic)', miraSillon, true);
  check('y el evento dice que la eligió el cliente', await page.evaluate(() => window.__aci.filter(e => e.type === 'FABRIC_SELECTED').at(-1).payload.auto), false);
  // La conversación no le pasa por encima: el panel termina antes de su cabeza (banda
  // reservada) y ella sigue delante — la capa fija con z-index manda sobre el panel,
  // que en la barra es estático.
  await page.click('.journey .help-card [data-open-chat]');
  await page.waitForTimeout(500);
  check('el chat no la tapa: el panel termina por encima de su cabeza', await page.evaluate(() => {
    const st = document.getElementById('assistantStage');
    const r = document.getElementById('chatPanel').getBoundingClientRect();
    const banda = getComputedStyle(document.querySelector('.journey')).getPropertyValue('--chat-band').trim();
    return {
      sigueEnPie: Number(st.dataset.headY) > 0,
      terminaAntesDeSuCabeza: Math.round(r.bottom) <= Number(st.dataset.headY),
      dejaSitioParaLaConversacion: Math.round(r.height) >= 150,
      conBandaDeclarada: /px$/.test(banda)
    };
  }), { sigueEnPie: true, terminaAntesDeSuCabeza: true, dejaSitioParaLaConversacion: true, conBandaDeclarada: true });
  check('y ella sigue delante de la conversación', await page.evaluate(() => {
    const st = getComputedStyle(document.getElementById('assistantStage'));
    const panel = getComputedStyle(document.getElementById('chatPanel'));
    return { capa: st.position, delante: st.zIndex, panel: panel.position, panelZ: panel.zIndex };
  }), { capa: 'fixed', delante: '3', panel: 'static', panelZ: 'auto' });
}
await page.evaluate(([k, v]) => { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }, [KEY, savedBeforeCorrupt]);

console.log('\nRESTABLECER VUELVE AL ASISTENTE DEL PAQUETE');
await openAssistant();
await page.click('#resetAssistant');
await page.waitForSelector('#confirmModal.open');
await page.click('#confirmCancel');
check('cancelar no borra nada', JSON.parse(await stored()).name, 'Camilo');
await page.click('#resetAssistant');
await page.waitForSelector('#confirmModal.open');
await page.click('#confirmOk');
await page.waitForFunction(() => document.getElementById('toast').classList.contains('show'));
check('confirmar borra la personalización', await stored(), null);
check('el formulario vuelve a los valores del paquete', await form(),
  { enabled: String(DEF.enabled), character: DEF.character, name: DEF.name, brandSuit: String(DEF.brandSuit) });
await page.evaluate(() => { Store.saveAssistant({ name: 'Camilo' }); Store.markAssistantWelcomed(); Store.reset(); });
check('"Restablecer datos de demo" también la borra, y la bienvenida vuelve', [await stored(), await page.evaluate(() => Store.assistantWelcomed())], [null, false]);

console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'none'));
if (errs.length) fails++;
await b.close();
console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
process.exit(fails ? 1 : 0);
