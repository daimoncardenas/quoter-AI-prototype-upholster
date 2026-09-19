/* EL CERCO — las mismas reglas que usan la página y las conversaciones (viven en `comun.mjs`, en un solo
 * lugar: dos listas se separan con el tiempo). Aquí se le pegan respuestas escritas como las escribiría un
 * modelo, para ver qué deja pasar y qué no. Sin navegador y sin modelo: esto prueba el guardián, no al
 * que habla.
 *
 *   node spikes/001-ia-local-navegador/fence.mjs
 */
import { cerco } from './comun.mjs';

/* La empresa declarada en `empresa.json`: solo las formas de pago. Ni transporte, ni plazos, ni garantía,
 * ni descuentos — así que afirmar cualquiera de esas cosas queda bloqueado. */
const permitido = { formasDePago: true };

const RESPUESTAS = [
  ['otra cosa, sin cifras ni promesas (el que pasó en la página)', 'necesito plátanos para el techo'],
  ['honesta: el relleno queda para el asesor',
    'El relleno y la espuma todavía no entran en el valor: tu estimación cubre tela y mano de obra, y un asesor confirma esa parte contigo.'],
  ['inventa un precio para el relleno',
    'El relleno te sale por $ 350.000 más y lo podemos sumar hoy mismo.'],
  ['promete transporte',
    'Sí, te lo recogemos a domicilio sin costo en la ciudad.'],
  ['vende la cifra como definitiva',
    'Ese es el precio final de tu sofá, no cambia.'],
  ['desvía bien a otro motivo',
    'La limpieza a fondo es Mantenimiento y limpieza, otro motivo: si quieres te llevo a ese paso y dejas Retapizado para la tela.'],
  ['mezcla: dice lo correcto y algo prohibido',
    'La espuma ya queda incluida en el valor y te lo entregamos en 5 días.'],
  ['contesta con los datos del negocio',
    'Estamos en Sede Centro, Calle 45 # 12-30, y entre semana abrimos de 8:00 a 18:00.'],
];

console.log('\nEL CERCO, SOBRE RESPUESTAS ESCRITAS COMO LAS DE UN MODELO LOCAL');
console.log('  estimación vigente: $ 1.780.000 – $ 1.993.600  (toda cifra fuera de eso es inventada)');
console.log('  la empresa NO ha declarado: transporte, plazos, garantía, descuentos\n');
let cazadas = 0;
for (const [caso, texto] of RESPUESTAS) {
  const r = cerco(texto, permitido);
  if (!r.limpia) cazadas++;
  console.log(`  ${r.limpia ? 'PASA' : 'MAL '}  ${caso}`);
  if (r.cifras.length) console.log(`        cifras que no son de su estimación: ${r.cifras.join(', ')}`);
  if (r.promesas.length) console.log(`        promesas no declaradas: ${r.promesas.join(' · ')}`);
  if (r.tema.length) console.log(`        no responde: ${r.tema.join(' · ')}`);
}
console.log(`\n  ${RESPUESTAS.length} respuestas · ${cazadas} cazadas · ${RESPUESTAS.length - cazadas} limpias`);
console.log('  El cerco no escribe y no entiende: juzga lo que se puede juzgar con una lista.');
console.log('  El texto lo pone el modelo, la lista decide qué puede pasar, y una persona cierra.\n');
process.exit(cazadas === 5 ? 0 : 1);
