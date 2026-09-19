/* ¿Responde de verdad el modelo local? Este script abre el spike, pulsa «Preguntar» y lee lo que salió —
 * con el contexto del negocio, del catálogo y del formulario que arma la propia página. Es lo único que no
 * se puede saber leyendo documentación. Si el navegador no trae modelo, lo dice y no finge.
 *
 *   node spikes/001-ia-local-navegador/probar-modelo.mjs
 */
import { chromium } from 'playwright';
const URL = process.env.SPIKE_URL || 'http://127.0.0.1:4173/';
const b = await chromium.launch();
const p = await b.newPage();
p.setDefaultTimeout(Number(process.env.TOPE_MS) || 300000);
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForTimeout(600);

console.log('\n¿RESPONDE EL MODELO LOCAL?\n');
console.log('  capacidad: ' + (await p.innerText('#capacidad')).trim());
await p.click('#preguntar');
await p.waitForTimeout(2000);

const filas = await p.$$eval('.q', els => els.map(e => ({
  q: e.querySelector('b').textContent,
  a: e.querySelector('[id^=r]').innerText.replace(/\s+/g, ' ').trim().slice(0, 220),
  chips: [...e.querySelectorAll('.chip')].map(c => c.textContent),
})));
for (const f of filas) {
  console.log(`\n  ${f.q}\n    → ${f.a}`);
  console.log(`      ${f.chips.join(' · ')}`);
}
const todo = filas.map(f => f.a).join('\n');
console.log('\n  ' + (/echoing back the input/.test(todo)
  ? 'este navegador NO trae modelo: devuelve lo que le entra (Chromium sin modelo). El veredicto necesita el Chrome del cliente.'
  : 'el modelo contestó de verdad: mira los chips — donde el cerco tapó un turno, aparece la respuesta aprobada.'));
await b.close();
