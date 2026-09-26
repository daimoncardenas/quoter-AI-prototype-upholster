/* LA BASE DEL PROTOTIPO — las rutas, y el motor que las atiende.
 *
 * Aquí no se guarda nada: se atienden las rutas de la base (cotizaciones, seeds y fotos) y cada MOTOR
 * las cumple a su manera. Hay dos:
 *
 *   sqlite  (`tools/api-sqlite.mjs`)  la base de casa: `data/quoter.db` en el servidor de desarrollo.
 *   mongo   (`tools/api-mongo.mjs`)   Mongo Atlas: el modelo de `docs/base-de-datos.md`, embebido.
 *
 * Cuál corre lo decide `MONGODB_URI`: si está (en .env o en el entorno) la base es Atlas; si no, SQLite.
 * Es la misma degradación que la llave de DeepSeek: sin llave, la página usa lo suyo; sin Atlas, el
 * prototipo usa su base de casa. En Netlify (Netlify Functions) Atlas es obligatorio: allá no hay disco
 * donde dejar un archivo.
 *
 * Rutas:
 *   GET    /api/quotes?ns=<namespace>   → { quotes: [...], total, resetAt, motor }
 *   PUT    /api/quotes                  → { ns, quotes: [una o varias] }  (guarda y reparte)
 *   DELETE /api/quotes/:id?ns=<namespace>
 *   POST   /api/reset?ns=<namespace>    → corre las seeds: borra el namespace y deja la marca
 *   GET    /api/photos/<ns>/<COT-####>/<archivo>   → la foto (de disco en casa, del GridFS en Atlas)
 */
import { loadDotEnv } from './env.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { hayR2, almacenR2, claveDeFoto, MIME_POR_EXT, EXPIRA_FIRMA_S } from './fotos-r2.mjs';

/* El namespace del paquete desplegado (CLIENT → clients/<slug>/client.json): las firmas de las fotos
 * lo llevan en la clave, y es cosa del SERVIDOR saberlo — la página no lo manda. */
export function namespaceDelPack() {
  try {
    const env = loadDotEnv();
    const slug = String(process.env.CLIENT || env.CLIENT || '').trim().toLowerCase();
    const archivo = join('clients', slug, 'client.json');
    if (slug && existsSync(archivo)) {
      const pack = JSON.parse(readFileSync(archivo, 'utf8'));
      if (pack.storageNamespace) return String(pack.storageNamespace);
    }
  } catch (err) { /* sin paquete a la vista: que lo diga quien llama */ }
  return '';
}

/* La cadena de conexión vive en .env, jamás en el código (regla 9 de docs/base-de-datos.md). */
export function mongoUri() {
  const delArchivo = loadDotEnv().MONGODB_URI;
  return String(process.env.MONGODB_URI || delArchivo || '').trim();
}
export function mongoDb() {
  const delArchivo = loadDotEnv().MONGODB_DB;
  /* La base del prototipo es «aci-local»; el día de producción se crea «aci-production» y se cambia la
   * variable (dueño, 25/09) — aquí solo cambia el nombre, nada más. */
  return String(process.env.MONGODB_DB || delArchivo || 'aci-local').trim();
}

/* El motor se elige UNA vez y se recuerda: en Mongo la conexión se reusa entre llamadas (en Netlify,
 * entre invocaciones tibias del mismo proceso). */
let motor = null;
async function elMotor() {
  if (motor) return motor;
  if (mongoUri()) {
    const { motorMongo } = await import('./api-mongo.mjs');
    motor = motorMongo({ uri: mongoUri(), dbName: mongoDb() });
  } else {
    const { motorSqlite } = await import('./api-sqlite.mjs');
    motor = motorSqlite();
  }
  return motor;
}

/* El cuerpo del PUT puede traer las fotos en base64 (~33 % más grande que el archivo): 24 MiB deja
 * aire para una tanda de fotos sin volverse un agujero de memoria. Una petición sin fin se corta. */
const LIMITE_CUERPO = 24 * 1024 * 1024;
function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let total = 0; const partes = [];
    req.on('data', trozo => {
      total += trozo.length;
      if (total > LIMITE_CUERPO) { const e = new Error('cuerpo demasiado grande'); e.codigo = 'GRANDE'; req.destroy(); reject(e); return; }
      partes.push(trozo);
    });
    req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
    req.on('error', reject);
  });
}

