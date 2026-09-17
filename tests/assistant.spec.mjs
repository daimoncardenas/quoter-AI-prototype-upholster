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
import { client, slug, userEmail } from './client.mjs';
import { openAdmin } from './helpers.mjs';
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

const b = await chromium.launch();
const errs = [];
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', e => errs.push(String(e)));
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
  await page.goto(D + 'index.html');
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
check('el aviso dice desde qué plan', (await page.textContent('#assistantLockedText')).includes('desde el plan Professional'), true);
check('todos los controles están deshabilitados y describidos por el aviso', await controls(), Array(7).fill([true, 'assistantLockedText']));
check('muestra los valores efectivos (los del paquete)', await form(),
  { enabled: String(DEF.enabled), character: DEF.character, name: DEF.name, brandSuit: String(DEF.brandSuit) });
check('Store.saveAssistant se niega en Essential', await page.evaluate(() => { try { Store.saveAssistant({ name: 'Camilo' }); return 'saved'; } catch (e) { return e.message; } }),
  'La presencia del asistente se configura desde el plan Professional.');
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
  check('guarda solo lo que cambió, con el nombre recortado', sorted(JSON.parse(raw)),
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
await page.goto(D + 'index.html');
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
await page.goto(D + 'index.html');
await page.evaluate(() => { Store.resetAssistant(); Store.markAssistantWelcomed(); });
await page.goto(D + 'index.html');
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
  const c = document.querySelectorAll('.furniture-card')[1];
  return { name: c.dataset.furniture, id: (furnitureRules[c.dataset.furniture] || {}).id };
});
await page.click('.furniture-card:nth-child(2)');
check('elegir un mueble publica el tipo y su id, no un clic', await ultimo('FURNITURE_SELECTED'), { furniture: mueble.name, furnitureId: mueble.id });
await page.setInputFiles('#furniturePhoto', TRES);
await page.waitForFunction(() => state.photos.length === 3);
check('subir fotos publica cuántas hay', await ultimo('PHOTOS_CHANGED'), { count: 3 });
await page.click('#nextButton');
check('cambiar de paso publica cuál, con su id y su nombre', await ultimo('STEP_CHANGED'), { step: 2, id: 'MEASUREMENTS', name: 'Medidas' });
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
check('el paso 3 se anuncia igual', await ultimo('STEP_CHANGED'), { step: 3, id: 'PREFERENCES', name: 'Preferencias' });
const chip = await page.evaluate(() => { const i = document.querySelectorAll('.chip-grid input')[0]; i.click(); return i.value; });
check('marcar una preferencia publica cuál y cómo', await ultimo('PREFERENCES_CHANGED'), { field: 'needs', option: chip, checked: true });
await page.selectOption('#style', { index: 0 });
check('cambiar un selector publica el campo y su valor', (await ultimo('PREFERENCES_CHANGED')).field, 'style');

console.log('\nSIN LA AUTORIZACIÓN MARCADA EL ASISTENTE NO VE DATOS PERSONALES');
check('lo que puede leer es el estado del cotizador, y nada más', await page.evaluate(() => Object.keys(ACI.context()).sort()),
  ['analysis', 'consent', 'currentStep', 'estimate', 'fabric', 'measurements', 'photos', 'preferences', 'selectedFurniture', 'submitted', 'tenant']);
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

console.log('\nLA CONVERSACIÓN VIVE EN LA BARRA, NO ENCIMA DEL COTIZADOR');
await page.goto(D + 'index.html');
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
await page.goto(D + 'index.html');
await page.click('.chat-fab');
await page.waitForTimeout(300);
check('en el celular el panel vuelve a flotar y la barra no se dibuja', await page.evaluate(() => {
  const panel = document.getElementById('chatPanel');
  const j = document.querySelector('.journey');
  return [panel.classList.contains('open'), getComputedStyle(panel).position, getComputedStyle(j).display, Math.round(j.getBoundingClientRect().height)];
}), [true, 'fixed', 'block', 0]);
await page.setViewportSize({ width: 1440, height: 900 });

console.log('\nLA PRESENCIA REACCIONA A LOS EVENTOS REALES (SI LA CAPA 3D ARRANCA)');
await page.goto(D + 'index.html');
const stageOk = await page.waitForSelector('#assistantStage.ready', { timeout: 30000 }).then(() => true, () => false);
const skip = n => console.log(`  SKIP  ${n}  (la capa 3D no arrancó en este navegador)`);
if (!stageOk) {
  skip('una acción del cliente produce una reacción, y la siguiente se suprime');
  skip('el sillón viste la tela de la cotización, sin sondeos');
} else {
  await page.evaluate(() => { window.__aci = []; addEventListener('aci:event', e => window.__aci.push(e.detail)); });
  check('arranca sin tela y sin «pensar»', await page.getAttribute('#assistantStage', 'data-chair-fabric'), '');
  await page.click('.furniture-card:nth-child(2)');
  await page.waitForFunction(() => document.getElementById('assistantStage').dataset.reactions === '1');
  check('una acción del cliente, una reacción', await page.getAttribute('#assistantStage', 'data-reaction'), 'look-selection');
  check('y mira lo que acaba de tocar', await page.getAttribute('#assistantStage', 'data-glance'), 'selection');
  await page.click('.furniture-card:nth-child(1)');
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
      texto: bub.querySelector('.bubble-text').textContent,
      sobreSuCabeza: hueco >= 2 && hueco <= 14,
      barraGuardada: getComputedStyle(intro).opacity === '0' && getComputedStyle(pasos).opacity === '0',
      pasosNoRecibenClic: (() => {
        const punto = document.elementFromPoint(60, Math.round(pasos.getBoundingClientRect().top) + 12);
        return !(punto && punto.closest && punto.closest('.step-list'));
      })(),
      sinReacomodo: Math.round(Number(document.getElementById('assistantStage').dataset.crown)) === coronilla,
      dentroDeLaBarra: r.left >= jr.left - 1 && r.right <= jr.right + 1 && r.right <= w.left + 1
    };
  }, [nombreAsistente, coronilla]), { visible: true, quien: true, texto: 'Encontré algo en tus medidas. Tócame para verlo.', sobreSuCabeza: true, barraGuardada: true, pasosNoRecibenClic: true, sinReacomodo: true, dentroDeLaBarra: true });
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
