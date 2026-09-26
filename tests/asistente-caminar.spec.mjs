/* EL FLUJO COMPLETO DE RETAPIZADO (dueño, 25/09: «demuéstrame un flujo completo de retapizado desde
 * la primera pantalla hasta crear la precotización, y en cada pantalla verifica que assistantPending
 * === firstMissingFieldOfSemanticSnapshot»).
 *
 * Un cliente ROBOT recorre el cotizador entero —de la elección de la línea a la precotización creada—
 * y en CADA pantalla se comprueba:
 *
 *   · assistantPending === firstMissingFieldOfSemanticSnapshot  (la igualdad que pidió el dueño)
 *   · y que la pregunta que ella dijo sea por ESE campo (no por otro)
 *   · y que ninguna pantalla se quede clavada: si el paso está cerrado, el wizard avanza solo
 *
 * El robot contesta como un cliente: las medidas por el chat (para que las escriba Lía), las listas y
 * las tarjetas con la mano, las fotos de verdad. El modelo va de mentira por `page.route` (la suite no
 * sale a internet) y NO se adelanta: contesta neutro; el trabajo lo hacen el sistema y el robot.
 *
 *   node tests/asistente-caminar.spec.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { PHOTOS_DB } from './client.mjs';

let fails = 0;
const check = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
};

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const RAIZ = resolve('generated');
const sitio = createServer(async (req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (ruta === '/') ruta = '/index.html';
  const archivo = resolve(RAIZ, '.' + ruta);
  if (!archivo.startsWith(RAIZ + sep)) { res.writeHead(403).end('Forbidden'); return; }
  try { const cuerpo = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(cuerpo); }
  catch { res.writeHead(404).end('Not found'); }
});
await new Promise(r => sitio.listen(0, '127.0.0.1', r));
const S = `http://127.0.0.1:${sitio.address().port}/`;

const b = await chromium.launch();
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e && e.stack || e)));
await p.route('**/__ia/**', async route => {
  const url = new URL(route.request().url());
  if (url.pathname === '/__ia/estado') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ api: true, modelo: 'deepseek-flash' }) });
  /* El modelo de mentira NO se adelanta: contesta neutro. El trabajo lo hacen el sistema y el robot. */
  const content = '{"decir": "Perfecto, sigamos con lo del paso.", "valores": {}}';
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content, modelo: 'deepseek-flash' }) });
});
await p.goto(S + 'index.html');
await p.evaluate((db) => { localStorage.clear(); indexedDB.deleteDatabase(db); }, PHOTOS_DB);
/* La precotización se anuncia por `aci:event` (QUOTE_SUBMITTED) y se ve en #requestNumber. */
await p.evaluate(() => {
  window.__cot = null;
  window.addEventListener('aci:event', (e) => {
    if (e && e.detail && e.detail.type === 'QUOTE_SUBMITTED') window.__cot = e.detail.payload && e.detail.payload.quoteId;
  });
});
await p.click('#vozFab');
await p.waitForTimeout(500);

