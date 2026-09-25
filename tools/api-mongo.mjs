/* MONGO ATLAS — el motor de producción, tal como lo describe docs/base-de-datos.md.
 *
 * Un motor es la misma cara que el de SQLite (`tools/api-sqlite.mjs`) con los datos en otra parte:
 *
 *   listar(ns) · guardar(ns, filas) · borrar(ns, id) · reiniciar(ns) · leerFoto(ns, id, archivo)
 *
 * La diferencia de forma es la del documento: LA COTIZACIÓN VA EMBEBIDA (regla 4) — sus piezas y sus
 * fotos van dentro, así que se lee entera de un golpe y guardar es un solo upsert. Las referencias
 * (`servicePointId`, `sellerId`, `fabricId`) apuntan a otras colecciones, y las fotos viven en un
 * GridFS (`fotos/<ns>/<COT-####>/NN.ext`): en Atlas no hay disco donde dejar un archivo.
 *
 * Lo que el modelo todavía no nombra va en `data`, el mismo cajón que usa SQLite: la forma crece sin
 * perder nada, y cuando un dato se vuelve importante se le da su lugar en el documento y se rellena
 * desde ahí (regla 6: sin migraciones, nada se borra en silencio).
 *
 * La cadena de conexión llega desde tools/api.mjs (que la lee del entorno/.env) — aquí no se lee ni se
 * imprime nunca: regla 9.
 */
import { MongoClient, GridFSBucket } from 'mongodb';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const MIME_POR_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
const escapeRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Claves que YA tienen su lugar en el documento. Todo lo demás viaja en `data` y vuelve tal cual. */
const CON_LUGAR = new Set(['id', 'date', 'status', 'service', 'customer', 'pieces', 'photos']);
function elResto(q) {
  const resto = {};
  for (const k of Object.keys(q)) if (!CON_LUGAR.has(k)) resto[k] = q[k];
  return resto;
}

/* Un pack de demo es un negocio con una marca: el namespace identifica al pack (`cdy.v1.` → cardyram),
 * el pack da el tenant, y su marca principal es `${tenant}.main` — cuando un cliente tenga varias
 * marcas, la marca deja de ser `.main` y pasa a ser su slug (docs/base-de-datos.md). */
let mapaNegocios = null;
function negocios() {
  if (mapaNegocios) return mapaNegocios;
  mapaNegocios = {};
  try {
    for (const entrada of readdirSync('clients', { withFileTypes: true })) {
      if (!entrada.isDirectory()) continue;
      const archivo = join('clients', entrada.name, 'client.json');
      if (!existsSync(archivo)) continue;
      const pack = JSON.parse(readFileSync(archivo, 'utf8'));
      if (pack.storageNamespace) mapaNegocios[pack.storageNamespace] = entrada.name;
    }
  } catch (err) { /* sin packs a la vista: el namespace se usa tal cual */ }
  return mapaNegocios;
}
export function negocioDe(ns) {
  const slug = negocios()[ns] || String(ns || '').replace(/\.+$/, '') || 'demo';
  return { tenantId: slug, brandId: `${slug}.main` };
}

