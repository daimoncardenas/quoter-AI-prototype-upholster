/* Shared data layer for the upholster-prototype-quoter prototypes.
 *
 * Loaded as a classic script on purpose. Both pages are opened straight from
 * disk (file://), where ES modules are CORS-blocked but <script src> is not.
 *
 * Records are stored as one JSON array per entity in localStorage. That store
 * tops out around 5 MB, which is thousands of records — never a constraint for
 * fabrics, sellers or quotes. Uploaded photos are a different matter: one photo
 * runs 200 KB to several MB as a base64 data URL, so roughly two dozen would
 * fill the whole budget. Photos therefore live in IndexedDB (~4 GB available)
 * and records reference them by id.
 */
(function (global) {
  'use strict';

  var NS = '{{STORAGE_NS}}';

  /* ---------------------------------------------------------------- seeds -- */

  var SEEDS = {
    // needs / styles / colorFamily are what the recommendation matches against.
    // tags stay purely descriptive: they are shown on the card, not scored.
    fabrics: {{FABRICS_JSON}},
    // Muebles: cada tipo define su consumo, su unidad de cantidad y los rangos
    // de medida plausibles que usa la revisión del paso 4.
    //   scaleByQty : la cantidad cuenta piezas separadas, así que multiplica.
    //   widthScaled: el ancho describe una sola pieza, así que escala el consumo.
    // Un sofá mide en "puestos" la misma pieza que mide el ancho, por eso no
    // multiplica: contaría dos veces el mismo mueble.
    furniture: [
      { id:'sofa',     name:'Sofá',      icon:'▰', hint:'2 a 4 puestos',      order:1, active:true, meters:[12,16],   quantityLabel:'Número de puestos',     unit:['puesto','puestos'],     scaleByQty:false, widthScaled:true,  ranges:{width:[140,320],height:[55,120],depth:[70,120]} },
      { id:'sofa-l',   name:'Sofá en L', icon:'⌞', hint:'Seccional',          order:2, active:true, meters:[18,24],   quantityLabel:'Número de módulos',     unit:['módulo','módulos'],     scaleByQty:false, widthScaled:true,  ranges:{width:[200,420],height:[55,120],depth:[70,200]} },
      { id:'poltrona', name:'Poltrona',  icon:'▣', hint:'Una plaza',          order:3, active:true, meters:[5,8],     quantityLabel:'Cantidad de poltronas', unit:['poltrona','poltronas'], scaleByQty:true,  widthScaled:false, ranges:{width:[55,130], height:[55,130],depth:[55,120]} },
      { id:'silla',    name:'Silla',     icon:'♧', hint:'Comedor o auxiliar', order:4, active:true, meters:[1.5,2.5], quantityLabel:'Cantidad de sillas',    unit:['silla','sillas'],       scaleByQty:true,  widthScaled:false, ranges:{width:[30,75],  height:[60,130],depth:[30,80]} },
      { id:'cabecero', name:'Cabecero',  icon:'▥', hint:'Cama',               order:5, active:true, meters:[3,6],     quantityLabel:'Número de cabeceros',   unit:['cabecero','cabeceros'], scaleByQty:true,  widthScaled:true,  ranges:{width:[80,240], height:[35,180],depth:[3,30]} },
      { id:'otro',     name:'Otro',      icon:'＋', hint:'Cuéntanos cuál',     order:6, active:true, meters:[6,12],    quantityLabel:'Cantidad',              unit:['unidad','unidades'],    scaleByQty:true,  widthScaled:false, ranges:{width:[20,1000],height:[20,500],depth:[5,500]} }
    ],
    // Usuarios del backoffice. Los vendedores tienen cuenta propia; el rol
    // decide qué secciones ve cada uno.
    users: {{USERS_JSON}},
    // Puntos de atención reales del cliente. El cotizador los agrupa por
    // ciudad en el selector "Punto de atención". Un vendedor cubre puntos por
    // id (servicePointIds), nunca por texto libre — así un punto se puede
    // renombrar o mudar de dirección sin desligar a nadie.
    servicePoints: {{SERVICE_POINTS_JSON}},
    sellers: {{SELLERS_JSON}},
    quotes: {{QUOTES_JSON}}
  };

  var DEFAULT_SETTINGS = {
    wastePct: 12,
    marginPct: 8,
    // El modelo por componentes da un número; se publica como rango porque
    // sigue aproximando geometría de brazos, costuras y criterio del tapicero.
    rangeTolerancePct: 6,
    currency: 'COP',
    // CARDYRAM's own subscription plan for the quoter product (backoffice
    // "Upgrade" page) — same default for every client, so it belongs here and
    // not in a client pack's seed.json, which holds only THAT client's data.
    plan: 'Essential',
    autoAssignByZone: true,
    emailClientCopy: true,
    aiPhotoCheck: true,
    confirmationMessage: 'Hemos recibido tu solicitud. Uno de nuestros asesores revisará los datos y se comunicará contigo para confirmar la cotización.',
    senderEmail: {{SENDER_EMAIL_JSON}},
    responseTime: 'Durante el mismo día hábil',
    // Opciones del cuestionario, editables desde Configuración.
    needs: ['Mascotas','Fácil limpieza','Resistente al agua','Alto tráfico','Suave','Sol'],
    styles: ['Moderno','Clásico','Minimalista','Natural','No estoy seguro'],
    colors: ['Neutros y arena','Grises','Verdes','Azules','Tonos cálidos','Quiero recomendaciones'],
    // Deben cubrir el rango real del catálogo (89.000–144.000), o todas las
    // telas quedan "sobre presupuesto" y el filtro no informa nada.
    budgets: {{BUDGETS_JSON}},
    maxQuantity: 5,
    minPhotos: 3,
    maxPhotos: 7,
    // Proporción de tela cuando no se tapiza el mueble completo.
    coverageSeats: [68,70],
    coveragePartial: [45,50]
  };

  /* ------------------------------------------------------------ primitives -- */

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function read(entity) {
    try {
      var raw = localStorage.getItem(NS + entity);
      if (raw !== null) return JSON.parse(raw);
    } catch (err) {
      // Corrupt JSON or storage disabled: fall back to the seed rather than
      // leaving the page with no catalog at all.
      console.warn('[store] could not read "' + entity + '", using seed data', err);
    }
    if (entity === 'servicePoints') return migrateServicePoints();
    var seed = clone(SEEDS[entity] || []);
    try { write(entity, seed); } catch (err) { /* read-only storage is survivable */ }
    return seed;
  }

  /* Placeholder zone names from the demo seeds that predate the real service
   * points (this client's actual stores) — stand-ins for "Laura covers
   * the north" etc. This list only ever applies to the four ORIGINAL demo
   * sellers (id 1-4): those are the only ones who could have had these exact
   * strings seeded for them. A custom seller who happens to have typed
   * 'Chía' as a zone typed a real place, not a demo stand-in, so their zones
   * are never filtered against this list — see the `seed` guard below.
   * Deliberately excludes 'Cali': that one happens to still be a real point
   * today, so it is treated like any other zone name a migrating seller
   * might have. */
  var LEGACY_PLACEHOLDER_ZONES = ['Bogotá Norte', 'Bogotá Centro', 'Bogotá Occidente',
    'Cajicá', 'Chía', 'Envigado', 'Medellín', 'Rionegro', 'Palmira'].map(norm);

  /* A browser that already has "med.v1.sellers" from before servicePoints
   * existed stores zones as free text. The first read with no servicePoints
   * key migrates those sellers, then rewrites them to servicePointIds and
   * drops zones. Once med.v1.servicePoints exists this never runs again, so
   * it is safe to call on every uninitialised read.
   *
   * Two cases per seller:
   *  - One of the four original demo sellers (id 1-4, `seed` below) whose
   *    zones are ALL placeholder names: those names never mapped to a real
   *    place, so the seller is given that seed seller's real
   *    servicePointIds outright instead of trying to match text that was
   *    always a stand-in. If their zones are a MIX of placeholder and real
   *    text, only the placeholder ones are dropped; the rest match/become
   *    points normally.
   *  - Any other seller (not one of the four): every zone is real text they
   *    typed, so each one is matched to an existing point by name, or
   *    becomes a new point — the placeholder list is never consulted, so a
   *    custom seller never silently loses coverage just because their zone
   *    happens to share a name with a retired demo stand-in. */
  function migrateServicePoints() {
    var points = clone(SEEDS.servicePoints);
    var sellersRaw;
    try { sellersRaw = localStorage.getItem(NS + 'sellers'); } catch (err) { sellersRaw = null; }
    if (sellersRaw === null) {
      // No sellers stored yet: nothing legacy to fold in, the seeds already agree.
      try { write('servicePoints', points); } catch (err) { /* read-only storage is survivable */ }
      return points;
    }
    var sellers;
    try { sellers = JSON.parse(sellersRaw); } catch (err) { sellers = null; }
    if (!Array.isArray(sellers)) {
      try { write('servicePoints', points); } catch (err) { /* ignore */ }
      return points;
    }
    var order = points.length, changed = false;
    sellers.forEach(function (s) {
      if (!s || !Array.isArray(s.zones)) return; // already on the new shape
      changed = true;
      var seed = SEEDS.sellers.filter(function (x) { return String(x.id) === String(s.id); })[0];
      var isPlaceholder = function (z) { return LEGACY_PLACEHOLDER_ZONES.indexOf(norm(z)) >= 0; };
      var allPlaceholder = !!seed && s.zones.length > 0 && s.zones.every(isPlaceholder);
      if (allPlaceholder) {
        s.servicePointIds = seed.servicePointIds.slice();
        delete s.zones;
        return;
      }
      var ids = [];
      s.zones.forEach(function (zoneName) {
        if (seed && isPlaceholder(zoneName)) return; // demo stand-in, only ever on a seed seller
        var zn = norm(zoneName);
        var match = points.filter(function (p) { return norm(p.name) === zn; })[0];
        if (!match) {
          order++;
          match = { id: 'sp-' + Date.now() + '-' + order, name: String(zoneName).trim(), city: String(zoneName).trim(), active: true, order: order };
          points.push(match);
        }
        if (ids.indexOf(match.id) < 0) ids.push(match.id);
      });
      s.servicePointIds = ids;
      delete s.zones;
    });
    try { write('servicePoints', points); } catch (err) { /* ignore */ }
    if (changed) { try { write('sellers', sellers); } catch (err) { /* ignore */ } }
    return points;
  }

  function write(entity, rows) {
    try {
      localStorage.setItem(NS + entity, JSON.stringify(rows));
    } catch (err) {
      // Realistically QuotaExceededError. Let the caller decide how to tell the
      // user; failing silently would lose their data without warning.
      throw new Error('No se pudo guardar "' + entity + '": ' + err.name);
    }
    return rows;
  }

  /* --------------------------------------------------------- quote cycle --
   *
   * The sales-demo cycle: a request arrives (Nueva), a seller works it (En
   * gestión), a formal quotation goes out (Cotizada) — these three move
   * freely, forward or back, because a seller regularly has to walk one back
   * (e.g. a client asks for changes after being quoted). Only from Cotizada
   * can the case be CLOSED, as Aceptada or Rechazada; once closed the status
   * is locked for everyone, admin included — see Store.put's guard below,
   * which is what actually enforces the lock (setQuoteStatus is a UI
   * convenience on top of it, not the only door). */
  var QUOTE_NON_FINAL_STATUSES = ['Nueva', 'En gestión', 'Cotizada'];
  var QUOTE_FINAL_STATUSES = ['Aceptada', 'Rechazada'];

  /* A quote counts as closed if its status is final OR it carries closedAt —
   * either is enough, so a row that got a final status without the
   * timestamp (a hand-edited pack, an import, a future migration) still
   * locks. Nothing in this codebase writes that shape today, but every
   * caller that decides "is this closed" goes through here instead of
   * checking `status` or `closedAt` alone, so that stays true even if one of
   * the two is ever missing. */
  function isQuoteClosed(q) {
    return !!q && (QUOTE_FINAL_STATUSES.indexOf(q.status) >= 0 || !!q.closedAt);
  }

  /* ----------------------------------------------------------------- store -- */

  var Store = {
    all: function (entity) { return read(entity); },

    get: function (entity, id) {
      var rows = read(entity);
      for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(id)) return rows[i];
      return null;
    },

    QUOTE_NON_FINAL_STATUSES: QUOTE_NON_FINAL_STATUSES.slice(),
    QUOTE_FINAL_STATUSES: QUOTE_FINAL_STATUSES.slice(),

    /* Shared by Store.put's guard, setQuoteStatus and the admin UI — see
     * isQuoteClosed() above for why it checks both status and closedAt. */
    isQuoteClosed: isQuoteClosed,

    /* Upsert by id. Returns the stored record.
     *
     * THE DATA-LAYER LOCK: once a quote is closed (isQuoteClosed on the
     * STORED row), its status can never change again through this path — the
     * only path both pages use to write a quote. This is a demo gate, same
     * spirit as Auth (see below): cheap to bypass in devtools, but enough to
     * demonstrate that a closed case really is final, not just hidden in the
     * UI. */
    put: function (entity, record) {
      var rows = read(entity);
      if (record.id === undefined || record.id === null || record.id === '') record.id = Date.now();
      var i = rows.findIndex(function (r) { return String(r.id) === String(record.id); });
      if (entity === 'quotes' && i >= 0 && isQuoteClosed(rows[i]) && record.status !== rows[i].status) {
        throw new Error('Esta cotización ya está cerrada; el estado no se puede modificar.');
      }
      if (i >= 0) rows[i] = record; else rows.unshift(record);
      write(entity, rows);
      return record;
    },

    /* The one place that decides whether a status change is legal: non-final
     * statuses move freely, a final one only lands from Cotizada, and
     * nothing moves at all once the quote isQuoteClosed (Store.put enforces
     * that last part even if a caller skips this function entirely). Stamps
     * closedAt (ISO timestamp) the moment a case closes. */
    setQuoteStatus: function (id, status) {
      var q = Store.get('quotes', id);
      if (!q) throw new Error('Cotización no encontrada');
      if (isQuoteClosed(q)) throw new Error('Esta cotización ya está cerrada; el estado no se puede modificar.');
      var isFinal = QUOTE_FINAL_STATUSES.indexOf(status) >= 0;
      if (isFinal) {
        if (q.status !== 'Cotizada') throw new Error('Solo se puede cerrar un caso desde "Cotizada".');
        q.closedAt = new Date().toISOString();
      } else if (QUOTE_NON_FINAL_STATUSES.indexOf(status) < 0) {
        throw new Error('Estado desconocido: ' + status);
      }
      q.status = status;
      return Store.put('quotes', q);
    },

    /* Comments are append-only and allowed at ANY status, closed included —
     * a closed case still gets follow-up notes. Writes straight to storage
     * instead of going through Store.put, which is deliberate: put's lock is
     * about the STATUS field, not the record, and a comment never touches
     * status. */
    addComment: function (id, comment) {
      var rows = read('quotes');
      var i = rows.findIndex(function (r) { return String(r.id) === String(id); });
      if (i < 0) throw new Error('Cotización no encontrada');
      var text = String((comment && comment.text) || '').trim();
      if (!text) throw new Error('El comentario no puede quedar vacío');
      var entry = {
        author: (comment && comment.author) || 'Desconocido',
        authorId: comment && comment.authorId,
        date: new Date().toISOString(),
        text: text
      };
      var q = rows[i];
      q.comments = (q.comments || []).concat([entry]);
      write('quotes', rows);
      return entry;
    },

    /* Old quotes predate comments entirely, so their field is missing, not
     * empty — this is the one place that decides "missing" means "none". */
    quoteComments: function (quote) { return (quote && quote.comments) || []; },

    remove: function (entity, id) {
      write(entity, read(entity).filter(function (r) { return String(r.id) !== String(id); }));
    },

    settings: function () {
      var saved = {};
      try { saved = JSON.parse(localStorage.getItem(NS + 'settings') || '{}'); } catch (err) { saved = {}; }
      var out = clone(DEFAULT_SETTINGS);
      Object.keys(saved).forEach(function (k) { out[k] = saved[k]; });
      return out;
    },

    saveSettings: function (patch) {
      var next = Store.settings();
      Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
      write('settings', next);
      return next;
    },

    /* Wipe everything back to seed state. Used by the reset control. */
    reset: function () {
      ['fabrics', 'sellers', 'quotes', 'furniture', 'users', 'settings', 'servicePoints'].forEach(function (e) {
        try { localStorage.removeItem(NS + e); } catch (err) { /* ignore */ }
      });
      try { indexedDB.deleteDatabase('med-photos'); } catch (err) { /* ignore */ }
    },

    /* Fires when the *other* page writes, so an open tab stays in sync. */
    onChange: function (fn) {
      global.addEventListener('storage', function (e) {
        if (e.key && e.key.indexOf(NS) === 0) fn(e.key.slice(NS.length));
      });
    },

    /* ------------------------------------------------------------ helpers -- */

    money: function (n) {
      var c = Store.settings().currency;
      return new Intl.NumberFormat(c === 'USD' ? 'en-US' : 'es-CO', {
        style: 'currency', currency: c, maximumFractionDigits: 0
      }).format(n || 0);
    },

    /* One definition of a fabric swatch so both pages render it identically. */
    swatch: function (fabric) {
      var hex = /^#[0-9a-f]{3,8}$/i.test(String(fabric && fabric.color)) ? fabric.color : '#cccccc';
      return 'linear-gradient(135deg,' + hex + ' 0%,' + tint(hex, 0.28) + ' 100%)';
    },

    /* Defaults so a tela created before commercial rules existed still quotes:
     * fine increments, no minimum, remainder goes back to inventory. */
    fabricRules: function (fabric) {
      var f = fabric || {};
      var num = function (v, fallback) { var n = +v; return isFinite(n) && n > 0 ? n : fallback; };
      return {
        rollWidthCm: num(f.rollWidthCm, 140),
        rollLengthM: num(f.rollLengthM, 30),
        saleUnit: f.saleUnit === 'rollo' ? 'rollo' : 'metro',
        incrementM: num(f.incrementM, 0.1),
        minOrderM: num(f.minOrderM, 0),
        supplierMinM: num(f.supplierMinM, 0),
        reusableRemainder: f.reusableRemainder !== false
      };
    },

    /* The component estimate for a furniture type that has a template, or null
     * so the caller falls back to the baseline range. Fabric-dependent on
     * purpose: the roll width is what decides how the pieces pack. */
    estimateByComponents: function (furniture, inputs, fabric) {
      var tpl = FURNITURE_TEMPLATES[furniture && furniture.id];
      if (!tpl) return null;
      var missing = tpl.needs.some(function (k) { return !(+inputs[k] > 0); });
      if (missing) return null;

      var pieces = tpl.pieces(inputs);
      if (!pieces.length) return null;

      var rollM = Store.fabricRules(fabric).rollWidthCm / 100;
      var tecnico = 0;
      var despiece = pieces.map(function (p) {
        // The allowance is per piece, on both dimensions, not on the total.
        var w = p.w + SEAM, h = p.h + SEAM;
        var metres = packRun(p.qty, w, h, rollM);
        tecnico += metres;
        return { name: p.name, qty: p.qty, w: round2(w), h: round2(h), metres: round2(metres) };
      });

      var s = Store.settings();
      var centro = tecnico * (1 + (+s.wastePct || 0) / 100) * (1 + (+s.marginPct || 0) / 100);
      var tol = Math.max(0, +s.rangeTolerancePct || 0) / 100;
      return {
        modelo: 'componentes',
        rollWidthCm: Store.fabricRules(fabric).rollWidthCm,
        tecnico: round2(tecnico),
        despiece: despiece,
        // Never quote short: both ends round up to the tenth.
        range: [ceilTo(centro * (1 - tol), 0.1), ceilTo(centro * (1 + tol), 0.1)]
      };
    },

    /* Which furniture types already calculate by pieces rather than by the
     * baseline lookup. Lets them migrate one at a time. */
    hasComponentModel: function (furniture) {
      return !!FURNITURE_TEMPLATES[furniture && furniture.id];
    },

    /* Whether an optional wizard field feeds this furniture's calculation.
     * Nothing without a template consumes anything optional. */
    templateUses: function (furniture, input) {
      var tpl = FURNITURE_TEMPLATES[furniture && furniture.id];
      return !!tpl && (tpl.optional || []).indexOf(input) >= 0;
    },

    /* Three numbers that get confused constantly, and are only equal when the
     * fabric sells in fine increments with no minimum:
     *   consumo    — what the furniture is expected to eat
     *   compra     — what the business has to acquire to cover it
     *   facturable — what the customer is actually charged
     * A remainder that can go back to inventory is the business's; one that
     * cannot is the customer's, and they pay for it. */
    quantities: function (fabric, meters) {
      var r = Store.fabricRules(fabric);
      var consumo = Math.max(0, +meters || 0);
      var razones = [];

      var compra;
      if (r.saleUnit === 'rollo') {
        compra = Math.max(1, Math.ceil(round2(consumo / r.rollLengthM) - 1e-9)) * r.rollLengthM;
        razones.push('Esta tela se vende por rollo completo de ' + fmtM(r.rollLengthM) + ' m.');
      } else {
        compra = ceilTo(consumo, r.incrementM);
        if (r.supplierMinM > compra) {
          compra = ceilTo(r.supplierMinM, r.incrementM);
          razones.push('El proveedor no despacha menos de ' + fmtM(r.supplierMinM) + ' m de esta tela.');
        }
      }

      var facturable;
      if (r.reusableRemainder) {
        facturable = ceilTo(consumo, r.incrementM);
        if (facturable < r.minOrderM) {
          facturable = ceilTo(r.minOrderM, r.incrementM);
          razones.push('El pedido mínimo de esta tela es de ' + fmtM(r.minOrderM) + ' m.');
        }
        if (r.incrementM > 0.1 && facturable > consumo) {
          razones.push('Se vende en múltiplos de ' + fmtM(r.incrementM) + ' m.');
        }
      } else {
        // Nothing comes back to inventory, so the whole purchase is billed.
        facturable = compra;
        if (facturable > consumo) razones.push('El sobrante de esta tela no vuelve al inventario, así que se cotiza completo.');
      }

      // No se puede facturar más de lo que se compra: un pedido mínimo de venta
      // por encima del corte obliga a traer esa cantidad.
      if (facturable > compra) compra = facturable;

      return {
        consumo: round2(consumo),
        compra: round2(compra),
        facturable: round2(facturable),
        // La tela que sobra físicamente después de cubrir el mueble. Se mide
        // contra el consumo, no contra lo facturado: cuando el cliente paga la
        // compra entera es justo cuando ese sobrante hay que explicarlo.
        sobrante: round2(Math.max(0, compra - consumo)),
        razones: razones,
        reglas: r
      };
    },

    /* A fabric photo lives in IndexedDB, so a swatch paints in two passes: the
     * colour synchronously, the photo when it arrives. Callers keep rendering
     * their markup in one go and hand us the element afterwards. */
    paintSwatch: function (el, fabric) {
      if (!el) return Promise.resolve(false);
      el.style.background = Store.swatch(fabric);
      el.classList.remove('has-photo');
      if (!fabric || !fabric.photoId) return Promise.resolve(false);
      return Photos.get(fabric.photoId).then(function (url) {
        if (!url) return false;
        el.style.background = 'center/cover no-repeat url("' + url + '")';
        el.classList.add('has-photo');
        return true;
      });
    },

    /* One id per fabric, so re-uploading overwrites instead of orphaning. */
    fabricPhotoId: function (fabricId) { return 'fabric-' + fabricId; },

    /* A quote points at its adviser by id and keeps their name only as a label,
     * so renaming someone in the backoffice does not orphan their history. Old
     * rows saved before the id existed still resolve through that label. */
    sellerName: function (quote) {
      if (!quote) return '';
      if (quote.sellerId !== undefined && quote.sellerId !== null && quote.sellerId !== '') {
        var s = Store.get('sellers', quote.sellerId);
        if (s) return s.name;
      }
      return quote.seller || '';
    },

    /* The label is denormalised, so a rename has to walk the quotes and refresh
     * it — otherwise search and the CSV export would still read the old name. */
    retagQuotes: function (sellerId, name) {
      var rows = read('quotes'), touched = 0;
      rows.forEach(function (q) {
        if (String(q.sellerId) !== String(sellerId) || q.seller === name) return;
        q.seller = name; touched++;
      });
      if (touched) write('quotes', rows);
      return touched;
    },

    /* Active points, in the order the backoffice set — this is what the
     * wizard's "Ciudad" dropdown offers. */
    activeServicePoints: function () {
      return read('servicePoints').filter(function (p) { return p.active; })
        .sort(function (a, b) { return (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name), 'es'); });
    },

    /* First ACTIVE seller who covers this point, by id — never by name, so a
     * rename cannot break the assignment. */
    sellerForPoint: function (pointId) {
      if (pointId === undefined || pointId === null || pointId === '') return null;
      var active = read('sellers').filter(function (s) { return s.active; });
      return active.filter(function (s) {
        return (s.servicePointIds || []).some(function (id) { return String(id) === String(pointId); });
      })[0] || null;
    },

    /* A quote points at its point by id and keeps the visible label only as
     * `city`, so renaming a point (or moving its store) in the backoffice
     * does not detach old requests. Rows saved before the point existed still
     * resolve through that stored label. The "{city} · {name}" shape keeps
     * two stores in the same city (like Bogotá's three points) tellable
     * apart in search, the quote table and the CSV export. */
    pointName: function (quote) {
      if (!quote) return '';
      if (quote.servicePointId) {
        var p = Store.get('servicePoints', quote.servicePointId);
        if (p) return (p.city ? p.city + ' · ' : '') + p.name;
      }
      return quote.city || '';
    },

    /* The label is denormalised onto every quote, so a rename has to walk them
     * and refresh it — otherwise search and the CSV export would still read
     * the old name. */
    retagQuotePoints: function (pointId, name) {
      var rows = read('quotes'), touched = 0;
      rows.forEach(function (q) {
        if (String(q.servicePointId) !== String(pointId) || q.city === name) return;
        q.city = name; touched++;
      });
      if (touched) write('quotes', rows);
      return touched;
    },

    /* Deleting a point strips it from every seller's coverage too, or a
     * vendor would keep "covering" a point that no longer exists. Quotes
     * already submitted for it keep their city label untouched. Returns how
     * many sellers lost it, for the confirmation toast. */
    removeServicePoint: function (id) {
      write('servicePoints', read('servicePoints').filter(function (p) { return String(p.id) !== String(id); }));
      var sellers = read('sellers'), touched = 0;
      sellers.forEach(function (s) {
        var ids = s.servicePointIds || [];
        var next = ids.filter(function (x) { return String(x) !== String(id); });
        if (next.length !== ids.length) { s.servicePointIds = next; touched++; }
      });
      if (touched) write('sellers', sellers);
      return touched;
    },

    /* Only active types are offered, in the order the backoffice set. */
    activeFurniture: function () {
      return read('furniture').filter(function (f) { return f.active; })
        .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    },

    furnitureByName: function (name) {
      var all = read('furniture');
      for (var i = 0; i < all.length; i++) if (all[i].name === name) return all[i];
      return all[0] || null;
    },

    /* Rank the active catalogue against what the customer answered.
     *
     * Nothing is hidden: a catalogue of six would collapse to one, and an
     * adviser still wants the near misses on the table. Options no fabric
     * declares — "Quiero recomendaciones", "No estoy seguro" — simply score
     * nothing rather than penalising everything, so they behave as "no
     * preference" without being special-cased by name.
     */
    recommend: function (c) {
      c = c || {};
      var needs = c.needs || [];
      var list = read('fabrics').filter(function (f) { return f.active; });
      var norm = function (t) { return String(t || '').toLowerCase().trim(); };
      var has = function (arr, v) {
        return (arr || []).some(function (x) { return norm(x) === norm(v); });
      };

      var ranked = list.map(function (f) {
        var reasons = [], score = 0;

        needs.forEach(function (nd) {
          if (has(f.needs, nd)) { score += 3; reasons.push(nd); }
        });
        if (c.style && has(f.styles, c.style)) { score += 2; reasons.push('Estilo ' + c.style); }
        if (c.color && norm(f.colorFamily) === norm(c.color)) { score += 2; reasons.push('Gama ' + c.color); }

        var over = !!(c.budget && f.price > c.budget);
        if (c.budget && !over) { score += 2; reasons.push('Dentro de tu presupuesto'); }

        return { fabric: f, score: score, reasons: reasons, overBudget: over };
      });

      ranked.sort(function (a, b) {
        if (a.overBudget !== b.overBudget) return a.overBudget ? 1 : -1;  // affordable first
        if (b.score !== a.score) return b.score - a.score;
        return a.fabric.price - b.fabric.price;                           // then cheapest
      });
      return ranked;
    },

    nextQuoteId: function () {
      var max = 1042;
      read('quotes').forEach(function (q) {
        var n = parseInt(String(q.id).replace(/\D/g, ''), 10);
        if (!isNaN(n) && n > max) max = n;
      });
      return 'COT-' + (max + 1);
    }
  };

  function norm(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  /* ------------------------------------------------------- despiece -- */

  /* Rectangular pieces per furniture type, in metres, from what the wizard
   * already asks. This is an APPROXIMATION of a cutting plan, not one: arm
   * geometry, seams and the upholsterer's own criteria are folded into the
   * allowances below, which is why the result is published as a range.
   *
   * Keyed by furniture id — never by name, which the backoffice can rename.
   * A type with no template here falls back to the baseline range, so they
   * migrate one at a time. */
  var SEAM = 0.03;

  var FURNITURE_TEMPLATES = {
    sofa: {
      needs: ['width', 'height', 'depth', 'seats'],
      // Campos opcionales del wizard que esta plantilla sí consume. El
      // cotizador oculta los que no aparezcan aquí: preguntar algo que no
      // entra en la cuenta no se arregla con una nota, se arregla no
      // preguntándolo.
      optional: ['cushions'],
      pieces: function (i) {
        var W = i.width / 100, H = i.height / 100, D = i.depth / 100;
        var N = Math.max(1, i.seats || 1);
        var Cb = Math.max(1, i.cushions || N);
        var dAsiento = Math.max(0.35, D - 0.18);   // el respaldo se come el fondo
        var hRespaldo = Math.max(0.30, H - 0.42);  // altura de asiento típica
        var dBrazo = Math.max(0.30, D - 0.10);
        var hBrazo = Math.max(0.25, H - 0.35);
        var wAsiento = W / N, wRespaldo = W / Cb;

        var cojines = [
          { name: 'Asiento superior', qty: N,  w: wAsiento, h: dAsiento },
          { name: 'Asiento inferior', qty: N,  w: wAsiento, h: dAsiento },
          // La cenefa es la tira que rodea el cojín: se corta en línea.
          { name: 'Cenefa de asiento', qty: N, w: 2 * (wAsiento + dAsiento), h: 0.12 }
        ];
        var respaldos = [
          { name: 'Respaldo frontal',   qty: Cb, w: wRespaldo, h: hRespaldo },
          { name: 'Respaldo posterior', qty: Cb, w: wRespaldo, h: hRespaldo }
        ];
        var estructura = [
          { name: 'Brazo interior',  qty: 2, w: dBrazo, h: hBrazo },
          { name: 'Brazo exterior',  qty: 2, w: dBrazo, h: hBrazo },
          { name: 'Respaldo exterior', qty: 1, w: W, h: Math.max(0.30, H - 0.10) },
          { name: 'Frente inferior', qty: 1, w: W, h: 0.22 }
        ];

        if (i.coverage === 'partial') return cojines;
        if (i.coverage === 'seats') return cojines.concat(respaldos);
        return cojines.concat(respaldos, estructura);
      }
    }
  };

  /* How many linear metres of a roll `rollM` wide a run of identical pieces
   * eats. This is the whole point: two 65 cm pieces sit side by side on a
   * 140 cm roll and cost 0.70 m; two 80 cm pieces cannot, and cost 1.40 m. */
  function packRun(qty, w, h, rollM) {
    var best = Infinity;
    [[w, h], [h, w]].forEach(function (o) {
      var across = o[0], along = o[1], panels = 1;
      // Wider than the roll: the upholsterer seams it out of panels.
      if (across > rollM) { panels = Math.ceil(across / rollM - 1e-9); across = across / panels; }
      var perRow = Math.max(1, Math.floor(rollM / across + 1e-9));
      var metres = Math.ceil(qty * panels / perRow - 1e-9) * along;
      if (metres < best) best = metres;
    });
    return best;
  }

  /* 9.68 / 0.1 is 96.80000000000001 in binary floating point, and Math.ceil
   * would turn that into 9.7 + one whole increment. The epsilon is not decoration. */
  function ceilTo(value, step) {
    if (!(step > 0)) return round2(value);
    return round2(Math.ceil(round2(value / step) - 1e-9) * step);
  }
  function round2(n) { return Math.round((+n || 0) * 100) / 100; }

  /* 0.5 reads better than 0.50, and 10 better than 10.00. */
  function fmtM(n) { return String(round2(n)).replace('.', ','); }

  /* Mix a hex colour toward white, for the lighter half of a swatch gradient. */
  function tint(hex, amount) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var out = '#';
    for (var i = 0; i < 3; i++) {
      var v = parseInt(h.substr(i * 2, 2), 16);
      v = Math.round(v + (255 - v) * amount);
      out += ('0' + v.toString(16)).slice(-2);
    }
    return out;
  }

  /* ---------------------------------------------------------------- photos -- */

  var Photos = {
    _db: null,

    _open: function () {
      if (Photos._db) return Photos._db;
      Photos._db = new Promise(function (resolve, reject) {
        var req = indexedDB.open('med-photos', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('photos'); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
      return Photos._db;
    },

    _tx: function (mode, run) {
      return Photos._open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction('photos', mode);
          var out = run(tx.objectStore('photos'));
          tx.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
          tx.onerror = function () { reject(tx.error); };
        });
      });
    },

    put: function (id, dataUrl) {
      return Photos._tx('readwrite', function (s) { s.put(dataUrl, id); }).then(function () { return id; });
    },

    get: function (id) {
      if (!id) return Promise.resolve(null);
      return Photos._tx('readonly', function (s) { return s.get(id); }).catch(function () { return null; });
    },

    remove: function (id) {
      return Photos._tx('readwrite', function (s) { s.delete(id); });
    },

    /* Resolves in the order given, dropping any that no longer exist. */
    getAll: function (ids) {
      return Promise.all((ids || []).map(function (id) { return Photos.get(id); }))
        .then(function (list) { return list.filter(Boolean); });
    }
  };

  /* ------------------------------------------------------------------ auth --
   *
   * THIS IS A DEMO GATE, NOT SECURITY. Every check below runs in the visitor's
   * own browser against data they can edit in devtools, so anyone who wants in
   * is already in. It exists to demonstrate roles — an adviser seeing only
   * their own requests — not to protect anything.
   *
   * A real deployment moves all of this behind a server: the server verifies
   * the password against a slow hash (bcrypt/argon2, never a bare SHA-256),
   * issues the session itself, and sends it as an httpOnly + Secure + SameSite
   * cookie. Do not sign tokens in the browser: the signing key would ship in
   * this file, and anyone could mint themselves an admin.
   */
  var SESSION_KEY = NS + 'session';
  var DEMO_PASSWORD = {{DEMO_PASSWORD_JSON}};

  function sha256Hex(text) {
    var bytes = new TextEncoder().encode(text);
    return crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    });
  }

  var Auth = {
    DEMO_PASSWORD: DEMO_PASSWORD,

    /* Salted per user so two accounts sharing a password do not share a hash. */
    hash: function (userId, password) { return sha256Hex(NS + userId + ':' + password); },

    login: function (email, password) {
      var user = read('users').filter(function (u) {
        return norm(u.email) === norm(email);
      })[0];
      // Same message either way: revealing which half was wrong helps nobody.
      var reject = function () { return { ok: false, error: 'Correo o contraseña incorrectos' }; };
      if (!user) return Promise.resolve(reject());
      if (!user.active) return Promise.resolve({ ok: false, error: 'Esta cuenta está desactivada' });
      return Auth.hash(user.id, password).then(function (h) {
        if (h !== user.hash) return reject();
        try { sessionStorage.setItem(SESSION_KEY, user.id); } catch (err) { /* private mode */ }
        return { ok: true, user: user };
      });
    },

    logout: function () { try { sessionStorage.removeItem(SESSION_KEY); } catch (err) { /* ignore */ } },

    current: function () {
      var id;
      try { id = sessionStorage.getItem(SESSION_KEY); } catch (err) { return null; }
      if (!id) return null;
      var u = Store.get('users', id);
      return u && u.active ? u : null;
    },

    setPassword: function (userId, password) {
      return Auth.hash(userId, password).then(function (h) {
        var u = Store.get('users', userId);
        if (!u) return null;
        u.hash = h; Store.put('users', u); return u;
      });
    },

    /* A seller and their account are two records, and the backoffice only
       ever touches the seller. Without this the pause toggle would be a label:
       a paused adviser would keep signing in. */
    setSellerActive: function (sellerId, active) {
      var u = read('users').filter(function (x) {
        return String(x.sellerId) === String(sellerId);
      })[0];
      if (!u) return null;
      u.active = !!active;
      Store.put('users', u);
      return u;
    },

    /* Editing a seller edits half of a pair. Their account carries the same name
     * and the same e-mail — the e-mail IS the login — so it has to move with
     * them, or they would keep signing in under the address that was corrected. */
    syncSellerAccount: function (seller) {
      var u = read('users').filter(function (x) {
        return String(x.sellerId) === String(seller.id);
      })[0];
      if (!u) return null;
      u.name = seller.name; u.email = seller.email;
      Store.put('users', u);
      return u;
    },

    /* Login looks an account up by e-mail, so two of them sharing an address is
     * not a cosmetic clash: the second one could never sign in. */
    emailInUse: function (email, exceptSellerId) {
      var e = norm(email);
      var clash = function (row) {
        return norm(row.email) === e && String(row.sellerId !== undefined ? row.sellerId : row.id) !== String(exceptSellerId);
      };
      return read('sellers').some(function (r) { return norm(r.email) === e && String(r.id) !== String(exceptSellerId); })
          || read('users').some(clash);
    },

    /* A new seller needs a way in, so their account is created alongside. */
    ensureUserForSeller: function (seller) {
      var existing = read('users').filter(function (u) {
        return String(u.sellerId) === String(seller.id) || norm(u.email) === norm(seller.email);
      })[0];
      if (existing) return Promise.resolve(existing);
      var id = 'u-' + seller.id;
      return Auth.hash(id, DEMO_PASSWORD).then(function (h) {
        return Store.put('users', {
          id: id, name: seller.name, email: seller.email,
          role: 'seller', sellerId: seller.id, active: seller.active !== false, hash: h
        });
      });
    },

    /* Advisers get their own pipeline; everything else is administration. */
    sections: function (user) {
      if (!user) return [];
      return user.role === 'admin'
        ? ['dashboard', 'quotes', 'fabrics', 'furniture', 'sellers', 'points', 'settings', 'upgrade']
        : ['dashboard', 'quotes'];
    },

    can: function (user, section) { return Auth.sections(user).indexOf(section) >= 0; }
  };

  global.Auth = Auth;
  global.Store = Store;
  global.Photos = Photos;
})(window);
