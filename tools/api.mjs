/* LA BASE DEL PROTOTIPO (SQLite del servidor) — MODELO, no un cajón de JSON.
 *
 * Antes cada cotización era una fila con el JSON entero dentro (`payload`). Eso sirve para una demo y no
 * para lo que viene: la base real y el backend. Aquí está el modelo de verdad:
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
 * Rutas (solo el servidor local):
 *   GET    /api/quotes?ns=<namespace>   → { quotes: [...], total, resetAt }
 *   PUT    /api/quotes                  → { ns, quotes: [una o varias] }  (guarda y reparte a las tablas)
 *   DELETE /api/quotes/:id?ns=<namespace>
 *   POST   /api/reset?ns=<namespace>    → corre las seeds: borra el namespace y deja la marca
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const RUTA = resolve(process.env.QUOTER_DB || 'data/quoter.db');
mkdirSync(dirname(RUTA), { recursive: true });
const db = new DatabaseSync(RUTA);
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

/* ── el mapeador: el JSON que conocen las páginas ↔ las tablas ──────────────── */
const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
const txt = v => (v === null || v === undefined) ? null : String(v);

function guardarCotizacion(q, ns) {
  const ahora = new Date().toISOString();
  const servicio = q.service || {};
  const cliente = q.customer || {};
  const principal = (q.pieces && q.pieces[0]) || {};
  const p = q.price || q.estimate || {};
  const rango = Array.isArray(p.total) ? p.total : [];
  const metros = Array.isArray(q.metersBillable) ? q.metersBillable : [];

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
      txt(q.sellerId || (q.seller && q.seller.id)), txt(q.sellerName || (q.seller && q.seller.name)),
      txt(q.fabricRef || (q.fabric && q.fabric.ref)), txt(q.fabricName || (q.fabric && q.fabric.name)),
      num(rango[0]), num(rango[1]), num(metros[0]), num(metros[1]), null,
      txt(q.notes || q.comment),
      JSON.stringify(q.data || {}),
      txt(q.createdAt) || ahora, ahora
    );

  /* Las piezas: se borran y se reescriben — es la foto completa de la cotización, no un parche. */
  db.prepare('DELETE FROM quote_pieces WHERE quote_id = ? AND namespace = ?').run(String(q.id), ns);
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
  if (traeFotos) db.prepare('DELETE FROM quote_photos WHERE quote_id = ? AND namespace = ?').run(String(q.id), ns);
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
const leerCotizaciones = db.prepare('SELECT * FROM quotes WHERE namespace = ? ORDER BY date DESC, id DESC');
const leerPiezas = db.prepare('SELECT * FROM quote_pieces WHERE quote_id = ? AND namespace = ? ORDER BY idx');
const leerFotos = db.prepare('SELECT * FROM quote_photos WHERE quote_id = ? AND namespace = ? ORDER BY piece_idx, slot');

function armarCotizacion(fila) {
  let extra = {};
  try { extra = JSON.parse(fila.data || '{}'); } catch (err) { extra = {}; }
  const piezas = leerPiezas.all(fila.id, fila.namespace).map(x => {
    let suyo = {};
    try { suyo = JSON.parse(x.data || '{}'); } catch (err) { suyo = {}; }
    return Object.assign({
      furniture: x.furniture, quantity: x.quantity, coverage: x.coverage, cushions: x.cushions,
      measures: { width: x.width_cm, height: x.height_cm, depth: x.depth_cm },
      note: x.note, photos: x.photos_count,
      meters: [x.meters_lo, x.meters_hi], value: [x.value_lo, x.value_hi]
    }, suyo);
  });
  const fotos = leerFotos.all(fila.id, fila.namespace).map(f => {
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

/* ── migración: lo que estaba como JSON entra al modelo, una sola vez ───────── */
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

/* ── las rutas ─────────────────────────────────────────────────────────────── */
function responder(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
const leerMarca = db.prepare('SELECT reset_at FROM meta WHERE namespace = ?');
const ponerMarca = db.prepare('INSERT INTO meta (namespace, reset_at) VALUES (?, ?) ON CONFLICT(namespace) DO UPDATE SET reset_at = excluded.reset_at');
const borrarTodo = db.prepare('DELETE FROM quotes WHERE namespace = ?');

/* Devuelve true si atendió la petición (el servidor sigue con sus archivos si no). */
export function laBase(req, res, url) {
  if (!url.pathname.startsWith('/api/quotes') && url.pathname !== '/api/reset') return false;
  const ns = url.searchParams.get('ns') || '';

  if (req.method === 'GET' && url.pathname === '/api/quotes') {
    try {
      const quotes = leerCotizaciones.all(ns).map(armarCotizacion);
      const marca = leerMarca.get(ns);
      return responder(res, 200, { quotes: quotes, total: quotes.length, resetAt: (marca && marca.reset_at) || '' }), true;
    } catch (err) {
      return responder(res, 500, { error: 'no pude leer la base: ' + err.message }), true;
    }
  }

  if ((req.method === 'PUT' || req.method === 'POST') && url.pathname === '/api/quotes') {
    let cuerpo = '';
    req.on('data', c => { cuerpo += c; if (cuerpo.length > 8e6) req.destroy(); });
    req.on('end', () => {
      try {
        const dato = JSON.parse(cuerpo || '{}');
        const quien = String(dato.ns || ns || '');
        const filas = Array.isArray(dato.quotes) ? dato.quotes : (dato.quote ? [dato.quote] : []);
        let guardadas = 0;
        for (const q of filas) {
          if (!q || !q.id) continue;
          guardarCotizacion(q, quien);
          guardadas++;
        }
        responder(res, 200, { guardadas: guardadas, ns: quien });
      } catch (err) {
        responder(res, 400, { error: 'cuerpo ilegible: ' + err.message });
      }
    });
    return true;
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/quotes/')) {
    const id = decodeURIComponent(url.pathname.slice('/api/quotes/'.length));
    const r = db.prepare('DELETE FROM quotes WHERE id = ? AND namespace = ?').run(id, ns);
    return responder(res, 200, { borradas: r.changes || 0, id: id }), true;
  }

  /* EL BOTÓN DE LAS SEEDS: borra lo del namespace y deja marca de cuándo, para que un navegador con
   * copia vieja no vuelva a empujar lo que se borró. */
  if (req.method === 'POST' && url.pathname === '/api/reset') {
    borrarTodo.run(ns);
    const ahora = new Date().toISOString();
    ponerMarca.run(ns, ahora);
    return responder(res, 200, { borradas: true, ns: ns, resetAt: ahora }), true;
  }

  return responder(res, 405, { error: 'método no permitido' }), true;
}
