/* EL SEGUIMIENTO DE LA CONVERSACIÓN — Playwright habla con la asistente y deja, turno por turno, lo
 * que pasó: la captura de la pantalla, lo que dijo el cliente, lo que decidió el modelo (su JSON), lo
 * que entró de verdad al formulario y lo que falta. Es el «cómo va» que se puede mirar y mostrar.
 *
 * Dueño, 25/09: «we can use playwright… for your verification… and if you can show this screenshots
 * and process when the user speak… would be great».
 *
 *   node tools/seguir-conversacion.mjs                       → guion de ejemplo, contra :3000 (modelo real)
 *   node tools/seguir-conversacion.mjs "quiero cotizar telas" "vivo en Cali"
 *   node tools/seguir-conversacion.mjs --url http://127.0.0.1:3000/index.html -- "frase 1" "frase 2"
 *
 * Contra :3000 hace falta que el servidor esté encendido (el modelo real vive ahí); sin modelo, la
 * asistente contesta con el respaldo y el seguimiento lo dice (`respaldo: true`). El resultado queda en
 * `generated/seguimiento/`: una captura por turno y un `seguimiento.md` con el proceso completo.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const iUrl = args.indexOf('--url');
const URL = iUrl >= 0 ? args[iUrl + 1] : 'http://127.0.0.1:3000/index.html';
const guion = args.filter((a, i) => a !== '--url' && i !== iUrl + 1);
const TURNOS = guion.length ? guion : [
  'gracias sí necesito retapizar un mueble me gustaría cotizar',
  'Claro que sí Dame un momento y ya subo las fotos',
  'el sofá es de mi mamá, vivo en Manizales y el servicio es en Manizales',
  'de largo 210 de alto 85 de fondo 90'
];
const SALIDA = resolve('generated/seguimiento');
mkdirSync(SALIDA, { recursive: true });
const ahora = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errores = [];
p.on('pageerror', e => errores.push(String(e && e.message || e)));
await p.goto(URL, { waitUntil: 'load' });
await p.evaluate(() => localStorage.clear());
await p.waitForTimeout(900);
const modelo = await p.evaluate(async () => { try { return await (await fetch('/__ia/estado')).json(); } catch (err) { return { api: false }; } });
await p.click('#vozFab');
await p.waitForTimeout(1200);

const lineas = [];
const push = t => { lineas.push(t); console.log(t); };
push(`# Seguimiento de la conversación — ${ahora}`);
push('');
push(`- Página: ${URL}`);
push(`- Modelo: ${modelo.api ? 'la API (' + (modelo.modelo || '') + ')' : 'el RESPALDO de la página (sin API: contesta el guion)'}`);
push(`- Turnos: ${TURNOS.length}`);
push('');

for (let i = 0; i < TURNOS.length; i++) {
  const dicho = TURNOS[i];
  await p.fill('#vozInput', dicho);
  await p.press('#vozInput', 'Enter');
  for (let k = 0; k < 90; k++) { if (await p.evaluate(() => voz.turno === false)) break; await p.waitForTimeout(250); }
  await p.waitForTimeout(800);
  const visto = await p.evaluate(() => {
    const t = voz.ultimoTurno || {};
    const limpio = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return {
      decir: limpio(t.decir), valores: t.valores, aplicados: t.aplicados || [], respaldo: !!t.respaldo,
      despues: [...document.querySelectorAll('#vozMessages .message')].slice(-2).map(m => (m.classList.contains('bot') ? 'LÍA: ' : 'CLIENTE: ') + limpio(m.textContent).slice(0, 220)),
      campo: voz.campo, paso: state.step,
      faltan: Contrato.faltantes(mundoDelContrato()).map(f => f.id),
      declarado: {
        linea: (state.service || {}).label || '', ruta: state.ruta || '', mueble: state.furniture || '',
        medidas: ['width', 'height', 'depth'].map(x => (document.getElementById(x) || {}).value || '').filter(Boolean).join(' × '),
        ciudades: [['customerCity', 'customerCityOther'], ['serviceCity', 'serviceCityOther']]
          .map(([sel, otra]) => {
            const s = document.getElementById(sel); const v = s ? s.value : '';
            const nombre = document.getElementById(otra);
            return v === '__otra__' ? ((nombre && nombre.value) || 'otra') : (v ? (s.selectedOptions[0] || {}).textContent || v : '');
          }).filter(Boolean).join(' / ')
      }
    };
  });
  const archivo = `${String(i + 1).padStart(2, '0')}-turno-${ahora}.png`;
  await p.screenshot({ path: resolve(SALIDA, archivo) });
  push(`## Turno ${i + 1} — «${dicho}»`);
  push('');
  push(`![turno ${i + 1}](<${archivo}>)`);
  push('');
  push(`- **El modelo decidió**${visto.respaldo ? ' (respaldo, sin modelo)' : ''}: ${visto.decir ? '«' + visto.decir + '»' : '—'}`);
  if (visto.valores && Object.keys(visto.valores).length) push(`- **Valores que mandó**: \`${JSON.stringify(visto.valores)}\``);
  push(`- **Entró al formulario**: ${visto.aplicados.length ? visto.aplicados.map(x => '`' + x + '`').join(', ') : 'nada'}`);
  push(`- **Lo declarado ahora**: línea «${visto.declarado.linea || '—'}» · camino «${visto.declarado.ruta || '—'}» · mueble «${visto.declarado.mueble || '—'}» · medidas ${visto.declarado.medidas || '—'} · ciudades ${visto.declarado.ciudades || '—'}`);
  push(`- **Falta**: ${visto.faltan.join(', ') || 'nada'} · **paso del wizard**: ${visto.paso}`);
  push(`- Ella contestó: ${visto.despues.filter(x => x.startsWith('LÍA:')).join(' / ') || '—'}`);
  push('');
  console.log(`   → captura ${archivo}`);
}

if (errores.length) { push('## Errores de página'); push(''); errores.slice(0, 8).forEach(e => push('- ' + e.slice(0, 200))); }
writeFileSync(resolve(SALIDA, `seguimiento-${ahora}.md`), lineas.join('\n'));
console.log('\nSeguimiento en ' + SALIDA + '/seguimiento-' + ahora + '.md (y las capturas al lado)');
await b.close();
