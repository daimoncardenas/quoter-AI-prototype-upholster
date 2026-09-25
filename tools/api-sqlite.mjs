/* LA BASE DEL PROTOTIPO EN SQLITE — el motor de casa (servidor de desarrollo).
 *
 * Antes cada cotización era una fila con el JSON entero dentro (`payload`). Eso sirve para una demo y no
 * para lo que viene: aquí está el modelo de verdad:
 *
 *   quotes         una fila por solicitud, con sus datos en COLUMNAS (fecha, estado, cliente, ciudad,
 *                  punto, vendedor, tela, estimación, metros…)
 *   quote_pieces   una fila por PIEZA de la cotización (mueble, cantidad, qué se tapiza, medidas, valor)
 *   quote_photos   una fila por foto, con su archivo en disco (`data/photos/…`) y no en base64
 *   meta           marcas por namespace (cuándo se corrieron las seeds del botón «Restablecer»)
 *
 * LO QUE AÚN NO TIENE COLUMNA va en `data` (JSON) de su fila: nada se pierde mientras el modelo crece, y
 * cuando una pieza de información se vuelve importante se le hace su columna y se rellena desde ahí.
 * El navegador no cambia: la API arma y desarma el mismo JSON que las páginas ya conocen (mapeador).
 *
 * Este archivo es el MOTOR, no las rutas (esas viven en tools/api.mjs, que elige entre este y Mongo):
 *
 *   motorSqlite().listar(ns)            → { quotes, total, resetAt }
 *   motorSqlite().guardar(ns, filas)    → cuántas guardó
 *   motorSqlite().borrar(ns, id)        → cuántas borró
 *   motorSqlite().reiniciar(ns)         → corre las seeds: borra el namespace y deja la marca
 *   motorSqlite().leerFoto(ns, id, arq) → { buffer, mime } o null
 *
 * La base se abre a la PRIMERA LLAMADA, no al importar: el día que corra sobre Mongo (Netlify) este
 * archivo no debe tocar el disco ni para abrirla.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';

const MIME_POR_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

/* Claves que YA tienen su lugar en el modelo (columnas, piezas o fotos). Todo lo demás viaja en `data`
 * y vuelve tal cual al leer: el modelo crece sin perder nada por el camino. */
const CON_LUGAR = new Set(['id', 'date', 'status', 'service', 'customer', 'pieces', 'photos']);
function elResto(q) {
  const resto = {};
  for (const k of Object.keys(q)) if (!CON_LUGAR.has(k)) resto[k] = q[k];
  return resto;
}

