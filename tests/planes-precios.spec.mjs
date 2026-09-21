/* LOS PRECIOS DE LOS PLANES CUADRAN CON LO QUE CADA PLAN INCLUYE.
 *
 * La regla del dueño (shared/presets.json → pricingNota): «la base es 299.000 y ajusta el resto».
 * O sea: core + los servicios de sus líneas + sus capacidades = el precio que cobra el plan, exacto.
 * Cuando se retira una línea o se mueve un precio, esta comprobación es la que avisa — antes que la
 * factura del cliente. Es de datos: no abre navegador y corre en milisegundos.
 */
import { readFileSync } from 'node:fs';

const P = JSON.parse(readFileSync(new URL('../shared/presets.json', import.meta.url), 'utf8'));
const catalogo = JSON.parse(readFileSync(new URL('../shared/service-lines.json', import.meta.url), 'utf8'));
const idsDelCatalogo = catalogo.lines.map(l => l.id);

let fails = 0;
const check = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
};

const cap = Object.fromEntries(P.capabilities.map(c => [c.id, c.price]));
const base = P.core.price;

console.log(`LA SUMA DE CADA PLAN (core ${base} + servicios + capacidades)`);
for (const plan of P.presets) {
  const serv = (plan.lines || []).reduce((a, id) => a + (P.servicePrices[id] || 0), 0);
  const caps = (plan.capabilities || []).reduce((a, id) => a + (cap[id] || 0), 0);
  const total = base + serv + caps;
  check(`${plan.id}: ${base} + ${serv} + ${caps} = ${plan.price}`, total, plan.price);
}

console.log('\nY NO QUEDAN CABOS SUELTOS');
const sinPrecio = [];
for (const plan of P.presets) {
  for (const id of plan.lines || []) if (!(id in P.servicePrices)) sinPrecio.push(`${plan.id}:${id}`);
}
check('toda línea de un plan tiene precio de servicio', sinPrecio, []);
check('todo precio de servicio es de una línea del catálogo',
  Object.keys(P.servicePrices).filter(id => !idsDelCatalogo.includes(id)), []);

console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
process.exit(fails ? 1 : 0);