export function motorMongo({ uri, dbName = 'aci' } = {}) {
  if (!uri) throw new Error('motorMongo necesita la cadena de conexión (MONGODB_URI)');
  let conexion = null, base = null, balde = null;

  async function conectar() {
    if (base) return base;
    if (!conexion) {
      conexion = (async () => {
        try {
          const cliente = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
          await cliente.connect();
          const b = cliente.db(dbName);
          /* Los índices empiezan por tenantId (regla 2). */
          await b.collection('quotes').createIndexes([
            { key: { tenantId: 1, brandId: 1, date: -1 }, name: 'quotes_por_fecha' },
            { key: { tenantId: 1, status: 1 }, name: 'quotes_por_estado' }
          ]);
          await b.collection('meta').createIndex({ ns: 1 }, { unique: true, name: 'meta_por_ns' });
          base = b;
          balde = new GridFSBucket(b, { bucketName: 'fotos' });
          return b;
        } catch (err) {
          conexion = null;                       // el próximo intento vuelve a probar
          const e = new Error('Mongo Atlas no respondió: ' + err.message);
          e.codigo = 'SIN_BASE';
          throw e;
        }
      })();
    }
    return conexion;
  }
  const quotes = () => base.collection('quotes');
  const meta = () => base.collection('meta');

  /* ── el documento: la cotización embebida (regla 4) ────────────────────────── */
  function aDocumento(q, ns) {
    const { tenantId, brandId } = negocioDe(ns);
    const servicio = q.service || {};
    const cliente = q.customer || {};
    const principal = (q.pieces && q.pieces[0]) || {};
    const total = (q.estimate && Array.isArray(q.estimate.total) && q.estimate.total)
      || (q.price && Array.isArray(q.price.total) && q.price.total)
      || (Array.isArray(q.price) && q.price)
      || [];
    const consumo = Array.isArray(q.meters) ? q.meters : [];
    const facturable = (q.billing && Array.isArray(q.billing.facturable) && q.billing.facturable)
      || (Array.isArray(q.metersBillable) && q.metersBillable) || [];
    const ahora = new Date().toISOString();

    return {
      _id: String(q.id),
      tenantId, brandId,
      date: q.date || null,
      status: q.status || null,
      /* De dónde salió cada cotización (regla 5): el cotizador es el default; las seeds y la prueba
       * automática lo declaran al empujarla. */
      source: q.source || 'cotizador',
      service: { id: servicio.id || null, label: servicio.label || null, journey: servicio.journey || null },
      customer: { name: cliente.name || null, email: cliente.email || null, phone: cliente.phone || null },
      city: q.city || cliente.city || null,
      servicePointId: q.servicePointId || null,
      servicePointName: q.servicePointName || q.servicePoint || null,
      sellerId: q.sellerId || (q.seller && q.seller.id) || null,
      sellerName: q.sellerName || (q.seller && q.seller.name) || q.seller || null,
      fabricId: q.fabricId || null,
      fabricRef: q.fabricRef || (q.fabric && q.fabric.ref) || null,
      fabricName: q.fabricName || null,
      estimate: total.length ? { lo: num(total[0]), hi: num(total[1]) } : null,
      meters: consumo.length ? { lo: num(consumo[0]), hi: num(consumo[1]) } : null,
      metersBillable: facturable.length ? (num(facturable[0]) !== null ? num(facturable[0]) : num(facturable[1])) : null,
      furniture: q.furniture || principal.furniture || null,
      quantityLabel: q.quantityLabel || null,
      notes: q.notes || q.comment || null,
      pieces: (Array.isArray(q.pieces) ? q.pieces : []).map((x, i) => ({
        idx: i + 1,
        /* La página manda la ETIQUETA del mueble; el id del catálogo lo resuelve quien lo tenga
         * (regla 6: nada se inventa). El día que el cotizador mande el id, cae aquí. */
        furnitureId: x.furnitureId || null,
        furnitureLabel: x.furniture || null,
        quantity: num(x.quantity) || 1,
        coverage: x.coverage || null,
        cushions: num(x.cushions),
        measures: { width: num(x.measures && x.measures.width), height: num(x.measures && x.measures.height), depth: num(x.measures && x.measures.depth) },
        note: x.note || null,
        photosCount: num(x.photos),
        meters: Array.isArray(x.meters) ? x.meters : [],
        value: Array.isArray(x.value) ? x.value : []
      })),
      photos: [],                                   // lo llena guardar(): en GridFS, aquí su ruta
      data: elResto(q),                             // lo que el modelo todavía no nombra
      createdAt: q.createdAt || ahora,
      updatedAt: ahora
    };
  }

  /* El documento vuelve como el JSON que conocen las páginas (el mismo que arma el motor de SQLite). */
  function deDocumento(doc) {
    const servicio = doc.service || {};
    const cliente = doc.customer || {};
    const piezas = (doc.pieces || []).map(x => ({
      furniture: x.furnitureLabel, quantity: x.quantity, coverage: x.coverage, cushions: x.cushions,
      measures: { width: x.measures && x.measures.width, height: x.measures && x.measures.height, depth: x.measures && x.measures.depth },
      note: x.note, photos: x.photosCount,
      meters: x.meters, value: x.value
    }));
    const fotos = (doc.photos || []).map(f => ({
      pieza: Number.isInteger(f.pieceIdx) ? f.pieceIdx - 1 : null,
      path: f.path || null, width: f.width, height: f.height, bytes: f.bytes,
      mime: f.mime || null, name: f.name || null
    }));
    const tienePrecio = !!doc.estimate && (doc.estimate.lo !== null || doc.estimate.hi !== null);
    const tieneMetros = !!doc.meters && (doc.meters.lo !== null || doc.meters.hi !== null);

    return Object.assign({
      id: doc._id,
      date: doc.date,
      status: doc.status,
      source: doc.source || null,
      customer: { name: cliente.name || null, email: cliente.email || null, phone: cliente.phone || null },
      service: { id: servicio.id || null, label: servicio.label || null, journey: servicio.journey || null },
      furniture: doc.furniture || null,
      quantityLabel: doc.quantityLabel || null,
      city: doc.city || null,
      servicePointId: doc.servicePointId || null,
      servicePointName: doc.servicePointName || null,
      sellerId: doc.sellerId || null,
      sellerName: doc.sellerName || null,
      fabricRef: doc.fabricRef || null,
      fabricName: doc.fabricName || null,
      price: tienePrecio ? { total: [doc.estimate.lo, doc.estimate.hi] } : null,
      metersBillable: tieneMetros ? [doc.meters.lo, doc.meters.hi] : null,
      notes: doc.notes || null,
      pieces: piezas,
      photos: fotos
    }, doc.data || {});
  }

  /* ── las fotos ─────────────────────────────────────────────────────────────── */
  const nombreDeFoto = (ns, id, i, ext) => `${ns}/${id}/${String(i + 1).padStart(2, '0')}.${ext}`;
  async function borrarFotosDe(ns, id) {
    const suyos = await balde.find({ filename: { $regex: `^${escapeRe(ns)}/${escapeRe(id)}/` } }).toArray();
    for (const f of suyos) await balde.delete(f._id);
  }
  async function subirFotos(q, ns) {
    await borrarFotosDe(ns, String(q.id));
    const salida = []; const porPieza = {};
    const lista = Array.isArray(q.photos) ? q.photos : [];
    for (let i = 0; i < lista.length; i++) {
      const f = lista[i];
      if (!f) return salida;
      const cual = Number.isInteger(f.pieza) ? f.pieza + 1 : null;      // la pieza es 0-based en la página
      const m = f.dataUrl && f.dataUrl.match(/^data:image\/(\w+)/);
      const ext = (m && m[1] === 'jpeg') ? 'jpg' : ((m && m[1]) || 'png');
      porPieza[cual] = (porPieza[cual] || 0) + 1;
      let ruta = f.path || null;
      if (!ruta && typeof f.dataUrl === 'string' && f.dataUrl.startsWith('data:')) {
        const nombre = nombreDeFoto(ns, q.id, i, ext);
        const mime = MIME_POR_EXT[`.${ext}`] || 'application/octet-stream';
        const buffer = Buffer.from(f.dataUrl.split(',')[1] || '', 'base64');
        await new Promise((res, rej) => {
          const flujo = balde.openUploadStream(nombre, { contentType: mime });
          flujo.on('error', rej); flujo.on('finish', res); flujo.end(buffer);
        });
        ruta = `api/photos/${ns}/${q.id}/${String(i + 1).padStart(2, '0')}.${ext}`;
      }
      salida.push({ pieceIdx: cual, slot: porPieza[cual], path: ruta, width: num(f.width), height: num(f.height), bytes: num(f.bytes), mime: f.mime || null, name: f.name || null });
    }
    return salida;
  }

  /* ── la cara del motor (idéntica a la de SQLite) ───────────────────────────── */
  return {
    nombre: 'mongo',
    async listar(ns) {
      await conectar();
      const { tenantId, brandId } = negocioDe(ns);
      const docs = await quotes().find({ tenantId, brandId }).sort({ date: -1, _id: -1 }).toArray();
      const marca = await meta().findOne({ ns });
      const salida = docs.map(deDocumento);
      return { quotes: salida, total: salida.length, resetAt: (marca && marca.resetAt) || '' };
    },
    async guardar(ns, filas) {
      await conectar();
      const { tenantId } = negocioDe(ns);
      let guardadas = 0;
      for (const q of filas) {
        if (!q || !q.id) continue;
        const doc = aDocumento(q, ns);
        /* Las fotos solo se tocan cuando el cuerpo las trae: un cambio de estado que no las mande no
         * puede borrarlas (la misma regla que en SQLite). */
        if (Array.isArray(q.photos)) {
          doc.photos = await subirFotos(q, ns);
        } else {
          const antes = await quotes().findOne({ _id: String(q.id), tenantId }, { projection: { photos: 1, createdAt: 1 } });
          doc.photos = (antes && antes.photos) || [];
          if (antes && antes.createdAt) doc.createdAt = antes.createdAt;
        }
        await quotes().replaceOne({ _id: doc._id, tenantId }, doc, { upsert: true });
        guardadas++;
      }
      return guardadas;
    },
    async borrar(ns, id) {
      await conectar();
      const { tenantId } = negocioDe(ns);
      const r = await quotes().deleteOne({ _id: String(id), tenantId });
      if (r.deletedCount) await borrarFotosDe(ns, String(id));
      return r.deletedCount || 0;
    },
    async reiniciar(ns) {
      await conectar();
      const { tenantId, brandId } = negocioDe(ns);
      const suyos = await quotes().find({ tenantId, brandId }, { projection: { _id: 1 } }).toArray();
      await quotes().deleteMany({ tenantId, brandId });
      for (const s of suyos) await borrarFotosDe(ns, s._id);
      const resetAt = new Date().toISOString();
      await meta().updateOne({ ns }, { $set: { ns, resetAt } }, { upsert: true });
      return resetAt;
    },
    async leerFoto(ns, id, archivo) {
      await conectar();
      if (!archivo || archivo.includes('/') || archivo.includes('\\') || archivo.includes('..')) return null;
      const encontrado = await balde.find({ filename: `${ns}/${id}/${archivo}` }).next();
      if (!encontrado) return null;
      const trozos = [];
      await new Promise((res, rej) => {
        const flujo = balde.openDownloadStream(encontrado._id);
        flujo.on('data', c => trozos.push(c));
        flujo.on('end', res);
        flujo.on('error', rej);
      });
      return { buffer: Buffer.concat(trozos), mime: encontrado.contentType || MIME_POR_EXT[extname(archivo).toLowerCase()] || 'application/octet-stream' };
    }
  };
}