const responder = async (texto) => {
  await p.fill('#vozInput', texto); await p.press('#vozInput', 'Enter');
  for (let k = 0; k < 50; k++) { await p.waitForTimeout(300);
    const libre = await p.evaluate(() => ({ turno: !!voz.turno, hablando: !!vozAudio.hablando }));
    if (!libre.turno && !libre.hablando) break; }
  await p.waitForTimeout(250);
};
/* EL SNAPSHOT SEMÁNTICO de la pantalla y lo que el asistente tiene por pendiente — en una lectura. */
const laPantalla = () => p.evaluate(() => {
  const snap = ACI.losCamposDelPaso();
  const campos = (snap && snap.campos || []).map(f => ({ id: f.id, pregunta: f.pregunta, lleno: f.lleno, aviso: f.aviso || null, tipo: f.tipo, valor: f.valor }));
  const primero = campos.find(f => !f.lleno || f.aviso) || null;
  const asistente = elCampoDeLaPantalla();
  return { paso: snap ? snap.paso : null, titulo: snap ? snap.titulo : null, campos,
    firstMissing: primero, assistantPending: asistente ? { id: asistente.id, campo: asistente.campo, pregunta: asistente.pregunta } : null };
});
const laUltima = () => p.evaluate(() => {
  const m = [...document.querySelectorAll('#vozMessages .message.bot')].slice(-1)[0];
  return m ? m.textContent.replace(/\s+/g, ' ').trim() : '';
});
const conLaMano = (campo) => p.evaluate((c) => {
  const el = elControlDeLaPantalla(c.id); if (!el) return false;
  if (el.tagName === 'SELECT') { const o = [...el.options].find(x => x.value) || el.options[1];
    if (o) { el.value = o.value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; } }
  if (el.getAttribute && el.getAttribute('role') === 'radiogroup') { const x = el.querySelector('[aria-checked]'); if (x) { x.click(); return true; } }
  if (el.type === 'checkbox') { if (!el.checked) el.click(); return true; }
  /* Último recurso: lo que haya DENTRO del control (una casilla, una tarjeta, un botón, su etiqueta).
   * «Mascotas» no es un select ni un grupo de tarjetas y el robot se quedaba sin saber qué tocar — la
   * suite se quedaba dando vueltas en la misma pantalla (medido, 25/09). */
  if (el.querySelector) {
    const x = el.querySelector('input[type=checkbox], input[type=radio], button, [aria-checked], label');
    if (x) { x.click(); return true; }
  }
  return false;
}, campo);
const FOTOS = ['1', '2', '3'].map(n => new URL(`./fixture-sofa-${n}.png`, import.meta.url).pathname);
const subirFotos = async () => {
  const entrada = await p.$('[data-foto-pieza] input[type=file], .photo-strip input[type=file], input[type=file][accept*="image"]');
  if (!entrada) return false;
  await entrada.setInputFiles(FOTOS);
  for (let k = 0; k < 40; k++) { await p.waitForTimeout(400);
    const n = await p.evaluate(() => document.querySelectorAll('.photo-strip .photo-thumb, [data-foto-pieza] .pieza-foto-mini').length);
    if (n >= 3) return true; }
  return false;
};
/* Cómo lo diría un cliente: las medidas por el chat (las escribe Lía), lo demás como salga mejor. */
const contestar = async (campo) => {
  const id = campo.id || '', pregunta = String(campo.pregunta || '').toLowerCase();
  if (/fotos/.test(id)) return (await subirFotos()) ? 'ya subí las fotos' : 'todavía no las tengo';
  if (/\.ctl0$/.test(id) || /mueble de la pieza/i.test(pregunta)) return 'es un sofá';
  if (/\.width$/.test(id)) return 'ancho 200';
  if (/\.height$/.test(id)) return 'alto 90';
  if (/\.depth$/.test(id)) return 'largo 90';
  if (/customerCity|serviceCity|ciudad/i.test(id + pregunta)) return 'Bogotá';
  if (/fullName|nombre/i.test(id + pregunta)) return 'Daimon Cárdenas';
  if (/email|correo/i.test(id + pregunta)) return 'daimon@ejemplo.com';
  if (/phone|celular|whatsapp/i.test(id + pregunta)) return '300 123 4567';
  if (/consent|autoriz/i.test(id + pregunta)) return 'sí, autorizo';
  if (/revis/i.test(pregunta)) return 'revisa';
  if (/metros|cantidad/i.test(pregunta)) return '10';
  if (campo.tipo === 'eleccion' || campo.tipo === 'lista' || /\.ctl\d$/.test(id)) return (await conLaMano(campo)) ? 'listo' : 'sí';
  const hecho = await conLaMano(campo);
  return hecho ? 'listo' : 'no sé, dime tú';
};
/* Cómo debería nombrar su pregunta al campo pendiente (lo que el cliente oye). */
const CLAVES = [
  { id: /(^|\.)width$/, dice: /\b(ancho|frente)\b/i, n: 'el ancho' },
  { id: /(^|\.)height$/, dice: /\b(alto|altura)\b/i, n: 'el alto' },
  { id: /(^|\.)depth$/, dice: /\b(largo|fondo|profundidad)\b/i, n: 'el largo' },
  { id: /^fotos$/, dice: /\bfotos?\b/i, n: 'las fotos' },
  { id: /ctl0$/, dice: /\bmueble|sof[aá]|poltrona|silla/i, n: 'el mueble' },
  { id: /customerCity|serviceCity/, dice: /\bciudad\b/i, n: 'la ciudad' },
  { id: /(^|\.)email$/, dice: /\bcorreo|email\b/i, n: 'el correo' },
  { id: /(^|\.)phone$/, dice: /\bcelular|tel[eé]fono|whatsapp\b/i, n: 'el celular' },
  { id: /nombre$/i, dice: /\bnombre\b/i, n: 'el nombre' },
  { id: /referencia/i, dice: /\btela|referencia|terracota|lino|velvet|nautica|boucl/i, n: 'la tela' },
  { id: /cantidad/i, dice: /\bmetros\b|\bcu[aá]ntos\b|\bm\b/i, n: 'los metros' },
  { id: /consent|autoriz/i, dice: /\bautoriz/i, n: 'la autorización' }
];