export function motorSqlite({ ruta = resolve(process.env.QUOTER_DB || 'data/quoter.db') } = {}) {
  let db = null;
  const listo = () => {                                   // consultas ya preparadas (una sola vez)
    if (!st.leerCotizaciones) {
      st.leerCotizaciones = db.prepare('SELECT * FROM quotes WHERE namespace = ? ORDER BY date DESC, id DESC');
      st.leerPiezas = db.prepare('SELECT * FROM quote_pieces WHERE quote_id = ? AND namespace = ? ORDER BY idx');
      st.leerFotos = db.prepare('SELECT * FROM quote_photos WHERE quote_id = ? AND namespace = ? ORDER BY piece_idx, slot');
      st.leerMarca = db.prepare('SELECT reset_at FROM meta WHERE namespace = ?');
      st.ponerMarca = db.prepare('INSERT INTO meta (namespace, reset_at) VALUES (?, ?) ON CONFLICT(namespace) DO UPDATE SET reset_at = excluded.reset_at');
      st.borrarTodo = db.prepare('DELETE FROM quotes WHERE namespace = ?');
      st.borrarUna = db.prepare('DELETE FROM quotes WHERE id = ? AND namespace = ?');
      st.borrarPiezas = db.prepare('DELETE FROM quote_pieces WHERE quote_id = ? AND namespace = ?');
      st.borrarFotos = db.prepare('DELETE FROM quote_photos WHERE quote_id = ? AND namespace = ?');
    }
    return db;
  };
  const st = {};

  function abrir() {
    if (db) return db;
    mkdirSync(dirname(ruta), { recursive: true });
    db = new DatabaseSync(ruta);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');

    /* ── si venimos del modelo viejo (una fila = un JSON), se aparta ANTES de crear el nuevo ── */
    const hayQuotes = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='quotes'").get();
    const columnas = hayQuotes ? db.prepare("SELECT name FROM pragma_table_info('quotes')").all().map(c => c.name) : [];
    if (columnas.includes('payload')) {
      db.exec('ALTER TABLE quotes RENAME TO quotes_viejas');
      console.log('[base] migrando las cotizaciones del modelo viejo…');
    }
    const hayViejas = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='quotes_viejas'").get();

    /* ── el modelo ─────────────────────────────────────────────────────────────── */
    db.exec(`
      CREATE TABLE IF NOT EXISTS quotes (
        id TEXT NOT NULL,
        namespace TEXT NOT NULL,
        date TEXT,
        status TEXT,
        service_id TEXT,
        service_label TEXT,
        journey TEXT,
        furniture TEXT,                      -- el mueble principal (el de la fila clásica)
        quantity_label TEXT,
        customer_name TEXT,
        customer_email TEXT,
        customer_phone TEXT,
        city TEXT,
        service_point_id TEXT,
        service_point_name TEXT,
        seller_id TEXT,
        seller_name TEXT,
        fabric_ref TEXT,
        fabric_name TEXT,
        estimate_lo INTEGER,
        estimate_hi INTEGER,
        meters_lo REAL,
        meters_hi REAL,
        meters_billable REAL,
        notes TEXT,
        data TEXT NOT NULL DEFAULT '{}',     -- lo que el modelo todavía no nombra
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (id, namespace)
      );
      CREATE INDEX IF NOT EXISTS quotes_por_fecha ON quotes (namespace, date DESC);

      CREATE TABLE IF NOT EXISTS quote_pieces (
        quote_id TEXT NOT NULL,
        namespace TEXT NOT NULL,
        idx INTEGER NOT NULL,                -- 1..n, como se ve en pantalla
        furniture TEXT,
        quantity INTEGER,
        coverage TEXT,                       -- qué se tapiza (todo el mueble, asiento y respaldo…)
        cushions INTEGER,
        width_cm REAL,
        height_cm REAL,
        depth_cm REAL,
        note TEXT,
        photos_count INTEGER,
        meters_lo REAL,
        meters_hi REAL,
        value_lo INTEGER,
        value_hi INTEGER,
        data TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (quote_id, namespace, idx),
        FOREIGN KEY (quote_id, namespace) REFERENCES quotes (id, namespace) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS quote_photos (
        quote_id TEXT NOT NULL,
        namespace TEXT NOT NULL,
        piece_idx INTEGER,                   -- de qué pieza es (NULL = de la solicitud)
        slot INTEGER NOT NULL,               -- 1..n dentro de su pieza
        path TEXT,                           -- data/photos/… (el archivo, no base64 en la base)
        width INTEGER,
        height INTEGER,
        bytes INTEGER,
        data TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (quote_id, namespace, piece_idx, slot),
        FOREIGN KEY (quote_id, namespace) REFERENCES quotes (id, namespace) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS meta (
        namespace TEXT PRIMARY KEY,
        reset_at TEXT NOT NULL
      );
    `);

    listo();                                   // la migración de abajo guarda con estas consultas

    if (hayViejas) {
      const viejas = db.prepare('SELECT id, namespace, payload FROM quotes_viejas').all();
      let migradas = 0;
      for (const v of viejas) {
        try { guardarCotizacion(JSON.parse(v.payload), v.namespace); migradas++; }
        catch (err) { console.warn('[base] no pude migrar', v.id, err.message); }
      }
      db.exec('DROP TABLE quotes_viejas');
      console.log(`[base] migradas ${migradas} cotizaciones al modelo nuevo`);
    }
    return db;
  }

  /* ── el mapeador: el JSON que conocen las páginas ↔ las tablas ──────────────── */
  const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
  const txt = v => (v === null || v === undefined) ? null : String(v);

  function guardarCotizacion(q, ns) {
    const ahora = new Date().toISOString();
    const servicio = q.service || {};
    const cliente = q.customer || {};
    const principal = (q.pieces && q.pieces[0]) || {};
    /* La estimación congelada viaja en `estimate.total` (el número que el cliente vio, con sus
     * entradas); `price` es el precio de la tela sola y puede venir como lista de dos valores. Las dos
     * formas se aceptan: el modelo viejo (price.total) y el actual (estimate.total). */
    const total = (q.estimate && Array.isArray(q.estimate.total) && q.estimate.total)
      || (q.price && Array.isArray(q.price.total) && q.price.total)
      || (Array.isArray(q.price) && q.price)
      || [];
    /* Los metros: los del consumo van a meters_lo/hi, y los FACTURABLES (con su regla de rollo) a
     * meters_billable — el desglose congelado los trae en `billing.facturable`. */
    const consumo = Array.isArray(q.meters) ? q.meters : [];
    const facturable = (q.billing && Array.isArray(q.billing.facturable) && q.billing.facturable)
      || (Array.isArray(q.metersBillable) && q.metersBillable) || [];

    db.prepare(`INSERT INTO quotes (
        id, namespace, date, status, service_id, service_label, journey, furniture, quantity_label,
        customer_name, customer_email, customer_phone, city, service_point_id, service_point_name,
        seller_id, seller_name, fabric_ref, fabric_name, estimate_lo, estimate_hi,
        meters_lo, meters_hi, meters_billable, notes, data, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id, namespace) DO UPDATE SET
        date=excluded.date, status=excluded.status, service_id=excluded.service_id,
        service_label=excluded.service_label, journey=excluded.journey, furniture=excluded.furniture,
        quantity_label=excluded.quantity_label, customer_name=excluded.customer_name,
        customer_email=excluded.customer_email, customer_phone=excluded.customer_phone,
        city=excluded.city, service_point_id=excluded.service_point_id,
        service_point_name=excluded.service_point_name, seller_id=excluded.seller_id,
        seller_name=excluded.seller_name, fabric_ref=excluded.fabric_ref, fabric_name=excluded.fabric_name,
        estimate_lo=excluded.estimate_lo, estimate_hi=excluded.estimate_hi, meters_lo=excluded.meters_lo,
        meters_hi=excluded.meters_hi, meters_billable=excluded.meters_billable, notes=excluded.notes,
        data=excluded.data, updated_at=excluded.updated_at`)
      .run(
        String(q.id), ns, txt(q.date), txt(q.status), txt(servicio.id), txt(servicio.label),
        txt(servicio.journey), txt(q.furniture || principal.furniture), txt(q.quantityLabel),
        txt(cliente.name), txt(cliente.email), txt(cliente.phone),
        txt(q.city || cliente.city), txt(q.servicePointId), txt(q.servicePointName || q.servicePoint),
        txt(q.sellerId || (q.seller && q.seller.id)), txt(q.sellerName || (q.seller && q.seller.name) || q.seller),
        txt(q.fabricRef || (q.fabric && q.fabric.ref)), txt(q.fabricName || (q.fabric && q.fabric.name)),
        num(total[0]), num(total[1]), num(consumo[0]), num(consumo[1]),
        num(facturable[0]) !== null ? num(facturable[0]) : num(facturable[1]),
        txt(q.notes || q.comment),
        JSON.stringify(elResto(q)),
        txt(q.createdAt) || ahora, ahora
      );

    /* Las piezas: se borran y se reescriben — es la foto completa de la cotización, no un parche. */
    st.borrarPiezas.run(String(q.id), ns);
    const pieza = db.prepare(`INSERT INTO quote_pieces (
        quote_id, namespace, idx, furniture, quantity, coverage, cushions, width_cm, height_cm, depth_cm,
        note, photos_count, meters_lo, meters_hi, value_lo, value_hi, data)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    (Array.isArray(q.pieces) ? q.pieces : []).forEach((x, i) => {
      const m = x.measures || {};
      const v = Array.isArray(x.value) ? x.value : [];
      const me = Array.isArray(x.meters) ? x.meters : [];
      pieza.run(String(q.id), ns, i + 1, txt(x.furniture), num(x.quantity), txt(x.coverage), num(x.cushions),
        num(m.width), num(m.height), num(m.depth), txt(x.note), num(x.photos), num(me[0]), num(me[1]),
        num(v[0]), num(v[1]), JSON.stringify(x.data || {}));
    });

    /* Las fotos: si vienen con dataURL, el archivo se guarda en disco y en la base va su ruta.
     * SOLO se tocan cuando el cuerpo las trae: un cambio de estado que no las mande no puede borrarlas. */
    const traeFotos = Array.isArray(q.photos);
    if (traeFotos) st.borrarFotos.run(String(q.id), ns);
    const foto = db.prepare(`INSERT INTO quote_photos (quote_id, namespace, piece_idx, slot, path, width, height, bytes, data)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    const porPieza = {};
    (traeFotos ? q.photos : []).forEach((f, i) => {
      if (!f) return;
      const cual = Number.isInteger(f.pieza) ? f.pieza + 1 : null;      // la pieza es 0-based en la página
      porPieza[cual] = (porPieza[cual] || 0) + 1;
      let ruta = txt(f.path);
      if (!ruta && typeof f.dataUrl === 'string' && f.dataUrl.startsWith('data:')) {
        const ext = (f.dataUrl.match(/^data:image\/(\w+)/) || [, 'png'])[1];
        ruta = `data/photos/${ns}/${q.id}/${String(i + 1).padStart(2, '0')}.${ext}`;
        try {
          mkdirSync(dirname(resolve(ruta)), { recursive: true });
          writeFileSync(resolve(ruta), Buffer.from(f.dataUrl.split(',')[1] || '', 'base64'));
        } catch (err) { ruta = null; }
      }
      foto.run(String(q.id), ns, cual, porPieza[cual], ruta, num(f.width), num(f.height), num(f.bytes),
        JSON.stringify({ mime: f.mime || null, name: f.name || null }));
    });
  }

  /* Arma el JSON que las páginas conocen, desde las tablas. */
  function armarCotizacion(fila) {
    let extra = {};
    try { extra = JSON.parse(fila.data || '{}'); } catch (err) { extra = {}; }
    const piezas = st.leerPiezas.all(fila.id, fila.namespace).map(x => {
      let suyo = {};
      try { suyo = JSON.parse(x.data || '{}'); } catch (err) { suyo = {}; }
      return Object.assign({
        furniture: x.furniture, quantity: x.quantity, coverage: x.coverage, cushions: x.cushions,
        measures: { width: x.width_cm, height: x.height_cm, depth: x.depth_cm },
        note: x.note, photos: x.photos_count,
        meters: [x.meters_lo, x.meters_hi], value: [x.value_lo, x.value_hi]
      }, suyo);
    });
    const fotos = st.leerFotos.all(fila.id, fila.namespace).map(f => {
      let suyo = {};
      try { suyo = JSON.parse(f.data || '{}'); } catch (err) { suyo = {}; }
      return Object.assign({
        pieza: f.piece_idx ? f.piece_idx - 1 : null, path: f.path,
        width: f.width, height: f.height, bytes: f.bytes
      }, suyo);
    });
    const tienePrecio = fila.estimate_lo !== null || fila.estimate_hi !== null;
    const tieneMetros = fila.meters_lo !== null || fila.meters_hi !== null;

    return Object.assign({
      id: fila.id,
      date: fila.date,
      status: fila.status,
      customer: { name: fila.customer_name, email: fila.customer_email, phone: fila.customer_phone },
      service: { id: fila.service_id, label: fila.service_label, journey: fila.journey },
      furniture: fila.furniture,
      quantityLabel: fila.quantity_label,
      city: fila.city,
      servicePointId: fila.service_point_id,
      servicePointName: fila.service_point_name,
      sellerId: fila.seller_id,
      sellerName: fila.seller_name,
      fabricRef: fila.fabric_ref,
      fabricName: fila.fabric_name,
      price: tienePrecio ? { total: [fila.estimate_lo, fila.estimate_hi] } : null,
      metersBillable: tieneMetros ? [fila.meters_lo, fila.meters_hi] : null,
      notes: fila.notes,
      pieces: piezas,
      photos: fotos
    }, extra);
  }

  /* ── la cara del motor (las rutas la usan igual para este y para Mongo) ─────── */
  return {
    nombre: 'sqlite',
    async listar(ns) {
      abrir();
      const quotes = st.leerCotizaciones.all(ns).map(armarCotizacion);
      const marca = st.leerMarca.get(ns);
      return { quotes, total: quotes.length, resetAt: (marca && marca.reset_at) || '' };
    },
    async guardar(ns, filas) {
      abrir();
      let guardadas = 0;
      for (const q of filas) { if (!q || !q.id) continue; guardarCotizacion(q, ns); guardadas++; }
      return guardadas;
    },
    async borrar(ns, id) {
      abrir();
      const r = st.borrarUna.run(id, ns);
      return r.changes || 0;
    },
    async reiniciar(ns) {
      abrir();
      st.borrarTodo.run(ns);
      const ahora = new Date().toISOString();
      st.ponerMarca.run(ns, ahora);
      return ahora;
    },
    async leerFoto(ns, id, archivo) {
      /* El archivo viene de la URL: se acepta un nombre suelto, nunca una ruta que suba o baje. */
      if (!archivo || archivo.includes('/') || archivo.includes('\\') || archivo.includes('..')) return null;
      const rutaFoto = resolve('data', 'photos', ns, id, archivo);
      if (!existsSync(rutaFoto)) return null;
      try {
        return { buffer: readFileSync(rutaFoto), mime: MIME_POR_EXT[extname(archivo).toLowerCase()] || 'application/octet-stream' };
      } catch (err) { return null; }
    }
  };
}