function responder(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

/* Devuelve true si atendió la petición (el servidor sigue con sus archivos si no). */
export async function laBase(req, res, url) {
  const ruta = url.pathname;
  const esDeLaBase = ruta.startsWith('/api/quotes') || ruta === '/api/reset' || ruta.startsWith('/api/photos/');
  if (!esDeLaBase) return false;

  const ns = url.searchParams.get('ns') || '';
  let el;
  try { el = await elMotor(); }
  catch (err) {
    responder(res, 503, { error: 'no pude abrir la base: ' + err.message, motor: mongoUri() ? 'mongo' : 'sqlite' });
    return true;
  }

  try {
    if (req.method === 'GET' && ruta === '/api/quotes') {
      const dato = await el.listar(ns);
      responder(res, 200, Object.assign({ motor: el.nombre }, dato));
      return true;
    }

    if ((req.method === 'PUT' || req.method === 'POST') && ruta === '/api/quotes') {
      const dato = JSON.parse(await leerCuerpo(req) || '{}');
      const quien = String(dato.ns || ns || '');
      const filas = Array.isArray(dato.quotes) ? dato.quotes : (dato.quote ? [dato.quote] : []);
      const guardadas = await el.guardar(quien, filas);
      responder(res, 200, { guardadas, ns: quien, motor: el.nombre });
      return true;
    }

    if (req.method === 'DELETE' && ruta.startsWith('/api/quotes/')) {
      const id = decodeURIComponent(ruta.slice('/api/quotes/'.length));
      const borradas = await el.borrar(ns, id);
      responder(res, 200, { borradas, id, motor: el.nombre });
      return true;
    }

    /* EL BOTÓN DE LAS SEEDS: borra lo del namespace y deja marca de cuándo, para que un navegador con
     * copia vieja no vuelva a empujar lo que se borró. */
    if (req.method === 'POST' && ruta === '/api/reset') {
      const resetAt = await el.reiniciar(ns);
      responder(res, 200, { borradas: true, ns, resetAt, motor: el.nombre });
      return true;
    }

    /* LAS FIRMAS DE LAS FOTOS: el navegador pide permiso para subir DIRECTO a R2 y a la base solo
     * viajan los metadatos (nada de base64 por el servidor). Las claves las arma el servidor
     * —`photos/<ns>/<COT-####>/NN.ext`—, así que una firma no puede escribir fuera de su carpeta.
     * Sin R2 configurado contesta 501 y la página se queda con su camino de siempre (dataURL). */
    if (req.method === 'POST' && ruta === '/api/photos/firmas') {
      if (!hayR2()) { responder(res, 501, { error: 'R2 sin configurar (faltan R2_* en .env)' }); return true; }
      const dato = JSON.parse(await leerCuerpo(req) || '{}');
      const quien = String(dato.ns || ns || namespaceDelPack() || '').trim();
      const id = String(dato.id || '').trim();
      const fotos = Array.isArray(dato.fotos) ? dato.fotos : [];
      const sano = t => /^[A-Za-z0-9._-]{1,40}$/.test(t);
      if (!sano(quien) || !sano(id) || !fotos.length) {
        responder(res, 400, { error: 'firmas: hacen falta un namespace sano, el id de la cotización y fotos [{slot, ext}]' });
        return true;
      }
      const almacen = almacenR2();
      const firmas = [];
      for (let i = 0; i < fotos.length; i++) {
        const ext = String(fotos[i].ext || 'png').toLowerCase();
        if (!MIME_POR_EXT[ext]) { responder(res, 400, { error: 'extensión no permitida: ' + ext }); return true; }
        const slot = Math.max(1, Math.min(99, parseInt(fotos[i].slot, 10) || i + 1));
        const mime = fotos[i].mime || MIME_POR_EXT[ext];
        const clave = claveDeFoto(quien, id, slot, ext);
        const firma = await almacen.firmarSubida(clave, mime);
        firmas.push({ slot, key: clave, url: firma.url, urlPublica: almacen.urlDe(clave), mime });
      }
      responder(res, 200, { bucket: almacen.bucket, expira: EXPIRA_FIRMA_S, firmas });
      return true;
    }

    /* LA FOTO DE UNA COTIZACIÓN: en casa es un archivo (`data/photos/…`), en Atlas es un GridFS. La
     * ruta es la misma para las dos: /api/photos/<ns>/<COT-####>/<archivo>. */
    if (req.method === 'GET' && ruta.startsWith('/api/photos/')) {
      const partes = ruta.slice('/api/photos/'.length).split('/');
      if (partes.length !== 3) { responder(res, 400, { error: 'ruta de foto: /api/photos/<ns>/<id>/<archivo>' }); return true; }
      const [nsFoto, id, archivo] = partes.map(decodeURIComponent);
      const foto = await el.leerFoto(nsFoto, id, archivo);
      if (!foto) { responder(res, 404, { error: 'sin foto' }); return true; }
      res.writeHead(200, { 'Content-Type': foto.mime, 'Cache-Control': 'public, max-age=300' });
      res.end(foto.buffer);
      return true;
    }
  } catch (err) {
    /* 503 es «la base no está» (Atlas no respondió o R2 no está configurado): la página lo dice y
     * sigue con su copia. Se deja dicho en la consola del servidor: un fallo mudo ya nos costó una vez. */
    const estado = err.codigo === 'GRANDE' ? 413 : (err.codigo === 'SIN_BASE' ? 503 : 400);
    console.error('[base]', estado, err.message);
    responder(res, estado, { error: err.message, motor: el.nombre });
    return true;
  }

  responder(res, 405, { error: 'método no permitido' });
  return true;
}
