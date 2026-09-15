/* Empaqueta el prototipo cifrado.
 *
 * El problema que resuelve: una contraseña comprobada DENTRO del archivo no
 * protege nada, porque el contenido ya viajó dentro de ese archivo. Basta
 * borrar la cortina desde la consola. Aquí el contenido no está oculto: no
 * está. Lo que se entrega es AES-GCM sobre el HTML completo, y la llave que
 * mandas por correo es lo único que lo vuelve legible.
 *
 *   node tools/build.mjs             -> genera una llave nueva
 *   node tools/build.mjs --key=...   -> reutiliza una llave concreta
 *   node tools/build.mjs --ttl=6     -> horas que dura el permiso (por defecto 6)
 *
 * Salida: dist/index.html y dist/admin.html, autocontenidos (store.js queda
 * cifrado dentro) y todavía de doble clic.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { webcrypto, randomInt } from 'node:crypto';

const { subtle } = webcrypto;
// getRandomValues exige su propio `this`, así que no se desestructura.
const rand = n => webcrypto.getRandomValues(new Uint8Array(n));

/* PBKDF2-HMAC-SHA256. La llave es lo único que separa el archivo del texto
 * claro, así que encarecemos cada intento: sin esto, un diccionario de llaves
 * "bonitas" cae en milisegundos. */
const ITERATIONS = 310000;

/* Alfabeto sin caracteres que se confunden al dictarlos por teléfono o al
 * copiarlos de un correo: sin I, L, O, U, 0, 1. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

function newKey() {
  const grupo = () => Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return [grupo(), grupo(), grupo(), grupo()].join('-');
}

async function encrypt(plaintext, passphrase) {
  const salt = rand(16);
  const iv = rand(12);
  const base = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const cipher = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  const b64 = b => Buffer.from(b).toString('base64');
  return { salt: b64(salt), iv: b64(iv), cipher: b64(new Uint8Array(cipher)) };
}

/* --------------------------------------------------------------- la cáscara --
 * Lo único que se entrega en claro: el formulario, el descifrador y el bulto
 * cifrado. Ni una línea del prototipo. */
