/* EL EMPAQUETADOR DEL FRONTEND (nuestro, sin dependencias).
 *
 * Los módulos de `src/` son ES modules de verdad —un archivo por asunto, `import`/`export`—, pero la
 * página los necesita como UN script clásico por dos razones de esta casa:
 *   1. El prototipo se abre con DOBLE CLIC (`file://`), y ahí el navegador bloquea los módulos ES.
 *   2. La primera pintura llama en el `<head>` a código que tiene que existir ya (el tema/marca).
 *
 * Así que `tools/generate.mjs` usa esto: lee los módulos, resuelve sus `import` relativos, los ordena
 * (una dependencia siempre va antes que quien la usa), les quita las líneas de `import`/`export` y los
 * pega en un solo texto, cada uno con su encabezado. El navegador recibe un script y los archivos siguen
 * separados en el repo: se gana la modularización sin perder el doble clic.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

/* Los `import` que el empaquetador sabe resolver: los relativos (los de un archivo a otro). Un import a
 * un paquete externo (si algún día lo hay) no se toca: se avisa para que se resuelva a mano. */
const IMPORT_RELATIVO = /^\s*import\s+[^;]*?from\s+['"](\.[^'"]+)['"]\s*;?\s*(\/\/.*)?$/gm;
const EXPORT_DE_LISTA = /^\s*export\s*\{[^}]*\}\s*;?\s*(\/\/.*)?$/gm;
/* El `export` puede venir con `async` (una función de arranque asíncrona, como la presencia del
 * asistente): se pela igual que las demás. */
const EXPORT_DIRECTO = /^(\s*)export\s+((?:async\s+)?(?:const|let|var|function|class))\b/gm;

function archivosDe(dir) {
  const salida = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = `${dir}/${e.name}`;
    if (e.isDirectory()) salida.push(...archivosDe(ruta));
    else if (e.name.endsWith('.js')) salida.push(ruta);
  }
  return salida;
}

/* Un módulo, sin sus líneas de import/export (el orden lo pone el empaquetador). */
function limpiar(codigo) {
  return codigo
    .replace(IMPORT_RELATIVO, '')
    .replace(EXPORT_DE_LISTA, '')
    .replace(EXPORT_DIRECTO, '$1$2');
}

export function empaquetar(srcDir = 'src', extras = {}) {
  const rutas = archivosDe(srcDir);
  const porRuta = new Map();
  for (const ruta of rutas) porRuta.set(resolve(ruta), readFileSync(ruta, 'utf8'));
  /* Los generados (la marca del paquete) entran como si fueran archivos del repo. */
  for (const [nombre, codigo] of Object.entries(extras)) porRuta.set(resolve(srcDir, nombre), codigo);

  const orden = [];
  const visto = new Set();
  const visitando = new Set();
  function visitar(absoluta, quien) {
    if (visto.has(absoluta)) return;
    if (visitando.has(absoluta)) throw new Error(`Ojo: ${quien} y ${relative(srcDir, absoluta)} se importan en círculo.`);
    const codigo = porRuta.get(absoluta);
    if (codigo === undefined) throw new Error(`Ojo: ${quien} importa ${relative(srcDir, absoluta)} y ese archivo no está en src/.`);
    visitando.add(absoluta);
    let m;
    const re = new RegExp(IMPORT_RELATIVO.source, 'gm');
    while ((m = re.exec(codigo))) {
      visitar(resolve(dirname(absoluta), m[1]), relative(srcDir, absoluta));
    }
    visitando.delete(absoluta);
    visto.add(absoluta);
    orden.push(absoluta);
  }
  /* Los extras primero (config.generated.js lo importa config.js) y después el resto de src/. */
  for (const nombre of Object.keys(extras)) visitar(resolve(srcDir, nombre), 'el generador');
  for (const ruta of rutas) visitar(resolve(ruta), 'el generador');

  /* CHOQUES: en un script aplanado, dos `function conectar` en archivos distintos se pisan SIN AVISAR
   * (gana la última) — el bug más caro de encontrar. Aquí se revienta el build con los dos archivos. */
  const declarado = new Map();
  for (const absoluta of orden) {
    const codigo = limpiar(porRuta.get(absoluta));
    const nombres = [...codigo.matchAll(/^(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    for (const nombre of nombres) {
      const previo = declarado.get(nombre);
      if (previo) {
        throw new Error(`Ojo: «${nombre}» se declara en ${relative('.', previo)} y otra vez en ${relative('.', absoluta)}. ` +
          `Los módulos se pegan en UN script: los nombres de nivel superior llevan el asunto del módulo (pintarPuntos, conectarPuntos…).`);
      }
      declarado.set(nombre, absoluta);
    }
  }

  const partes = orden.map(absoluta => {
    const codigo = limpiar(porRuta.get(absoluta));
    const rel = relative('.', absoluta).replace(/\\/g, '/');
    return `/* ── ${rel} ───────────────────────────────────────────── */\n${codigo.trim()}\n`;
  });
  return partes.join('\n');
}
