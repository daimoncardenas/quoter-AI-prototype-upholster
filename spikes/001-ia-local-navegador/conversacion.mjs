/* CONVERSACIÓN DE VARIOS TURNOS — la prueba que faltaba. No hay modelo aquí: el que responde es un
 * SUSTITUTO que contesta con los datos del negocio y que, a propósito, rompe el cerco en un turno para
 * ver si la red de seguridad se activa. Cuando esto corra en el Chrome del cliente (index.html, sección
 * 4), el que responde es el modelo local y los checks son exactamente los mismos.
 *
 *   node spikes/001-ia-local-navegador/conversacion.mjs
 */
import { readFileSync } from 'node:fs';
import { cerco, PATRONES, contexto, CONVERSACIONES, cumple, aprobadaPara, crearSustituto, FORMULARIO_DEMO } from './comun.mjs';

const dir = new URL('.', import.meta.url);
const empresa = JSON.parse(readFileSync(new URL('empresa.json', dir), 'utf8'));
const catalogo = JSON.parse(readFileSync(new URL('../../shared/service-lines.json', dir), 'utf8'));
const lineas = catalogo.lines;
const linea = { label: 'Retapizado de muebles', artefacto: 'Precotización de retapizado' };
const formulario = FORMULARIO_DEMO;

const SISTEMA = contexto({ empresa, lineas, linea, formulario });
const permitido = Object.fromEntries(Object.entries(empresa.declarado).map(([k, v]) => [k, v !== null]));

const sustituto = crearSustituto({ empresa, formulario });

/* Las respuestas aprobadas NOMBRAN lo prohibido para negarlo («la garantía te la confirma un asesor»).
 * El cerco estricto —el que juzga al modelo— las marcaría, y por eso no juzga el texto de la casa: de
 * una respuesta aprobada se comprueba lo que no admite matices — cifras que no sean la estimación,
 * afirmar que tocó el precio o los metros, y vender la estimación como definitiva. La palabra está,
 * la promesa no: distinguirlo es justamente lo que una lista de patrones no sabe hacer. */
const casa = (t) => ({ cifras: cerco(t, permitido).cifras, toca: PATRONES.tocar.test(t), definitivo: PATRONES.definitivo.test(t) });

/* Un turno: lo que dijo el modelo, lo que dijo el cerco, lo que finalmente se muestra. */
function turno({ dice, debe }, { log = true } = {}) {
  const propuesta = sustituto(dice);
  const revision = cerco(propuesta, permitido);
  const falta = cumple(propuesta, debe, { empresa, formulario });
  const cae = !revision.limpia || !!falta;
  const mostrada = cae ? aprobadaPara(dice) : propuesta;
  const deLaCasa = casa(mostrada);
  const limpia = !deLaCasa.cifras.length && !deLaCasa.toca && !deLaCasa.definitivo;
  if (log) {
    console.log(`    cliente: ${dice}`);
    console.log(`    modelo : ${propuesta}`);
    console.log(`      cerco: ${revision.limpia ? 'limpia' : 'ROMPE → ' + [...revision.cifras.map(c => 'cifra ' + c), ...revision.promesas, ...revision.tema].join(' · ')}` +
                (falta ? `\n      contexto: falta → ${falta}` : ''));
    if (cae) console.log(`    se muestra (respuesta aprobada): ${mostrada}`);
    console.log(`      la que sale, ¿es segura? ${limpia ? 'sí' : 'NO'}`);
  }
  return { cae, propuesta, mostrada, limpia };
}

let fallos = 0;
console.log('\nCONVERSACIÓN DE VARIOS TURNOS — lo que el asistente lee: negocio + catálogo + formulario');
console.log(`  empresa: ${empresa.nombre} · ${empresa.sedes.length} sedes · declarado: ${Object.entries(empresa.declarado).filter(([, v]) => v !== null).map(([k]) => k).join(', ')}`);
console.log(`  la empresa NO ha declarado: ${Object.entries(empresa.declarado).filter(([, v]) => v === null).map(([k]) => k).join(', ')}\n`);

for (const conv of CONVERSACIONES) {
  console.log(`  «${conv.quien}»`);
  let sustos = 0;
  for (const t of conv.turnos) {
    const r = turno(t);
    if (r.cae) sustos++;
    if (!r.limpia) { fallos++; console.log('      ↑ la respuesta mostrada NO es segura: eso es un fallo'); }
  }
  console.log(`    → ${conv.turnos.length} turnos · ${sustos} turno(s) tuvieron que sustituirse por una respuesta aprobada\n`);
}

console.log('  EL CERCO ES DATA-DRIVEN: el mismo turno, con la empresa declarando el transporte o no');
const turnoPromesa = { dice: '¿me lo recogen en la casa?', debe: 'sinpromesa' };
for (const [caso, emp] of [
  ['sin declarar transporte', empresa],
  ['declarando «Recogida y entrega en Bogotá, $ 80.000»', { ...empresa, declarado: { ...empresa.declarado, transporte: 'Recogida y entrega en Bogotá, $ 80.000' } }],
]) {
  const permit = Object.fromEntries(Object.entries(emp.declarado).map(([k, v]) => [k, v !== null]));
  const r = cerco(sustituto(turnoPromesa.dice), permit);
  console.log(`    ${caso.padEnd(48)} → ${r.promesas.length ? 'queda bloqueado: ' + r.promesas.join(' · ') : 'todo permitido'}`);
}
console.log(`\n  ${fallos ? fallos + ' FALLAN' : 'TODO PASA'} · el sustituto rompe el cerco a propósito en un turno, y la red lo tapa\n`);
process.exit(fallos ? 1 : 0);
