/* CADA PACK, COMPROBADO EN DATOS (segundos, sin navegador).
 *
 * Lo que este chequeo cuida es lo único que cambia entre empresas: que el paquete de cada una
 * genere, que su marca quede en su salida y que NADA de otra empresa se filtre ahí. La lógica del
 * cotizador no se re-prueba por cliente: eso lo hace la suite principal (`npm test`), que corre
 * igual con cualquier pack.
 *
 * Antes esto era un spec con Playwright (49 comprobaciones, minutos). El login y el ida-y-vuelta
 * backoffice → cotizador que miraba son LÓGICA y ya están en la suite principal (`auth.spec`,
 * `wiring.spec`): aquí queda lo que de verdad es por pack, leído del HTML generado.
 */
import { generate } from '../tools/generate.mjs';
import { loadClientPack, listAvailableClients } from '../tools/client-pack.mjs';
import { readFileSync, rmSync } from 'node:fs';

let fails = 0;
const check = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${n}` + (ok?'':`\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
};

const SLUGS = listAvailableClients();
const t0 = Date.now();
const salidas = {};
for (const slug of SLUGS) {
  const out = `generated-${slug}`;
  generate(slug, out);
  salidas[slug] = readFileSync(`${out}/index.html`, 'utf8') + readFileSync(`${out}/admin.html`, 'utf8');
}

for (const slug of SLUGS) {
  const { client } = loadClientPack(slug);
  const html = salidas[slug];
  const nombre = client.displayName;
  const sello = [
    [nombre, html.includes(nombre)],
    [client.meta.titleIndex, html.includes(client.meta.titleIndex)],
    [client.theme.accent, html.toLowerCase().includes(String(client.theme.accent).toLowerCase())]
  ];
  check(`${slug}: su marca queda en su salida (nombre, título y color)`,
    sello.map(([, ok]) => ok), sello.map(() => true));

  /* Lo que NO puede pasar: que se cuele otra empresa. El nombre y el título son suyos y de nadie
   * más (el color no sirve de aguja: dos packs pueden compartirlo). */
  const ajenos = [];
  for (const otro of SLUGS) {
    if (otro === slug) continue;
    const oc = loadClientPack(otro);
    for (const aguja of [oc.client.displayName, oc.client.meta.titleIndex]) {
      if (aguja && html.includes(aguja)) ajenos.push(`${otro}:${aguja}`);
    }
  }
  check(`${slug}: nada de otro pack se filtra`, ajenos, []);

  /* Y su archivo de logo: se copia al lado de su HTML (nombre por pack, sin pisarse). */
  const logo = client.logo && (client.logo.light || client.logo.dark) || '';
  if (logo) {
    const bytes = (() => { try { return readFileSync(`generated-${slug}/${logo.replace(/^\.\//,'')}`).length; } catch { return 0; } })();
    check(`${slug}: su logo viaja con su paquete`, bytes > 0, true);
  }
}

console.log(`\n${SLUGS.length} packs en ${((Date.now() - t0) / 1000).toFixed(1)} s (sin navegador)`);
for (const slug of SLUGS) rmSync(`generated-${slug}`, { recursive: true, force: true });

console.log(fails ? `\n${fails} FAILING` : '\nALL PASS');
process.exit(fails ? 1 : 0);
