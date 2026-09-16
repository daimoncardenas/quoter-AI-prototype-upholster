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

console.log('\nGUARDAR PERSONAJE, NOMBRE Y TRAJE LLEGA AL COTIZADOR');
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
check('guarda solo lo que cambió, con el nombre recortado', sorted(JSON.parse(await stored())),
  sorted({ character: other, name: 'Camilo', brandSuit: !DEF.brandSuit }));
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
const effective = () => page.evaluate(() => { try { const a = Store.assistant(); delete a.overridden; return a; } catch (e) { return 'threw: ' + e.message; } });
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

console.log('\nAL APAGARLO SE DETIENE LA SINCRONIZACIÓN DE LA TELA DEL SILLÓN');
// #assistantStage[data-fabric-sync] mirrors the 300 ms interval (see assistant-presence.js).
await page.goto(D + 'index.html');
await page.evaluate(() => { Store.resetAssistant(); Store.markAssistantWelcomed(); });
await page.goto(D + 'index.html');
const syncOn = await page.waitForSelector('#assistantStage[data-fabric-sync="on"]', { timeout: 30000 }).then(() => true, () => false);
check('con el asistente encendido la sincronización corre (requiere WebGL en Chromium)', syncOn, true);
await page.evaluate(() => {
  window.__fabricIntervals = 0;
  const native = window.setInterval;
  window.setInterval = (fn, ms, ...rest) => { if (ms === 300) window.__fabricIntervals++; return native(fn, ms, ...rest); };
  Store.saveAssistant({ enabled: false }); Assistant.apply();
});
check('apagarlo detiene la sincronización', await page.getAttribute('#assistantStage', 'data-fabric-sync'), 'off');
await page.evaluate(() => { Store.saveAssistant({ enabled: true }); Assistant.apply(); });
const syncBack = await page.waitForSelector('#assistantStage[data-fabric-sync="on"]', { timeout: 30000 }).then(() => true, () => false);
await page.evaluate(() => { Assistant.apply(); Assistant.apply(); }); // repeated applies while already on
await page.waitForTimeout(500);
check('reactivarlo la vuelve a correr, con un solo intervalo nuevo', [syncBack, await page.evaluate(() => window.__fabricIntervals)], [true, 1]);
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
