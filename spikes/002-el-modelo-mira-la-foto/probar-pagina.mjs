/* La página del spike se prueba sola: con un modelo de mentira que acepta imágenes (dice que ve un
 * documento) y con uno que las rechaza. Comprueba que la página enseña la verdad de cada caso y que
 * el cerco real la juzga. No prueba la calidad del modelo de verdad —eso solo lo dice el Chrome del
 * equipo, abriendo la página a mano—: prueba que el instrumento no miente. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '../..');
const PUERTO = 4199;
const URL = `http://127.0.0.1:${PUERTO}/spikes/002-el-modelo-mira-la-foto/`;
const FOTO = resolve(RAIZ, 'tests/fixture-sofa-1.png');

let fails = 0;
const check = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)); };

const servidor = spawn('node', [resolve(AQUI, 'serve.mjs')], { cwd: RAIZ, env: { ...process.env, PORT: String(PUERTO) }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 600));
const b = await chromium.launch();

/* ---- 1 · un equipo que sí mira: la página enseña la respuesta y el veredicto del cerco ---- */
{
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true });
    window.__pedido = null;
    window.LanguageModel = { availability: async () => 'available',
      create: async (o) => ({ expectedInputs: o && o.expectedInputs,
        prompt: async (mensajes) => {
          /* Como la API de verdad: mensajes con role y content (el navegador del dueño cazó una
           * petición con las partes sueltas el 19/09). */
          if (!Array.isArray(mensajes) || !mensajes.every(m => m && m.role && Array.isArray(m.content)))
            throw new Error("Failed to read the 'content' property from 'LanguageModelMessage': Required member is undefined.");
          window.__pedido = mensajes;
          return 'Veo un documento con texto, no un mueble: no puedo decir nada del mueble declarado.';
        }, destroy(){} }) };
  });
  await p.goto(URL); await p.waitForTimeout(700);
  check('con modelo, la página dice que el equipo sabe mirar',
    (await p.innerText('#creacion')).includes('aceptada'), true);
  await p.setInputFiles('#file', FOTO);
  await p.waitForTimeout(500);
  await p.click('#mirar');
  await p.waitForFunction(() => /documento/.test(document.getElementById('respuesta').innerText), null, { timeout: 5000 }).catch(()=>{});
  check('y enseña la respuesta cruda del modelo',
    (await p.innerText('#respuesta')).includes('documento'), true);
  check('y la petición va en mensajes con role y content, no en partes sueltas',
    await p.evaluate(() => Array.isArray(window.__pedido) && window.__pedido.every(m => m.role && Array.isArray(m.content))), true);
  check('y el cerco real la deja limpia (se mostraría al cliente)',
    (await p.innerText('#cerco')).includes('limpia'), true);
  check('la página no lanza errores', errs, []);
  await p.close();
}

/* ---- 2 · un equipo que NO mira: la página lo dice, no lo esconde ---- */
{
  const p = await b.newPage();
  await p.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true });
    window.LanguageModel = { availability: async () => 'available',
      create: async () => { throw new Error('no images for you'); } };
  });
  await p.goto(URL); await p.waitForTimeout(700);
  const texto = await p.innerText('#creacion');
  check('sin visión, la página lo dice con el error del navegador',
    /rechazada/.test(texto) && /no images for you/.test(texto), true);
  check('y explica qué hará el cotizador en ese caso',
    texto.includes('no está activada'), true);
  check('y la disponibilidad con imagen se enseña aparte, con su valor',
    /\w/.test(await p.innerText('#disponibilidad-imagen')), true);
  await p.close();
}

/* ---- 3 · la variante por descargar: el botón la baja aquí, con su progreso ---- */
{
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true });
    let bajada = false;
    window.LanguageModel = {
      availability: async (o) => (o && o.expectedInputs) ? (bajada ? 'available' : 'downloadable') : 'available',
      create: async (o) => {
        if (o && o.monitor) {
          const m = new EventTarget(); o.monitor(m);
          const ev = new Event('downloadprogress'); ev.loaded = 0.5; m.dispatchEvent(ev);
          await new Promise(r => setTimeout(r, 600));   // para poder leer el progreso a mitad
          bajada = true;
        }
        return { prompt: async () => 'ok', destroy(){} };
      }
    };
  });
  await p.goto(URL); await p.waitForTimeout(600);
  check('con la variante por descargar, el botón queda disponible',
    await p.evaluate(() => document.getElementById('preparar').disabled), false);
  await p.click('#preparar');
  await p.waitForTimeout(250);
  check('y al pulsarlo enseña el progreso que reporta el navegador',
    /descargando: 50%/.test(await p.innerText('#descarga')), true);
  await p.waitForTimeout(900);
  check('y al terminar dice que quedó lista, y la disponibilidad ya es la buena',
    /quedó descargada/.test(await p.innerText('#descarga')) && /available/.test(await p.innerText('#disponibilidad-imagen')), true);
  check('esta página tampoco lanza errores', errs, []);
  await p.close();
}

b.close(); servidor.kill();
console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
process.exit(fails ? 1 : 0);
