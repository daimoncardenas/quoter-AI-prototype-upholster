/* Comprobación del spike completo: la página tiene que cargar como módulo, armar el contexto con el
 * negocio + el catálogo + el formulario, correr una conversación entera con el sustituto, tapar el turno
 * que rompe el cerco, y dejar evaluar texto a mano. Sin modelo: aquí no hay.
 *
 *   node spikes/001-ia-local-navegador/smoke.mjs
 */
import { chromium } from 'playwright';
const URL = process.env.SPIKE_URL || 'http://127.0.0.1:4173/';
const b = await chromium.launch();
const p = await b.newPage();
const errores = [];
p.on('pageerror', e => errores.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errores.push('console: ' + m.text()); });
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForTimeout(600);

const cap = (await p.innerText('#capacidad')).trim();
const sistema = await p.textContent('#sistema');
console.log('\nCAPACIDAD: ' + cap);
console.log('CONTEXTO armado: ' + (sistema.includes('LO QUE SABES DEL NEGOCIO') && sistema.includes('LO QUE EL CLIENTE YA PUSO') && sistema.includes('SERVICIOS DE LA CASA') ? 'negocio + catálogo + formulario ✓' : 'INCOMPLETO ✗'));
console.log('  · líneas del catálogo en el contexto: ' + (sistema.match(/SERVICIOS DE LA CASA: (.*)/) || [])[1]);
console.log('  · sedes declaradas: ' + (sistema.match(/Sede \w+/g) || []).join(', '));

await p.click('#preguntar');
await p.waitForTimeout(1200);
const preguntas = await p.$$eval('.q', els => els.map(e => ({ q: e.querySelector('b').textContent, a: e.querySelector('[id^=r]').innerText.replace(/\s+/g, ' ').slice(0, 150), chips: [...e.querySelectorAll('.chip')].map(c => c.textContent) })));
console.log('\nPREGUNTAS (la primera y la del taller):');
for (const i of [0, 6, 7]) console.log(`  · ${preguntas[i].q}\n      ${preguntas[i].a}`);

const botones = await p.$$('[data-conv]');
await botones[0].click(); await p.waitForTimeout(900);
const hilo0 = await p.$$eval('#hilo0 .turno', els => els.map(e => e.innerText.replace(/\s+/g, ' ')));
console.log('\nCONVERSACIÓN 1 (sede y horario):');
hilo0.forEach(t => console.log('   ' + t));
await botones[4].click(); await p.waitForTimeout(900);
const hilo4 = await p.$$eval('#hilo4 .turno', els => els.map(e => e.innerText.replace(/\s+/g, ' ')));
console.log('\nCONVERSACIÓN 5 (intenta sacar una promesa):');
hilo4.forEach(t => console.log('   ' + t));

for (const frase of ['necesito plátanos para el techo', '¿he cometido algún error al diligenciar el formulario?', 'El relleno te sale por $ 350.000 más']) {
  await p.fill('#manual', frase);
  await p.click('#evaluar'); await p.waitForTimeout(120);
  console.log(`\nCERCO A MANO · «${frase}»\n   ` + (await p.innerText('#veredicto-manual')).replace(/\n+/g, ' | '));
}

console.log('\npage errors: ' + (errores.length ? errores.join(' | ') : 'ninguno'));
await b.close();
process.exit(errores.length ? 1 : 0);