try {
  /* LA BIENVENIDA (dueño, 26/09: «lia had a message of welcome... when user open the page... why dont
   * watch this?»): al abrir el chat ella saluda —y saluda distinto cada vez, cuatro maneras— y en la
   * misma pantalla ya pregunta lo que el primer paso está esperando. */
  const alAbrir = await p.evaluate(() => [...document.querySelectorAll('#vozMessages .message.bot')].map(m => m.textContent.replace(/\s+/g, ' ').trim()));
  check('al abrir el chat hay una bienvenida', alAbrir.length >= 1 && /l[íi]a|hola|bienvenid|un gusto/i.test(alAbrir[0] || ''), true);
  console.log('  bienvenida: ' + (alAbrir[0] || '(ninguna)'));
  await responder('necesito retapizar unos muebles');
  const pantallas = [];
  let bloqueo = null, cotizacion = null;
  for (let t = 0; t < 50 && !bloqueo && !cotizacion; t++) {
    const v = await laPantalla();
    if (!v.paso) break;
    if (pantallas[pantallas.length - 1] !== v.paso) {
      pantallas.push(v.paso);
      console.log(`  · pantalla ${v.paso} «${v.titulo}» — campos: ` + v.campos.map(c => c.id + ':' + (c.lleno ? '✔' : '✗')).join(' '));
      console.log(`    pendiente: ${v.assistantPending ? v.assistantPending.id : '(ninguno)'} — ella dijo: ` + (await laUltima()).slice(0, 90));
    }

    /* ── LA IGUALDAD DEL DUEÑO, pantalla por pantalla ───────────────────────────────────────────── */
    check(`paso ${v.paso}: assistantPending === firstMissing del snapshot`,
      v.assistantPending ? v.assistantPending.id : null,
      v.firstMissing ? v.firstMissing.id : null);

    /* ── Y que su pregunta sea por ESE campo —o por la pregunta del paso, que es su contexto legítimo
     * (el rótulo «Mascotas» solo no es una pregunta: ella pregunta lo del paso)— ──────────────── */
    if (v.assistantPending) {
      const clave = CLAVES.find(c => c.id.test(v.assistantPending.id))
        || { dice: new RegExp(((v.assistantPending.pregunta || '').toLowerCase().match(/[a-záéíóúñ]{4,}/g) || ['$^'])[0], 'i'), n: v.assistantPending.pregunta };
      const dice = await laUltima();
      const delPaso = ((String(v.titulo || '').toLowerCase().match(/[a-záéíóúñ]{4,}/g) || []).filter(w => ['como', 'para', 'cual', 'cuando', 'dime', 'este', 'esta'].indexOf(w) < 0)[0]) || '';
      check(`paso ${v.paso}: su pregunta es por ${clave.n}`,
        clave.dice.test(dice) || (delPaso && new RegExp(delPaso, 'i').test(dice)), true);
    }

    /* ── El paso cerrado tiene que avanzar solo; si no, se mira si el CONTRATO pide algo que no se ve
     * (la revisión, el contacto, la autorización — el robot lo contesta) y si tampoco, es un bloqueo ─ */
    if (!v.firstMissing) {
      await p.waitForTimeout(1400);
      const despues = await laPantalla();
      if (despues && despues.paso === v.paso) {
        const pedido = await p.evaluate(() => { try { const f = Contrato.faltantes(mundoDelContrato())[0]; return f ? { id: f.id, etiqueta: f.etiqueta || '' } : null; } catch (e) { return null; } });
        const dicho = await laUltima();
        if (pedido && /revis/i.test(pedido.id + ' ' + pedido.etiqueta)) { await responder('revisa'); continue; }
        /* La TELA se elige hablando (el wizard no se mueve por ella): el cliente dice cuál quiere y el
         * cotizador le saca los metros. */
        if (pedido && /tela|lista/i.test(pedido.id + ' ' + pedido.etiqueta)) { await responder('quiero la terracota'); continue; }
        if (pedido && /autoriz/i.test(pedido.id + ' ' + pedido.etiqueta + ' ' + dicho)) { await responder('sí, autorizo'); cotizacion = await p.evaluate(() => window.__cot); continue; }
        if (pedido && /nombre|correo|celular|contacto/i.test(pedido.id + ' ' + pedido.etiqueta + ' ' + dicho)) {
          await responder('Daimon Cárdenas, daimon@ejemplo.com, 300 123 4567');
          continue;
        }
        const porque = await p.evaluate(() => {
          const faltan = (() => { try { return (Contrato.faltantes(mundoDelContrato())[0] || {}); } catch (e) { return {}; } })();
          const insumos = (() => { try { return { deLaLinea: insumosDeLaLinea().length, marcados: insumosMarcados().length }; } catch (e) { return {}; } })();
          const validacion = (() => { try { return validStep(); } catch (e) { return 'error ' + e; } })();
          return { contratoPide: faltan.id || '(nada)', insumos, validacion };
        });
        bloqueo = { paso: v.paso, titulo: v.titulo, ...porque };
        break;
      }
      continue;
    }

    await responder(await contestar(v.firstMissing));
    cotizacion = await p.evaluate(() => window.__cot);
    /* La autorización puede ser el último pendiente del contrato (ya sin paso visible): se contesta
     * «sí, autorizo» y el cierre manda la precotización. */
    if (!cotizacion) {
      const trasElTurno = await laPantalla();
      if (!trasElTurno.firstMissing) {
        const faltaContrato = await p.evaluate(() => { try { const f = Contrato.faltantes(mundoDelContrato())[0]; return f ? f.id : null; } catch (e) { return null; } });
        if (faltaContrato === 'contacto' || faltaContrato === 'autorizacion') { await responder('sí, autorizo'); cotizacion = await p.evaluate(() => window.__cot); }
      }
    }
  }

  console.log('  pantallas que recorrió: ' + JSON.stringify(pantallas));
  check('recorrió el flujo entero (la primera pantalla y las siguientes)', pantallas.length >= 5, true);
  check('no se bloqueó en ninguna pantalla', bloqueo, null);
  if (bloqueo) console.log(`        se bloqueó en el paso ${bloqueo.paso} «${bloqueo.titulo}» | el contrato pide: ${bloqueo.contratoPide} | insumos: ${JSON.stringify(bloqueo.insumos)} | la validación dice: ${JSON.stringify(bloqueo.validacion)}`);
  const numero = await p.evaluate(() => (document.getElementById('requestNumber') || {}).textContent || '');
  check('la precotización quedó creada (QUOTE_SUBMITTED)', /COT-\d+/.test(String(cotizacion || '')), true);
  check('y el número quedó a la vista en la pantalla', /COT-\d+/.test(numero), true);
  console.log('  precotización: ' + (cotizacion || '(ninguna)'));
  check('sin errores de página', errs, []);
} finally {
  await b.close();
  sitio.close();
}

if (fails) { console.log(`FALLAS: ${fails}`); process.exit(1); }
console.log('TODO PASA — el flujo completo de retapizado llega a la precotización, pantalla por pantalla');