function shell({ title, logo, eyebrow, lead, payload }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Montserrat:wght@400;500;600;700&display=swap">
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:#07383b;color:#07383b;font-family:Montserrat,Arial,sans-serif;display:grid;place-items:center;padding:32px 24px}
button,input{font:inherit}button{cursor:pointer}
.stack{width:100%;max-width:420px;display:grid;justify-items:center;gap:26px}
.logo{display:block;width:auto;height:58px}
.card{width:100%;background:#fff;padding:34px 36px 30px;box-shadow:0 30px 80px rgba(0,25,28,.35)}
.eyebrow{text-transform:uppercase;font-size:.62rem;letter-spacing:.14em;font-weight:700;color:#0f5c60}
h1{font:600 1.9rem/1.1 Cormorant Garamond,serif;color:#07383b;margin:9px 0 10px}
.lead{font-size:.76rem;line-height:1.6;color:#5f736f;margin:0 0 20px}
label{display:block;font-size:.7rem;font-weight:700}
input{width:100%;margin-top:8px;border:1px solid #d3ded9;border-radius:2px;padding:14px;font-size:.85rem;letter-spacing:.1em;min-height:47px;text-transform:uppercase}
input:focus-visible{outline:3px solid rgba(0,161,154,.45);outline-offset:2px}
.error{color:#a64040;font-size:.72rem;margin:10px 0 0}
button{margin-top:18px;width:100%;border:0;border-radius:2px;background:#07383b;color:#fff;padding:14px;font-weight:700;font-size:.75rem}
button:hover{background:#0f5c60}
button:disabled{opacity:.5;cursor:not-allowed}
.foot{font-size:.62rem;line-height:1.55;color:#8fa9a6;margin:0;text-align:center;max-width:44ch}
@media(max-width:560px){.card{padding:26px 22px 24px}}
</style>
</head>
<body>
  <div class="stack">
    <img src="${logo}" alt="Mediterránea Insumos" class="logo">
    <form class="card" id="form">
      <span class="eyebrow">${eyebrow}</span>
      <h1>Vista previa privada</h1>
      <p class="lead">${lead}</p>
      <label for="key">Llave de acceso</label>
      <input id="key" name="key" type="password" required autocomplete="off"
             spellcheck="false" placeholder="XXXXX-XXXXX-XXXXX-XXXXX">
      <p class="error" id="error" hidden></p>
      <button type="submit" id="submit">Abrir prototipo</button>
    </form>
    <p class="foot">Prototipo de trabajo, no es el sitio de Mediterránea Insumos.
      Sin la llave este archivo no contiene nada legible.</p>
  </div>
<script>
/* El prototipo entero vive aquí como AES-GCM. Sin la llave correcta, decrypt()
 * falla en la etiqueta de autenticación y no hay nada que mostrar: no está
 * escondido detrás de una cortina, está cifrado. */
var SALT = ${JSON.stringify(payload.salt)};
var IV = ${JSON.stringify(payload.iv)};
var CIPHER = ${JSON.stringify(payload.cipher)};
var ITERATIONS = ${ITERATIONS};
/* Guardamos la llave para no pedirla en cada página ni en cada recarga. Queda
 * en el navegador de quien ya la conoce y ya puede leer el contenido, así que
 * no concede nada nuevo — pero por eso mismo, no reutilices esta llave para
 * ninguna otra cosa.
 *
 * El permiso caduca: el reloj arranca en el PRIMER acierto y no se renueva al
 * reabrir, así que son ${TTL_HOURS} h de reloj, no de uso. Limita cuánto tiempo
 * queda abierto un portátil prestado; a quien tenga el correo no le quita nada,
 * solo le pide escribir la llave otra vez. Un reloj del sistema movido hacia
 * atrás alarga el permiso: no es una licencia, es una cortesía con fecha. */
var GUARDADA = 'med.v1.llave';
var TTL = ${Math.round(TTL_HOURS * 3600 * 1000)};
var TTL_TEXTO = ${JSON.stringify(TTL_HOURS === 1 ? 'una hora' : TTL_HOURS + ' horas')};

var form = document.getElementById('form');
var input = document.getElementById('key');
var error = document.getElementById('error');
var submit = document.getElementById('submit');

function bytes(b64) {
  var raw = atob(b64), out = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function guardar(llave, desde) {
  try { localStorage.setItem(GUARDADA, JSON.stringify({ k: llave, at: desde })); }
  catch (err) { /* modo privado */ }
}

/* Devuelve el permiso vigente, o null si no hay o ya caducó. */
function permiso() {
  var raw = null;
  try { raw = localStorage.getItem(GUARDADA); } catch (err) { return null; }
  if (!raw) return null;
  var d = null;
  try { d = JSON.parse(raw); } catch (err) { d = null; }
  if (!d || typeof d.k !== 'string' || typeof d.at !== 'number') { olvidar(); return null; }
  if (Date.now() - d.at >= TTL) { olvidar(); return { caducado: true }; }
  return d;
}

function olvidar() { try { localStorage.removeItem(GUARDADA); } catch (err) { /* ignore */ } }

/* Si la página se queda abierta más allá del plazo, se cierra sola. Los
 * temporizadores viven en window, que document.write() no reemplaza.
 * No borramos aquí: dejamos que permiso() encuentre el permiso vencido al
 * recargar, que es lo que hace aparecer la explicación. Borrarlo antes deja
 * al cliente frente a un formulario en blanco sin saber qué pasó. */
function programarCierre(desde) {
  var queda = desde + TTL - Date.now();
  setTimeout(function () { location.reload(); }, queda > 0 ? queda : 0);
}

function abrir(llave, desde) {
  return crypto.subtle
    .importKey('raw', new TextEncoder().encode(llave), 'PBKDF2', false, ['deriveKey'])
    .then(function (base) {
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: bytes(SALT), iterations: ITERATIONS, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    })
    .then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(IV) }, key, bytes(CIPHER));
    })
    .then(function (plano) {
      // El reloj arranca en el primer acierto y se conserva al reabrir.
      var inicio = typeof desde === 'number' ? desde : Date.now();
      guardar(llave, inicio);
      var html = new TextDecoder().decode(plano);
      document.open(); document.write(html); document.close();
      programarCierre(inicio);
      return true;
    })
    .catch(function () { return false; });
}

form.addEventListener('submit', function (e) {
  e.preventDefault();
  var valor = input.value.trim().toUpperCase();
  if (!valor) return;
  submit.disabled = true;
  submit.textContent = 'Abriendo…';
  abrir(valor).then(function (ok) {
    if (ok) return;
    submit.disabled = false;
    submit.textContent = 'Abrir prototipo';
    error.textContent = 'Esa llave no abre este archivo. Revisa el correo con el que te lo compartimos.';
    error.hidden = false;
    input.select();
  });
});
input.addEventListener('input', function () { error.hidden = true; });

/* Reintento silencioso con la llave todavía vigente en este navegador. */
var previo = permiso();
if (previo && previo.k) {
  abrir(previo.k, previo.at).then(function (ok) { if (!ok) input.focus(); });
} else {
  if (previo && previo.caducado) {
    error.textContent = 'Han pasado más de ' + TTL_TEXTO + ' desde que lo abriste. Escribe la llave otra vez.';
    error.hidden = false;
  }
  input.focus();
}
</script>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ build -- */

const arg = process.argv.find(a => a.startsWith('--key='));
const passphrase = arg ? arg.slice('--key='.length).trim().toUpperCase() : newKey();

/* Cuánto dura el permiso guardado en el navegador del cliente. Pasadas estas
 * horas hay que volver a escribir la llave. Acepta decimales para poder
 * probarlo sin esperar (--ttl=0.001 son 3,6 segundos). */
const ttlArg = process.argv.find(a => a.startsWith('--ttl='));
const TTL_HOURS = ttlArg ? Number(ttlArg.slice('--ttl='.length)) : 6;
if (!(TTL_HOURS > 0)) throw new Error('--ttl debe ser un número de horas mayor que cero');

const store = readFileSync('store.js', 'utf8');
if (store.includes('</script>')) throw new Error('store.js contiene </script> y rompería el inlining');

const PAGES = [
  { file: 'index.html', eyebrow: 'Propuesta',
    lead: 'Este prototipo se comparte solo con Mediterránea Insumos. Escribe la llave que enviamos por correo.' },
  { file: 'admin.html', eyebrow: 'Backoffice',
    lead: 'El backoffice del prototipo se comparte solo con Mediterránea Insumos. Escribe la llave que enviamos por correo.' }
];

mkdirSync('dist', { recursive: true });

for (const page of PAGES) {
  const src = readFileSync(page.file, 'utf8');

  /* store.js entra al bulto cifrado: si quedara fuera, el catálogo, los
   * vendedores y los hashes de los usuarios viajarían en claro. */
  const tag = '<script src="store.js"></script>';
  if (!src.includes(tag)) throw new Error(`${page.file} no enlaza store.js como se esperaba`);
  const inlined = src.replace(tag, '<script>\n' + store + '\n</script>');

  const logo = src.split('src="')[1].split('"')[0];
  if (!logo.startsWith('data:image/png')) throw new Error(`${page.file}: no encontré el logo embebido`);

  const title = (src.match(/<title>([^<]*)<\/title>/) || [, page.file])[1];

  /* TEMPORAL — la puerta de la llave está desactivada a pedido. dist/ sale en
   * claro: mismo HTML autocontenido y de doble clic, pero sin cifrar y sin
   * pedir llave. El login del backoffice sigue igual, es otra puerta.
   * Para volver a sellar la entrega: descomenta este bloque y las tres líneas
   * del final, y borra el writeFileSync en claro de abajo. */
  // writeFileSync(`dist/${page.file}`, shell({
  //   title, logo, eyebrow: page.eyebrow, lead: page.lead,
  //   payload: await encrypt(inlined, passphrase)
  // }));
  writeFileSync(`dist/${page.file}`, inlined);

  const kb = n => (n / 1024).toFixed(0) + ' KB';
  console.log(`  dist/${page.file}  ${kb(inlined.length)} en claro (sin cifrar)`);
}

// console.log(`\n  Llave para el correo:  ${passphrase}`);
// console.log('  Guárdala. No está en ninguna parte de dist/ y sin ella los archivos no se abren.');
// console.log(`  El permiso caduca a las ${TTL_HOURS} h y hay que volver a escribirla.\n`);
console.log('\n  SIN CIFRAR: dist/ se abre directo, sin llave. No es la entrega final.\n');
