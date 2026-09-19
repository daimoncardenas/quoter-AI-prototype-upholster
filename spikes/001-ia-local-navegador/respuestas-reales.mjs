/* LAS RESPUESTAS REALES DEL MODELO — juicio del cerco sobre lo que el modelo del Chrome del cliente
 * contestó de verdad (archivo `resultado-*.json` del 2026-09-19T01-15-30, navegador Chrome 153 en
 * Windows). Esto no es un simulacro: es el único material del spike que no escribí yo.
 *
 * Estas respuestas quedan como FIXTURE: si mañana el cerco empieza a marcar respuestas honestas, o a
 * dejar pasar promesas, se ve aquí, con texto que no inventamos nosotros.
 *
 *   node spikes/001-ia-local-navegador/respuestas-reales.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { cerco } from './comun.mjs';

const dir = new URL('.', import.meta.url);
const archivos = readdirSync(dir).filter(f => /^resultado-.*\.json$/.test(f)).sort();
const archivo = process.env.RESULTADO || archivos[archivos.length - 1];
const datos = JSON.parse(readFileSync(new URL(archivo, dir), 'utf8'));
const respuestas = datos.tipo === 'preguntas' ? datos.dato : datos.dato.turnos;

console.log(`\nLAS RESPUESTAS DEL MODELO, JUZGADAS POR EL CERCO`);
console.log(`  archivo: ${archivo}`);
console.log(`  navegador: ${/Windows/.test(datos.maquina) ? 'Chrome en Windows (el del cliente)' : datos.maquina.slice(0, 60)}`);
console.log(`  ${respuestas.length} respuestas\n`);

/* Lo que la empresa declaró en empresa.json: solo formas de pago. */
const permitido = { formasDePago: true };
let marcadas = 0;
for (const r of respuestas) {
  const texto = r.modelo || '';
  const v = cerco(texto, permitido);
  const fallos = [...v.cifras.map(c => 'cifra " ' + c), ...v.promesas, ...v.tema];
  if (fallos.length) marcadas++;
  console.log(`  ${fallos.length ? 'MARCA' : 'OK   '}  ${r.quien || r.dice}`);
  if (fallos.length) {
    console.log(`         ${fallos.join(' · ')}`);
    console.log(`         texto: ${texto.slice(0, 150)}`);
  }
}
console.log(`\n  ${respuestas.length} respuestas del modelo · ${marcadas} marcadas por el cerco · ${respuestas.length - marcadas} limpias`);
console.log('  Si una respuesta honesta aparece marcada, el problema es la lista, no el modelo.\n');
process.exit(0);
