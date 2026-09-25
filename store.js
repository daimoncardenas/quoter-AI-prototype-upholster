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
    // Which of a plan's two monthly amounts Upgrade shows/quotes: 'anual' (a
    // yearly contract, cheaper) or 'mensual' (month-to-month). Shared with
    // Usage's summary strip so both pages always agree on the same period.
    billing: 'anual',
    // How many of each add-on package (Upgrade -> Paquetes) the client has
    // bought, keyed by package id — {} for nobody having bought anything yet.
    // A purchase only ever increments this, it never resets or toggles.
    packages: {},
    // Las líneas de servicio que el negocio apagó (backoffice -> "Líneas de servicio", con
    // checkboxes). Se guardan SOLO las apagadas: ausente = "todo lo que el plan habilita está
    // prendido", así un cambio de plan nunca pierde la elección (mismo espíritu que las
    // anulaciones del asistente y de la marca). Nunca queda en cero: apagar la última se rechaza.
    disabledLines: [],
    // Capacidades activadas (ids del catálogo `capabilities`): el hermano de disabledLines para lo
    // que no es una línea de servicio — dominio, analítica, asignación, marca blanca, CSV, etc.
    capabilities: [],
    // Per-month consumption the prototype has no record to derive from,
    // keyed by LOCAL calendar month ('YYYY-MM') — today only
    // { aiCredits: n }. See Store.spendAiCredit() for the tracking rule.
    usage: {},
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
      if (raw !== null) {
        var parsed = JSON.parse(raw);
        /* El catálogo de telas guardado por un navegador viejo no trae el dato de
         * orientación, y sin él la regla nueva cotiza de más: hereda del seed lo
         * que el seed declara para esa MISMA referencia (ver migrateFabrics). */
        if (entity === 'fabrics') return migrateFabrics(parsed);
        return parsed;
      }
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

  /* El dato de orientación del corte llegó después que las telas guardadas, y sin
   * él la regla nueva cotiza de más (conservador) — porque sin dato no se gira una
   * pieza. Lo que sí puede heredar una tela es lo que el PACK declara para esa
   * mismas referencia: los ids del seed son los del demo y ahí el valor es
   * explícito (docs/consumo-direccional.md). Cualquier tela que no venga del seed
   * se queda sin el dato — y sin dato, no se rota. Nunca sobrescribe un valor ya
   * declarado: solo rellena lo que falta. */
  function migrateFabrics(list) {
    var seed = SEEDS.fabrics || [];
    var changed = false;
    (list || []).forEach(function (f) {
      var s = null;
      for (var i = 0; i < seed.length; i++) { if (String(seed[i].id) === String(f.id)) s = seed[i]; }
      if (!s) return;
      if (f.cutDirection === undefined && s.cutDirection !== undefined) { f.cutDirection = s.cutDirection; changed = true; }
      if (f.patternMatch === undefined && s.patternMatch !== undefined) { f.patternMatch = s.patternMatch; changed = true; }
    });
    if (changed) { try { write('fabrics', list); } catch (err) { /* read-only storage is survivable */ } }
    return list;
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
    if (entity === 'quotes') baseEmpujar(rows);
    return rows;
  }

  /* ------------------------------------------- la base del servidor (SQLite) --
   * El prototipo guarda en el navegador, y eso deja a cada navegador con lo suyo: una pre-cotización
   * creada en uno no existe en el otro. Cuando el servidor de desarrollo está delante (`/api/quotes`,
   * ver `tools/api.mjs`), las solicitudes se comparten: al guardar se empujan, al cargar se traen. Sin
   * servidor —una demo abierta como archivo— todo sigue igual: la base es un extra, nunca un requisito. */
  var baseViva = null;              // null = sin preguntar · true = hay base · false = no hay
  var basePorEmpujar = null;

  function baseEnviar(rows) {
    try {
      fetch('/api/quotes', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ns: NS, quotes: rows })
      }).catch(function () { /* sin servidor: se queda en el navegador */ });
    } catch (err) { /* fetch no disponible */ }
  }

  function baseEmpujar(rows) {
    if (typeof fetch !== 'function') return;
    if (baseViva === true) return baseEnviar(rows);
    basePorEmpujar = rows;
    if (baseViva === null) {
      baseViva = undefined;                            // preguntando
      syncQuotes().then(function () {
        if (baseViva === true && basePorEmpujar) { baseEnviar(basePorEmpujar); basePorEmpujar = null; }
      });
    }
  }

  /* Trae lo de la base y lo mezcla con lo del navegador (por id: nadie pisa a nadie). Devuelve una
   * promesa: las pantallas la esperan antes de pintar cuando quieren ver lo que llegó de otro navegador. */
  function syncQuotes() {
    if (typeof fetch !== 'function') { baseViva = false; return Promise.resolve(false); }
    return fetch('/api/quotes?ns=' + encodeURIComponent(NS))
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (dato) {
        baseViva = true;
        var delServidor = (dato && dato.quotes) || [];
        /* LA BASE MANDA (dueño, 25/09): lo que ella tiene gana —el navegador es solo la última copia—,
         * y lo que exista únicamente en el navegador se queda y se empuja, para que también entre. */
        var marca = String((dato && dato.resetAt) || '');
        var porId = {}, cambios = 0;
        read('quotes').forEach(function (q) {
          if (!q || !q.id) return;
          /* Lo del navegador que es MÁS VIEJO que el último reinicio de las seeds se descarta: si no,
           * una copia vieja resucitaría lo que el botón acaba de borrar. */
          if (marca && String(q.date || '') < marca.slice(0, 10)) return;
          porId[q.id] = q;
        });
        delServidor.forEach(function (q) {
          if (!q || !q.id) return;
          porId[q.id] = q;                       // gana la base, sin mirar fechas
          cambios++;
        });
        write('quotes', Object.keys(porId).map(function (k) { return porId[k]; }));
        return true;
      })
      .catch(function () { baseViva = false; return false; });
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

  /* ------------------------------------------------------- invoice cycle --
   *
   * SIMULATED payment (Upgrade -> Facturación). The real product charges
   * through Bold's Payment Link API: the BACKEND creates the link from the
   * amount stored server-side and confirms payment through a signed webhook;
   * the frontend only redirects. This prototype has no backend and no
   * network, so a plan change or package purchase creates a 'Pendiente'
   * invoice here instead of applying instantly, and admin.html's payment
   * modal simulates approval/rejection without contacting anything real —
   * see CLAUDE.md. Same lock spirit as quotes above: once an invoice is
   * settled (Pagada/Rechazada) it can never change again. */
  var INVOICE_STATUSES = ['Pendiente', 'Pagada', 'Rechazada'];
  function isInvoiceSettled(inv) {
    return !!inv && inv.status !== 'Pendiente';
  }

  /* ----------------------------------------------------------------- store -- */

  var Store = {
    syncQuotes: function () { return syncQuotes(); },
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

    /* Quitar una cotización la quita TAMBIÉN de la base: si el navegador solo la borrara aquí, volvería
     * en el siguiente traído. */
    /* Publicar UNA cotización con sus fotos. La lista del navegador va liviana (solo los ids de las
     * fotos); las imágenes viajan aquí, una vez, cuando la solicitud se envía: en la base quedan como
     * archivo (`data/photos/…`) y su fila, así que se ven desde cualquier navegador. */
    publicarCotizacion: function (cotizacion) {
      if (typeof fetch !== 'function' || !cotizacion || !cotizacion.id) return Promise.resolve(false);
      return fetch('/api/quotes', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ns: NS, quotes: [cotizacion] })
      }).then(function (r) { baseViva = r.ok ? true : baseViva; return r.ok; }).catch(function () { return false; });
    },
    /* El botón «Restablecer datos de demo»: se corre la base y quedan solo las seeds. */
    reiniciarLaBase: function () {
      if (typeof fetch !== 'function') return Promise.resolve(false);
      return fetch('/api/reset?ns=' + encodeURIComponent(NS), { method: 'POST' })
        .then(function (r) { return r.ok; }).catch(function () { return false; });
    },
    removeDeLaBase: function (id) {
      if (typeof fetch !== 'function' || baseViva !== true) return;
      try { fetch('/api/quotes/' + encodeURIComponent(id) + '?ns=' + encodeURIComponent(NS), { method: 'DELETE' }).catch(function () { }); } catch (err) { }
    },
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

    /* ------------------------------------------------------------- usage --
     *
     * What the backoffice "Usage" page measures against the plan's limits.
     * Months are LOCAL calendar months: q.date is a local 'YYYY-MM-DD' day
     * (index.html writes it with getFullYear/getMonth/getDate), so it is
     * compared by its 'YYYY-MM' prefix against a locally built key — never
     * parsed with new Date('YYYY-MM-DD'), which is UTC midnight and would
     * push the first/last evening of a month into the wrong one. */
    monthKey: function (date) { return monthKey(date); },
    /* El prefijo de las claves de ESTE cliente (`cdy.v1.`): lo que la página guarde por su cuenta vive
     * al lado del almacén, con el mismo espacio de nombres (la memoria presente de la conversación). */
    ns: function () { return NS; },

    quotesThisMonth: function () {
      var key = monthKey();
      return read('quotes').filter(function (q) { return String((q && q.date) || '').slice(0, 7) === key; }).length;
    },

    /* AI-credit tracking rule: every completed "Revisar mi información"
     * analysis in the wizard spends exactly one credit, stored per month in
     * settings.usage['YYYY-MM'].aiCredits. A month with no entry yet starts
     * from the number of quotes already submitted this month — each one went
     * through one analysis to get there — so the demo never reads 0 while
     * there are quotes on the board. Reading applies the same starting
     * point without writing it. */
    aiCreditsUsed: function () {
      var month = (Store.settings().usage || {})[monthKey()];
      return month && isFinite(+month.aiCredits) && month.aiCredits !== null ? +month.aiCredits : Store.quotesThisMonth();
    },

    spendAiCredit: function () {
      var usage = clone(Store.settings().usage || {});
      var key = monthKey();
      var next = Store.aiCreditsUsed() + 1;
      usage[key] = Object.assign({}, usage[key], { aiCredits: next });
      Store.saveSettings({ usage: usage });
      return next;
    },

    /* ------------------------------------------------------------- brand --
     *
     * The client's look (company name, logos, colors, fonts, header variant)
     * as the backoffice's "Configuración de estilos" edits it. In production
     * this lives in a tenant row plus cloud storage; in this prototype it is
     * one localStorage key, <NS>brand, holding ONLY the fields that differ
     * from the pack defaults (BRAND_DEFAULTS, rendered from clients/<slug>/
     * by tools/generate.mjs). With nothing saved, Store.brand() equals the
     * defaults and Brand.apply() leaves the page exactly as generated. */
    brandDefaults: function () { return clone(BRAND_DEFAULTS); },

    brandOverrides: function () {
      try {
        var o = JSON.parse(localStorage.getItem(NS + BRAND_KEY) || '{}');
        return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
      } catch (err) { return {}; }
    },

    /* Approved Google Fonts, plus the pack's own fonts if they are not in it. */
    brandFonts: function () { return brandFontList(); },

    /* Essential edits name, logos and the two brand colors; fonts and the
     * header variant start at Professional. */
    brandFeatureAllowed: function (feature, plan) { return planAllows(plan === undefined ? Store.settings().plan : plan, feature); },
    BRAND_GATED_PLAN: 'Professional',

    /* The effective brand: defaults, then every VALID override the plan
     * allows. Saved overrides the plan does not allow are reported in
     * `ignored` (never deleted), so a downgrade falls back to the defaults
     * and an upgrade brings them back. `overridden` says which groups differ
     * from the defaults. opts.overrides/opts.plan evaluate a draft (the
     * backoffice's live preview) without saving it. */
    brand: function (opts) {
      opts = opts || {};
      var d = BRAND_DEFAULTS;
      var ov = opts.overrides || Store.brandOverrides();
      var plan = opts.plan !== undefined ? opts.plan : Store.settings().plan;
      var out = clone(d);
      var o = { companyName: false, colors: false, logos: false, fonts: false, headerVariant: false };
      var ignored = [];

      var name = typeof ov.companyName === 'string' ? ov.companyName.trim() : '';
      if (name && name !== d.companyName) { out.companyName = name; o.companyName = true; }

      var ovc = ov.colors || {};
      var ink = isHex6(ovc.ink) ? ovc.ink.toLowerCase() : normHex(d.colors.ink);
      var accent = isHex6(ovc.accent) ? ovc.accent.toLowerCase() : normHex(d.colors.accent);
      // Defaults are never derived: the pack's hand-picked literals stay as they are.
      if (ink !== normHex(d.colors.ink) || accent !== normHex(d.colors.accent)) {
        out.colors = derivePalette(d.colors, ink, accent);
        o.colors = true;
      }

      var ovl = ov.logos || {};
      ['onDark', 'onLight'].forEach(function (slot) {
        if (isPngDataUrl(ovl[slot])) { out.logos[slot] = ovl[slot]; o.logos = true; }
      });

      var ovf = ov.fonts || {};
      var heading = fontInfo(ovf.heading) ? ovf.heading : d.fonts.headingName;
      var body = fontInfo(ovf.body) ? ovf.body : firstFamily(d.fonts.body);
      if (heading !== d.fonts.headingName || body !== firstFamily(d.fonts.body)) {
        if (planAllows(plan, 'fonts')) { out.fonts = fontsFor(heading, body); o.fonts = true; }
        else ignored.push('fonts');
      }

      if (BRAND_HEADER_VARIANTS.indexOf(ov.headerVariant) >= 0 && ov.headerVariant !== d.headerVariant) {
        if (planAllows(plan, 'headerVariant')) { out.headerVariant = ov.headerVariant; o.headerVariant = true; }
        else ignored.push('headerVariant');
      }

      out.overridden = o;
      out.ignored = ignored;
      return out;
    },

    /* Merges a patch into the stored overrides. A field equal to its default
     * (or null) is REMOVED rather than stored, so the key only ever holds
     * real overrides; fields absent from the patch are left untouched (that
     * is how plan-gated fields survive a save made on a lower plan). Only
     * controlled tokens are accepted: #rrggbb colors, PNG data URLs, fonts
     * from the approved list and the known header variants. */
    saveBrand: function (patch) {
      patch = patch || {};
      var d = BRAND_DEFAULTS;
      var next = Store.brandOverrides();
      if ('companyName' in patch) {
        var n = String(patch.companyName == null ? '' : patch.companyName).trim();
        if (n.length > BRAND_NAME_MAX) throw new Error('El nombre de la empresa no puede superar ' + BRAND_NAME_MAX + ' caracteres.');
        if (!n || n === d.companyName) delete next.companyName; else next.companyName = n;
      }
      if (patch.colors) {
        next.colors = next.colors || {};
        ['ink', 'accent'].forEach(function (k) {
          if (!(k in patch.colors)) return;
          var v = patch.colors[k];
          if (v == null || (isHex6(v) && v.toLowerCase() === normHex(d.colors[k]))) { delete next.colors[k]; return; }
          if (!isHex6(v)) throw new Error('Los colores deben tener el formato #rrggbb.');
          next.colors[k] = v.toLowerCase();
        });
      }
      if (patch.logos) {
        next.logos = next.logos || {};
        ['onDark', 'onLight'].forEach(function (slot) {
          if (!(slot in patch.logos)) return;
          var v = patch.logos[slot];
          if (v == null) { delete next.logos[slot]; return; }
          if (!isPngDataUrl(v)) throw new Error('Los logos deben guardarse como imagen PNG.');
          next.logos[slot] = v;
        });
      }
      if (patch.fonts) {
        next.fonts = next.fonts || {};
        [['heading', d.fonts.headingName], ['body', firstFamily(d.fonts.body)]].forEach(function (pair) {
          var k = pair[0];
          if (!(k in patch.fonts)) return;
          var v = patch.fonts[k];
          if (v == null || v === pair[1]) { delete next.fonts[k]; return; }
          if (!fontInfo(v)) throw new Error('Esa fuente no está en la lista aprobada.');
          next.fonts[k] = v;
        });
      }
      if ('headerVariant' in patch) {
        var hv = patch.headerVariant;
        if (hv == null || hv === d.headerVariant) delete next.headerVariant;
        else if (BRAND_HEADER_VARIANTS.indexOf(hv) < 0) throw new Error('Estilo de encabezado desconocido.');
        else next.headerVariant = hv;
      }
      ['colors', 'logos', 'fonts'].forEach(function (k) {
        if (next[k] && !Object.keys(next[k]).length) delete next[k];
      });
      if (!Object.keys(next).length) { Store.resetBrand(); return {}; }
      write(BRAND_KEY, next);
      return next;
    },

    resetBrand: function () {
      try { localStorage.removeItem(NS + BRAND_KEY); } catch (err) { /* ignore */ }
    },

    /* --------------------------------------------------------- assistant --
     *
     * The assistant's PRESENCE in the cotizador (the 3D character, its
     * welcome, the chat entry points), as the backoffice's "Presencia del
     * asistente" edits it. Same shape as the brand layer: the pack's
     * client.json `assistant` block is the default (ASSISTANT_DEFAULTS), and
     * one localStorage key, <NS>assistant, holds ONLY the fields that differ.
     * Turning it off removes the presence only: the AI analysis of steps 4-5
     * does not read any of this. */
    assistantDefaults: function () { return clone(ASSISTANT_DEFAULTS); },

    /* Las líneas de servicio las define EL PLAN, no el paquete. El catálogo es del producto
     * (shared/service-lines.json) y cada línea declara el plan que la habilita; el cliente solo
     * elige su línea BASE, la que un plan Essential incluye. Mismo contrato que el asistente:
     * `enabled` según el plan y `requiredPlan` para el candado (abajo del plan la línea se
     * bloquea sin borrar nada). `Store.servicesEnabled()` es lo que el cotizador usa para decidir
     * si pregunta "¿qué quieres hacer?": con una sola línea no hay pregunta. */
    services: function (opts) {
      opts = opts || {};
      var settings = Store.settings();
      var plan = opts.plan === undefined ? settings.plan : opts.plan;
      var off = settings.disabledLines || [];
      var out = [];
      for (var i = 0; i < SERVICE_LINES.length; i++) {
        var s = SERVICE_LINES[i];
        /* Modelo v2 (docs/paquetes-y-precios.md): el PLAN dejó de ser la puerta — el cliente arma
         * su ACI marcando servicios, y los paquetes recomendados son un atajo. `requiredPlan` se
         * conserva como dato (qué paquete lo traía) pero no bloquea nada; el único candado que
         * queda es el del negocio, que apaga líneas desde el backoffice. */
        var required = s.minPlan === 'base' ? 'Essential' : s.minPlan;
        var withinPlan = true;
        /* Lo que el taller escribió en el backoffice pisa lo que trae el catálogo
         * (settings.lineOverrides): la tabla de mano de obra y la lista de insumos. El catálogo
         * queda como el default del producto y nada del cliente se pierde al regenerar. */
        var ov = (settings.lineOverrides || {})[s.id] || null;
        out.push({
          id: s.id, label: s.label, hint: s.hint || '', journey: s.journey,
          requiredPlan: required,
          /* El contrato de la línea: `pendiente` es que su JSON todavía no se escribe, así que su
           * rama no entra al índice que el asistente usa para elegir el caso (el dueño: solo las
           * líneas con contrato se ofrecen). */
          contrato: s.contrato,
          /* Lo que la línea suma a la estimación y lo que pregunta de más (ver lineEstimate y
           * docs/journeys.md): la línea no es solo una etiqueta en la cotización. */
          laborPct: Math.max(0, +s.laborPct || 0),
          /* La mano de obra según cómo la cobre la línea (docs/retapizado-trabajo.md): `pct` es lo de
           * siempre —un % del material— y `tabla` la cobra por mueble + por metro de tela. El
           * backoffice la edita y su edición (`lineOverrides`) gana sobre el catálogo; sin tabla
           * declarada la línea se queda con su porcentaje de siempre. */
          labor: (function () {
            var lab = (ov && ov.labor) || s.labor || {};
            var pct = (ov && ov.labor && ov.labor.pct !== undefined) ? ov.labor.pct : s.laborPct;
            return { mode: lab.mode === 'tabla' ? 'tabla' : 'pct',
                     pct: Math.max(0, +pct || 0),
                     perMeter: Math.max(0, +lab.perMeter || 0),
                     porMueble: Object.assign({}, lab.porMueble || {}) };
          })(),
          /* Los insumos del trabajo (espuma, cinchas, grapas…): el catálogo los declara, el
           * backoffice los edita y la estimación los suma con el precio vigente. El estándar de la
           * mano (docs/insumos-asistidos.md) se toma del CATÁLOGO por id, siempre: el override del
           * backoffice cambia precios —y uno guardado antes de que el estándar existiera no lo
           * trae—, no la regla de cuánto gasta un mueble. */
          insumos: (function () {
            var standardPorId = {};
            (s.insumos || []).forEach(function (x) { if (x.standard) standardPorId[x.id] = x.standard; });
            return (((ov && ov.insumos) || s.insumos) || []).map(function (x) {
              return { id: x.id, label: x.label || x.id, unit: x.unit || '',
                       cop: Math.max(0, +x.cop || 0), hint: x.hint || '',
                       demo: !!x.demo, nota: x.nota || '',
                       standard: standardPorId[x.id] || x.standard || null };
            });
          })(),
          asks: (s.asks || []).slice(),
          /* Cómo se cotiza esta línea y qué pasos del cotizador se salta: los dos son datos del
           * catálogo (shared/service-lines.json), no casos especiales del código. */
          pricing: s.pricing || 'tela',
          skips: (s.skips || []).slice(),
          /* Las rutas de esta línea (docs/flujo-de-suministro.md): la primera viene elegida y cada
           * una declara qué pasos NO existen para quien la toma. Una línea sin `rutas` no pregunta
           * nada al entrar — su recorrido es el de siempre. */
          rutas: (s.rutas || []).slice(),
          /* El paso del mueble sin escogedor —el oficio que declara su mueble en otra parte, como
           * el proyecto comercial con su mesa de piezas—: dato del catálogo, no caso especial.
           * false oculta el escogedor y deja el paso con su subida de fotos. */
          furniturePicker: s.furniturePicker !== false,
          /* La copia con la que ese motivo se le cuenta al cliente: el default de su oficio más lo
           * que la línea sobrescriba (la etiqueta del artefacto, casi siempre). */
          copy: Object.assign({}, COPY_BY_ENGINE[s.pricing || 'tela'] || {}, s.copy || {}),
          /* `withinPlan` es siempre verdadero desde el modelo v2 (el plan dejó de ser la puerta:
           * ver el comentario de arriba) — queda como campo para que el backoffice pueda decir de
           * qué paquete venía una línea sin reimplementar el rango de planes. `enabled` es la
           * única puerta viva: el negocio la apaga y la línea sale del cotizador. */
          withinPlan: withinPlan,
          enabled: withinPlan && off.indexOf(s.id) < 0
        });
      }
      return out;
    },

    /* Prender o apagar una línea de servicio (backoffice -> "Líneas de servicio"). Apagarla la
     * saca del cotizador sin borrar nada; prenderla la repone. Nunca se permite dejar el
     * cotizador sin líneas: una solicitud sin línea no se puede cotizar. */
    setLineEnabled: function (id, on) {
      var line = Store.serviceById(id);
      if (!line) throw new Error('Esa línea de servicio no existe en este cotizador.');
      var off = Store.settings().disabledLines.slice();
      if (on) off = off.filter(function (x) { return x !== id; });
      else if (off.indexOf(id) < 0) {
        if (Store.servicesEnabled().length <= 1) throw new Error('Debe quedar al menos una línea habilitada.');
        off.push(id);
      }
      Store.saveSettings({ disabledLines: off });
      return Store.serviceById(id);
    },

    /* Los ítems de la pregunta por los daños, tal como los declara el catálogo. */
    damageItems: function () {
      return DAMAGE_ITEMS.map(function (d) {
        return { id: d.id, label: d.label, hint: d.hint || '', cop: Math.max(0, +d.cop || 0) };
      });
    },

    /* El tramo que la línea elegida aporta a la estimación, sobre el rango de material:
     *   suministro            → solo material (laborPct 0): la tela es el producto
     *   retapizado / cambio   → material + mano de obra (% del material, o POR MUEBLE + POR METRO
     *                           cuando la línea trae labor.mode 'tabla' — docs/retapizado-trabajo.md)
     *   reparación            → material + mano de obra + los daños marcados
     *   + insumos             → lo que el paso de insumos marcó, con su precio del catálogo
     * Así el número cambia de verdad al cambiar de línea, que es lo que el cotizador promete. */
    lineEstimate: function (service, range, damageIds, extra) {
      var svc = service || {};
      extra = extra || {};
      var laborPct = Math.max(0, +svc.laborPct || 0) / 100;
      var lo = Math.max(0, +((range || [])[0]) || 0);
      var hi = Math.max(lo, +((range || [])[1]) || 0);
      var picked = [];
      Store.damageItems().forEach(function (d) {
        if ((damageIds || []).indexOf(d.id) >= 0) picked.push(d);
      });
      var damages = picked.reduce(function (a, d) { return a + d.cop; }, 0);
      /* La obra por tabla no depende del precio de la tela: por mueble + por metro. Con el rango de
       * metros sale un rango igual que el material (los dos extremos del consumo). */
      var tabla = !!(svc.labor && svc.labor.mode === 'tabla');
      var labor, laborNote = '';
      if (tabla) {
        var porMueble = (svc.labor && svc.labor.porMueble) || {};
        var mueble = extra.furnitureId;
        var baseObra = Math.max(0, +((mueble != null && porMueble[mueble] !== undefined)
          ? porMueble[mueble] : porMueble.otro) || 0);
        var porMetro = Math.max(0, +((svc.labor && svc.labor.perMeter) || 0));
        var mts = extra.meters || [];
        var mMin = Math.max(0, +mts[0] || 0), mMax = Math.max(mMin, +mts[1] || 0);
        labor = [ceilTo(baseObra + porMetro * mMin, 0.1), ceilTo(baseObra + porMetro * mMax, 0.1)];
        var metros = String(Math.round(mMax * 10) / 10).replace('.', ',');
        laborNote = (extra.furnitureName ? extra.furnitureName + ' · ' : '') + metros + ' m';
      } else {
        /* El modo de siempre: el porcentaje de la línea —o el que el taller dejó en el backoffice—. */
        laborPct = Math.max(0, +((svc.labor && svc.labor.pct !== undefined)
          ? svc.labor.pct : svc.laborPct * 100) || 0) / 100;
        labor = [ceilTo(lo * laborPct, 0.1), ceilTo(hi * laborPct, 0.1)];
      }
      /* Los insumos marcados: cantidad × precio del catálogo. Vacío = no se cambia nada. */
      var insumos = [];
      var insumosSum = 0;
      (extra.insumos || []).forEach(function (x) {
        var qty = Math.max(0, +((x || {}).qty) || 0);
        if (!qty) return;
        insumos.push({ id: x.id, label: x.label || x.id, unit: x.unit || '', qty: qty, cop: Math.max(0, +x.cop || 0) });
        insumosSum += qty * Math.max(0, +x.cop || 0);
      });
      return {
        material: [lo, hi],
        laborPct: tabla ? 0 : Math.round(laborPct * 100),
        laborMode: tabla ? 'tabla' : 'pct',
        laborNote: laborNote,
        labor: labor,
        insumos: insumos,
        insumosSum: ceilTo(insumosSum, 0.1),
        damages: damages,
        picked: picked,
        total: [labor[0] + lo + damages + ceilTo(insumosSum, 0.1),
                labor[1] + hi + damages + ceilTo(insumosSum, 0.1)]
      };
    },

    /* Las preguntas que un motivo declara (catálogo → asks) y las tarifas de cada oficio. El
     * cotizador pinta el paso desde aquí: un solo render para todos los motivos. */
    askSpecs: function () { return ASK_SPECS; },
    askSpec: function (id) { return ASK_SPECS[id] || null; },
    pricingRates: function () { return PRICING_RATES; },

    /* Lo que la línea suma a la estimación, según cómo se cotiza su oficio:
     *   tela         metros × precio + mano de obra (%) + daños marcados    (el motor de siempre)
     *   pieza        tarifa por pieza × cantidad + tratamientos + traslado  (mantenimiento)
     *   m2           área × (tela por m² + instalación) + papel + sustrato  (arquitectónica)
     *   fabricacion  estructura(+madera/acabado/firmeza %) + herrajes + tela + fabricación % + entrega
     *   unidad       Σ(precio unitario × cantidad) + instalación + desmontaje + logística (proyecto)
     * Devuelve SIEMPRE { kind, parts:[{label, value:[lo,hi]}], total:[lo,hi] }, así el bloque de
     * precio no sabe de oficios: pinta partes. */
    lineQuote: function (service, ctx) {
      ctx = ctx || {};
      var svc = service || {};
      var kind = svc.pricing || 'tela';
      var R = PRICING_RATES || {};
      var answers = ctx.answers || {};
      var parts = [];
      var money = function (n) { return Math.max(0, Math.round(+n || 0)); };
      var at = function (block, key) { return (R[block] || {})[key]; };
      var base = function (block) {
        var t = at(block, 'base') || {};
        return money(t[ctx.furnitureId] !== undefined ? t[ctx.furnitureId] : t.otro);
      };
      var picked = function (id, opts) {
        var out = null;
        (opts || []).forEach(function (o) { if (o.id === id) out = o; });
        return out;
      };
      /* Suma los extras marcados: un `cop` por pieza y un `pct` sobre la base. */
      var extras = function (opts, ids) {
        var cop = 0, pct = 0, labels = [];
        (opts || []).forEach(function (o) {
          if ((ids || []).indexOf(o.id) >= 0) {
            cop += money(o.cop); pct += (+o.pct || 0);
            labels.push(o.cop ? o.label + ' ' + Store.money(o.cop) : o.label);
          }
        });
        return { cop: cop, pct: pct, label: labels.join(' · ') };
      };
      var juntos = function (r) { return [r[0], r[1]]; };
      var igual = function (v) { return [v, v]; };

      if (kind === 'pieza') {
        var qty = Math.max(1, +ctx.quantity || 1);
        var b = base('pieza');
        parts.push({ label: 'Limpieza por pieza' + (qty > 1 ? ' × ' + qty : ''), value: igual(b * qty) });
        var ex = extras(at('pieza', 'extras'), answers.tratamientos);
        if (ex.cop) parts.push({ label: ex.label, value: igual(ex.cop * qty) });
        if (ex.pct) parts.push({ label: 'Tratamientos (+' + ex.pct + ' %)', value: igual(ceilTo(b * qty * ex.pct / 100, 0.1)) });
        var tr = picked(answers.traslado, at('pieza', 'traslado'));
        if (tr && tr.cop) parts.push({ label: tr.label, value: igual(money(tr.cop)) });
      } else if (kind === 'm2') {
        var m2 = ceilTo((+answers.ancho || 0) * (+answers.alto || 0) / 10000, 0.1);
        var telaM2 = +ctx.fabricPerM2 > 0 ? +ctx.fabricPerM2 : money(at('m2', 'materialPerM2'));
        var papel = picked(answers.papel, at('m2', 'papel'));
        var perM2 = telaM2 + money(at('m2', 'installPerM2')) + (papel ? money(papel.cop) : 0);
        parts.push({
          label: m2.toFixed(1) + ' m² × ' + Store.money(perM2) + '/m²' + (papel ? ' · ' + papel.label : ''),
          value: igual(ceilTo(m2 * perM2, 0.1))
        });
      } else if (kind === 'fabricacion') {
        var F = R.fabricacion || {};
        var b2 = base('fabricacion');
        var madera = picked(answers.madera, F.maderas);
        var acabado = picked(answers.acabado, F.acabados);
        var firmeza = picked(answers.firmeza, F.firmezas);
        var herr = extras(F.herrajes, answers.herrajes);
        var pct = (madera ? +madera.pct || 0 : 0) + (acabado ? +acabado.pct || 0 : 0) + (firmeza ? +firmeza.pct || 0 : 0);
        var estructura = ceilTo(b2 * (1 + pct / 100), 0.1);
        parts.push({
          label: 'Estructura' + (madera ? ' · ' + madera.label : '') + (acabado ? ' · ' + acabado.label : '') + (firmeza ? ' · firmeza ' + firmeza.label.toLowerCase() : ''),
          value: igual(estructura)
        });
        if (herr.cop) parts.push({ label: herr.label, value: igual(herr.cop) });
        var mat = ctx.materialRange || [0, 0];
        parts.push({ label: 'Tela', value: juntos(mat) });
        var pctFab = +F.fabricacionPct || 0;
        parts.push({
          label: 'Fabricación (' + pctFab + ' %)',
          value: [ceilTo((estructura + herr.cop + mat[0]) * pctFab / 100, 0.1), ceilTo((estructura + herr.cop + mat[1]) * pctFab / 100, 0.1)]
        });
        if (money(F.entregaCop)) parts.push({ label: 'Entrega', value: igual(money(F.entregaCop)) });
      } else if (kind === 'unidad') {
        var U = R.unidad || {};
        var units = 0, per = 0;
        (ctx.boq || []).forEach(function (row) {
          var c = Math.max(0, +row.cantidad || 0);
          units += c;
          per += money((U.base || {})[row.furniture]) * c;
        });
        parts.push({ label: 'Piezas (' + units + ')', value: igual(per) });
        var serv = answers.servicios || [];
        if (serv.indexOf('instalacion') >= 0) parts.push({ label: 'Instalación en sitio', value: igual(units * money(U.instalacionPorUnidad)) });
        if (serv.indexOf('desmontaje') >= 0) parts.push({ label: 'Desmontaje de lo existente', value: igual(units * money(U.desmontajePorUnidad)) });
        if (serv.length) parts.push({ label: 'Logística y entrega', value: igual(money(U.logisticaCop)) });
      } else {
        var e = Store.lineEstimate(service, ctx.materialRange || [0, 0], ctx.damages || [],
          { meters: ctx.meters || [], furnitureId: ctx.furnitureId,
            furnitureName: ctx.furnitureName, insumos: ctx.insumos || [] });
        parts.push({ label: 'Material', value: juntos(e.material) });
        /* La obra por tabla trae su nota («Sofá · 21,5 m»): se lee de dónde sale el número
         * (docs/retapizado-trabajo.md). El modo de siempre sigue diciendo su porcentaje. */
        if (e.laborMode === 'tabla')
          parts.push({ label: 'Mano de obra' + (e.laborNote ? ' (' + e.laborNote + ')' : ''), value: juntos(e.labor) });
        else if (e.laborPct > 0)
          parts.push({ label: 'Mano de obra (≈ ' + e.laborPct + ' %)', value: juntos(e.labor) });
        if (e.insumosSum > 0) {
          var detalle = e.insumos.map(function (x) {
            return x.label + ' ' + x.qty + (x.unit ? ' ' + x.unit : '');
          }).join(' · ');
          parts.push({ label: 'Insumos (' + detalle + ')', value: igual(e.insumosSum) });
        }
        if (e.damages > 0) parts.push({ label: 'Reparaciones', value: igual(e.damages) });
      }

      var lo = 0, hi = 0;
      parts.forEach(function (p) { lo += p.value[0]; hi += p.value[1]; });
      return { kind: kind, parts: parts, total: [lo, hi] };
    },

    servicesEnabled: function (opts) {
      return Store.services(opts).filter(function (s) { return s.enabled; });
    },

    serviceById: function (id) {
      var all = Store.services();
      for (var i = 0; i < all.length; i++) { if (all[i].id === id) return all[i]; }
      return null;
    },

    /* La copia resuelta de un motivo (por id o por el objeto que devuelve services()): el único
     * sitio donde se resuelve oficio + override, para que el cotizador no repita la regla. */
    lineCopy: function (lineOrId) {
      var line = typeof lineOrId === 'string' ? Store.serviceById(lineOrId) : lineOrId;
      return (line && line.copy) || null;
    },

    /* ── Composición del paquete (modelo v2, docs/paquetes-y-precios.md) ────────────────────────
     * El cliente no compra un plan: ARMA su ACI. El Core es fijo, los paquetes recomendados son un
     * atajo (marcan sus líneas y desmarcan el resto) y los servicios se ajustan con casillas. El
     * único candado es el de siempre: al menos un servicio, porque una solicitud sin servicio no se
     * puede cotizar. Las cifras vienen marcadas como demo en el catálogo. */
    presets: function () { return clone(PRESETS); },
    /* El paquete del catálogo que carga un plan (`plans` mapea plan → paquete) y, al revés, el
     * plan de un paquete: la cuota y el precio de un plan viven en su paquete. */
    presetForPlan: function (name) {
      var id = (PRESETS.plans || {})[name];
      return (PRESETS.presets || []).filter(function (p) { return p.id === id; })[0] || null;
    },
    planForPreset: function (id) {
      var plans = PRESETS.plans || {};
      return Object.keys(plans).filter(function (k) { return plans[k] === id; })[0] || null;
    },
    /* El nombre que LEE el dueño para un plan es el de su PAQUETE: una sola fuente para las dos
     * páginas. El nombre interno (Essential/Professional/Business) es DATO — settings.plan,
     * PLANS[].name, PLAN_ORDER — y solo se muestra si el catálogo no nombra ese plan. */
    planLabel: function (name) {
      var p = Store.presetForPlan(name);
      return p ? p.label : name;
    },
    /* El precio de un plan ES el del paquete (presets[].price para mes a mes, .priceYearly para
     * el contrato de arrendamiento a 12 meses): la tarjeta de Planes y «Configurar mi plan» leen
     * ESTO MISMO, así que no pueden discrepar. `billing` es 'anual' o 'mensual'. */
    planPrice: function (name, billing) {
      var p = Store.presetForPlan(name);
      if (!p) return 0;
      var v = (billing === 'anual' && p.priceYearly != null) ? p.priceYearly : p.price;
      return Math.max(0, +v || 0);
    },
    /* La activación inicial del paquete (una mensualidad, texto del dueño del 19/09: se paga al
     * contratar mes a mes y va INCLUIDA en la contratación anual). Vive en el paquete, como el precio,
     * para que la tarjeta de Planes y «Configurar mi plan» no puedan discrepar. */
    planActivation: function (name) {
      var p = Store.presetForPlan(name);
      return p ? Math.max(0, +p.activation || 0) : 0;
    },
    /* Las capacidades del catálogo (dominio, analítica, asignación, marca blanca, plantillas, CSV,
     * integraciones, soporte…): cada una con SU valor y su estado, como los servicios. Se activan
     * de a una; los paquetes recomendados vienen con las suyas marcadas. */
    capabilities: function () {
      var on = Store.settings().capabilities || [];
      return (PRESETS.capabilities || []).map(function (c) {
        return { id: c.id, label: c.label, hint: c.hint || '', price: Math.max(0, +c.price || 0), enabled: on.indexOf(c.id) >= 0 };
      });
    },
    setCapability: function (id, on) {
      var existe = (PRESETS.capabilities || []).filter(function (c) { return c.id === id; })[0];
      if (!existe) throw new Error('Esa capacidad no existe en este catálogo.');
      var cur = (Store.settings().capabilities || []).slice();
      if (on) { if (cur.indexOf(id) < 0) cur.push(id); }
      else cur = cur.filter(function (x) { return x !== id; });
      Store.saveSettings({ capabilities: cur });
      return Store.capabilities();
    },
    /* Un paquete recomendado: sus servicios Y sus capacidades, y el plan que carga su cuota. Es un
     * punto de partida, no una jaula: después el cliente marca o desmarca lo que necesite. */
    setBundle: function (id) {
      var p = (PRESETS.presets || []).filter(function (x) { return x.id === id; })[0];
      if (!p) throw new Error('Ese paquete no existe en este catálogo.');
      Store.setLines(p.lines);
      Store.saveSettings({ capabilities: (p.capabilities || []).slice() });
      var plans = PRESETS.plans || {};
      var plan = Store.planForPreset(id);
      if (plan && Store.settings().plan !== plan) Store.saveSettings({ plan: plan });
      return Store.myAci();
    },
    myAci: function () {
      var prices = (PRESETS && PRESETS.servicePrices) || {};
      var core = (PRESETS && PRESETS.core) || { label: 'ACI Core', hint: '', price: 0 };
      var services = Store.services().map(function (s) {
        return { id: s.id, label: s.label, hint: s.hint || '', price: Math.max(0, +prices[s.id] || 0), enabled: s.enabled };
      });
      var capacidades = Store.capabilities();
      /* La suma de las PARTES con sus precios de lista: lo que cuesta una combinación a la medida. */
      var composed = Math.max(0, +core.price || 0);
      for (var i = 0; i < services.length; i++) { if (services[i].enabled) composed += services[i].price; }
      for (var j = 0; j < capacidades.length; j++) { if (capacidades[j].enabled) composed += capacidades[j].price; }
      /* Qué paquete del catálogo coincide EXACTAMENTE con lo marcado (o null si es a la medida): es
       * el nombre que el cliente puede leer — «Essential» es el plan interno que hoy carga la cuota,
       * y en Mi ACI ese nombre no se muestra (el producto ya no se vende por planes). La cuota sigue
       * al PAQUETE cuando lo marcado es uno del catálogo; en una combinación a la medida manda el
       * plan interno. Una sola etiqueta: nadie ve un paquete con la cuota de otro. */
      var on = Store.servicesEnabled().map(function (s) { return s.id; }).sort().join(',');
      var onCap = capacidades.filter(function (c) { return c.enabled; }).map(function (c) { return c.id; }).sort().join(',');
      var presetActual = (PRESETS.presets || []).filter(function (x) {
        return (x.lines || []).slice().sort().join(',') === on && (x.capabilities || []).slice().sort().join(',') === onCap;
      })[0] || null;
      var planPreset = (PRESETS.presets || []).filter(function (x) { return x.id === (PRESETS.plans || {})[Store.settings().plan]; })[0] || null;
      var cuota = presetActual && presetActual.quota ? presetActual.quota : (planPreset && planPreset.quota ? planPreset.quota : null);
      /* Las PARTES suman EXACTO el precio POR MES del paquete (ver pricingNota del catálogo): el
       * total de la pantalla es esa suma —la de lo que esté marcado—, así que cuando lo marcado es
       * un paquete del catálogo coincide con el precio de su tarjeta en Planes. El precio del
       * contrato de 12 meses (`priceYearly`) se muestra aparte, sin cambiar la suma. */
      var presetPlan = presetActual ? Store.planForPreset(presetActual.id) : null;
      var sumParts = function (p) {
        var t = Math.max(0, +core.price || 0);
        (p.lines || []).forEach(function (id) { t += Math.max(0, +prices[id] || 0); });
        (p.capabilities || []).forEach(function (id) {
          var c = (PRESETS.capabilities || []).filter(function (x) { return x.id === id; })[0];
          t += c ? Math.max(0, +c.price || 0) : 0;
        });
        return t;
      };
      return {
        core: { label: core.label, hint: core.hint || '', price: Math.max(0, +core.price || 0), includes: (core.includes || []).slice() },
        services: services,
        capabilities: capacidades,
        presets: (PRESETS.presets || []).map(function (p) {
          var plan = Store.planForPreset(p.id);
          return { id: p.id, label: p.label, hint: p.hint || '', lines: (p.lines || []).slice(),
                   capabilities: (p.capabilities || []).slice(),
                   quota: p.quota ? clone(p.quota) : null,
                   /* El precio del botón es el del paquete por mes (el mismo número que la tarjeta
                    * con «Mes») y `composed` la suma de sus partes: tienen que ser el mismo número. */
                   plan: plan, price: plan ? Store.planPrice(plan, 'mensual') : sumParts(p),
                   priceYearly: plan ? Store.planPrice(plan, 'anual') : 0, composed: sumParts(p) };
        }),
        quotaActual: cuota ? clone(cuota) : null,
        /* El paquete del catálogo que coincide con lo marcado (o null si es a la medida), con su
         * precio del mes y su precio de contrato para poder decirlos en el total. */
        presetActual: presetActual ? { id: presetActual.id, label: presetActual.label, plan: Store.planForPreset(presetActual.id),
                                       price: Store.planPrice(Store.planForPreset(presetActual.id), 'mensual'),
                                       priceYearly: Store.planPrice(Store.planForPreset(presetActual.id), 'anual') } : null,
        plan: presetPlan,
        planLabel: presetPlan ? Store.planLabel(presetPlan) : null,
        total: composed,
        currency: PRESETS.currency || 'COP',
        period: PRESETS.period || 'mes',
        demo: !!PRESETS.demo
      };
    },
    /* El plan a la medida: un SNAPSHOT de la composición actual (servicios + capacidades + cuota +
     * total) que el cliente guarda desde «Configurar mi plan». No cambia nada del cotizador — es
     * la propuesta que aparece en Planes y que se manda a pagar con el mismo flujo de factura y
     * Bold simulado que los planes del catálogo. */
    customPlan: function () {
      var c = Store.settings().customPlan;
      return c && typeof c === 'object' ? clone(c) : null;
    },
    saveCustomPlan: function () {
      var a = Store.myAci();
      var pick = function (x) { return { id: x.id, label: x.label, price: x.price }; };
      var snapshot = {
        lines: a.services.filter(function (s) { return s.enabled; }).map(pick),
        capabilities: a.capabilities.filter(function (c) { return c.enabled; }).map(pick),
        quota: a.quotaActual ? clone(a.quotaActual) : null,
        total: a.total,
        period: a.period,
        currency: a.currency,
        paid: false,
        savedAt: new Date().toISOString()
      };
      Store.saveSettings({ customPlan: snapshot });
      return clone(snapshot);
    },
    /* Un clic en un paquete recomendado deja marcadas SUS líneas; se guarda lo que queda apagado
     * (disabledLines), así que volver a mano no pierde nada. */
    setLines: function (ids) {
      ids = (ids || []).slice();
      var all = Store.services();
      var off = all.filter(function (s) { return ids.indexOf(s.id) < 0; }).map(function (s) { return s.id; });
      if (off.length === all.length) throw new Error('Debe quedar al menos una línea habilitada.');
      Store.saveSettings({ disabledLines: off });
      return Store.servicesEnabled();
    },

    assistantCharacters: function () { return clone(ASSISTANT_CHARACTERS); },

    /* Whether the presence can be configured on this plan (default: the
     * current one). Below ASSISTANT_GATED_PLAN the pack's presence is shown. */
    assistantConfigurable: function (plan) {
      return planAtLeast(plan === undefined ? Store.settings().plan : plan, ASSISTANT_GATED_PLAN);
    },
    ASSISTANT_GATED_PLAN: 'Professional',

    assistantOverrides: function () {
      try {
        var o = JSON.parse(localStorage.getItem(NS + ASSISTANT_KEY) || '{}');
        return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
      } catch (err) { return {}; }
    },

    /* The effective presence: defaults, then every VALID stored override.
     * `overridden` lists which fields differ from the defaults. Below the
     * gated plan (`locked`) stored overrides are IGNORED, never deleted —
     * same downgrade semantics as the brand's fonts/header — and listed in
     * `ignored`, so an upgrade brings them back. opts.plan evaluates another plan. */
    assistant: function (opts) {
      opts = opts || {};
      var d = ASSISTANT_DEFAULTS, ov = Store.assistantOverrides();
      var out = clone(d), o = {};
      out.requiredPlan = ASSISTANT_GATED_PLAN;
      out.locked = !Store.assistantConfigurable(opts.plan);
      if (out.locked) {
        out.overridden = {};
        out.ignored = Object.keys(ov).filter(function (k) { return ['enabled', 'character', 'name', 'brandSuit'].indexOf(k) >= 0; });
        return out;
      }
      out.ignored = [];
      if (typeof ov.enabled === 'boolean' && ov.enabled !== d.enabled) { out.enabled = ov.enabled; o.enabled = true; }
      if (assistantCharacter(ov.character) && ov.character !== d.character) { out.character = ov.character; o.character = true; }
      var name = typeof ov.name === 'string' ? ov.name.trim() : '';
      if (name && name.length <= ASSISTANT_NAME_MAX && name !== d.name) { out.name = name; o.name = true; }
      if (typeof ov.brandSuit === 'boolean' && ov.brandSuit !== d.brandSuit) { out.brandSuit = ov.brandSuit; o.brandSuit = true; }
      out.overridden = o;
      return out;
    },

    /* Merges a patch into the stored overrides; a field equal to its default
     * is removed rather than stored. Throws (Spanish, user-facing) on an
     * invalid value instead of storing it. */
    saveAssistant: function (patch) {
      if (!Store.assistantConfigurable()) throw new Error('La presencia del asistente se configura desde el plan ' + Store.planLabel(ASSISTANT_GATED_PLAN) + '.');
      patch = patch || {};
      var d = ASSISTANT_DEFAULTS, next = Store.assistantOverrides();
      ['enabled', 'brandSuit'].forEach(function (k) {
        if (!(k in patch)) return;
        if (typeof patch[k] !== 'boolean') throw new Error('Valor inválido para "' + k + '".');
        if (patch[k] === d[k]) delete next[k]; else next[k] = patch[k];
      });
      if ('character' in patch) {
        if (!assistantCharacter(patch.character)) throw new Error('Ese personaje no existe.');
        if (patch.character === d.character) delete next.character; else next.character = patch.character;
      }
      if ('name' in patch) {
        var n = String(patch.name == null ? '' : patch.name).trim();
        if (!n) throw new Error('El asistente necesita un nombre.');
        if (n.length > ASSISTANT_NAME_MAX) throw new Error('El nombre del asistente no puede superar ' + ASSISTANT_NAME_MAX + ' caracteres.');
        if (n === d.name) delete next.name; else next.name = n;
      }
      if (!Object.keys(next).length) { Store.resetAssistant(); return {}; }
      write(ASSISTANT_KEY, next);
      return next;
    },

    resetAssistant: function () {
      try { localStorage.removeItem(NS + ASSISTANT_KEY); } catch (err) { /* ignore */ }
    },

    ASSISTANT_NAME_MAX: 40,

    /* The welcome bubble greets a browser once. Storage can throw (private
     * windows, blocked site data): then it simply greets again next time. */
    assistantWelcomed: function () {
      try { return localStorage.getItem(NS + ASSISTANT_WELCOMED_KEY) === '1'; } catch (err) { return false; }
    },
    markAssistantWelcomed: function () {
      try { localStorage.setItem(NS + ASSISTANT_WELCOMED_KEY, '1'); } catch (err) { /* ignore */ }
    },

    /* The single palette-derivation rule, exposed for the backoffice preview
     * (see derivePalette below for how and why). */
    derivePalette: function (ink, accent) { return derivePalette(BRAND_DEFAULTS.colors, ink, accent); },

    /* WCAG 2.x contrast ratio between two #rrggbb colors. */
    contrastRatio: function (a, b) { return contrastRatio(a, b); },

    /* Wipe everything back to seed state. Used by the reset control. Brand
     * and assistant overrides go too: "Restablecer datos de demo" means the
     * pack's look and presence (and the welcome greets again). */
    reset: function () {
      ['fabrics', 'sellers', 'quotes', 'furniture', 'users', 'settings', 'servicePoints', 'invoices', BRAND_KEY, ASSISTANT_KEY, ASSISTANT_WELCOMED_KEY].forEach(function (e) {
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
     * fine increments, no minimum, remainder goes back to inventory. La
     * orientación del corte es la excepción: sin el dato NO se gira (ver
     * docs/consumo-direccional.md) — cotizar de menos es el único error que el
     * cliente no puede corregir al cortar. */
    fabricRules: function (fabric) {
      var f = fabric || {};
      var num = function (v, fallback) { var n = +v; return isFinite(n) && n > 0 ? n : fallback; };
      var dir = (f.cutDirection === 'free' || f.cutDirection === 'directional') ? f.cutDirection : 'unknown';
      return {
        rollWidthCm: num(f.rollWidthCm, 140),
        rollLengthM: num(f.rollLengthM, 30),
        saleUnit: f.saleUnit === 'rollo' ? 'rollo' : 'metro',
        incrementM: num(f.incrementM, 0.1),
        minOrderM: num(f.minOrderM, 0),
        supplierMinM: num(f.supplierMinM, 0),
        reusableRemainder: f.reusableRemainder !== false,
        /* 'free' deja girar las piezas; 'directional' y 'unknown' no. `unknown`
         * es el estado de un registro sin el dato, y es conservador a propósito. */
        cutDirection: dir,
        /* La repetición del diseño puede subir la cantidad y no hay fórmula
         * todavía: el estado honesto es 'confirm' (se avisa y lo confirma un
         * asesor). Solo un 'none' declarado lo calla. */
        patternMatch: f.patternMatch === 'none' ? 'none' : 'confirm'
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

      var rules = Store.fabricRules(fabric);
      var rollM = rules.rollWidthCm / 100;
      /* Rotar una pieza es una decisión de la TELA, no del mueble: una tela con
       * pelo, rayas o dibujo con dirección pierde el sentido (y mide menos) si el
       * corte la gira. Sin el dato, no se rota. */
      var rota = rules.cutDirection === 'free';
      var tecnico = 0;
      var despiece = pieces.map(function (p) {
        // The allowance is per piece, on both dimensions, not on the total.
        var w = p.w + SEAM, h = p.h + SEAM;
        var metres = packRun(p.qty, w, h, rollM, rota);
        tecnico += metres;
        return { name: p.name, qty: p.qty, w: round2(w), h: round2(h), metres: round2(metres) };
      });

      var s = Store.settings();
      var centro = tecnico * (1 + (+s.wastePct || 0) / 100) * (1 + (+s.marginPct || 0) / 100);
      var tol = Math.max(0, +s.rangeTolerancePct || 0) / 100;
      return {
        modelo: 'componentes',
        rollWidthCm: rules.rollWidthCm,
        cutDirection: rules.cutDirection,
        patternMatch: rules.patternMatch,
        /* Si la tela dejó girar las piezas: el número y su porqué viajan juntos. */
        rotated: rota,
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

    /* Las cantidades que el taller suele gastar en ese mueble — la mano del paso de insumos
     * (docs/insumos-asistidos.md). Los estándares (cuánto rinde un kilo, cada cuánto va una banda)
     * son DATOS del catálogo y DEMO declarado; aquí solo se aplican sobre las caras del mueble.
     * Devuelve [] si falta la medida que los sostiene, o si el insumo no declara estándar. */
    insumoSuggestion: function (service, inputs, furniture) {
      var caras = insumoSurfaces(furniture, inputs);
      var lista = (service && service.insumos) || [];
      if (!caras || !lista.length) return [];
      return lista.map(function (x) {
        var st = x.standard;
        if (!st) return null;
        var qty;
        if (st.mode === 'bandas') {
          var ancho = +st.bandCm > 0 ? +st.bandCm / 100 : 0.07;
          qty = Math.ceil(Math.ceil(caras.anchoAsiento / ancho) * caras.fondoAsiento);
        } else {
          var per = +st.per > 0 ? +st.per : 1;
          qty = Math.ceil(insumoFaceArea(st.faces, caras) / per);
        }
        if (!(qty > 0)) return null;
        return { id: x.id, label: x.label, unit: x.unit, qty: qty, why: st.why || '' };
      }).filter(Boolean);
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
    },

    /* Same id style as nextQuoteId, its own numbering (a 'FAC-' prefix, not
     * shared with 'COT-'). */
    nextInvoiceId: function () {
      var max = 1042;
      read('invoices').forEach(function (inv) {
        var n = parseInt(String(inv.id).replace(/\D/g, ''), 10);
        if (!isNaN(n) && n > max) max = n;
      });
      return 'FAC-' + (max + 1);
    },

    /* Creates a 'Pendiente' invoice for a plan change or a package purchase.
     * data: {kind:'plan'|'package', target, concept, amount, billing?}.
     *
     * `amount` MUST be the caller's PLANS/PACKAGES-sourced number (see
     * admin.html's planPrice()/packagePriceParts()), never anything read from
     * the DOM or typed by the user: in the real integration the browser must
     * not be able to change what the backend charges — the backend reads the
     * price from its own stored plan/package catalog, not from the request. */
    createInvoice: function (data) {
      data = data || {};
      if (!data.kind || !data.target || !data.concept || !(+data.amount > 0)) {
        throw new Error('Datos de factura incompletos');
      }
      var id = Store.nextInvoiceId();
      var now = new Date(), pad = function (n) { return ('0' + n).slice(-2); };
      // Local calendar day, same convention as quotes (see index.html) — never
      // new Date('YYYY-MM-DD'), which parses as UTC midnight.
      var date = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
      var reference = 'QAI-' + id + '-' + Date.now();
      var invoice = {
        id: id,
        date: date,
        concept: data.concept,
        kind: data.kind,
        target: data.target,
        amount: +data.amount,
        billing: data.kind === 'plan' ? data.billing : undefined,
        provider: 'BOLD (simulado)',
        reference: reference,
        // Obviously fake: never checkout.bold.co or any real domain/scheme.
        checkoutUrl: 'simulado://pago/' + reference,
        status: 'Pendiente',
        paidAt: null
      };
      return Store.put('invoices', invoice);
    },
    /* IVA (Colombia, 19%): el precio del catálogo es ANTES de IVA y la factura lo suma. Es una
     * constante del prototipo — una sola cifra para toda la app — no una tasa por cliente. Las
     * pantallas ya no rotulan el «+ IVA» junto a la cifra (dueño, 23/09); el impuesto se nombra en
     * el desglose de la factura y en las condiciones generales. */
    IVA_RATE: 0.19,
    /* Desglose de una factura: valor de lista + IVA = total a pagar. El `amount` GUARDADO sigue
     * siendo el valor del catálogo (lo que sale de PLANS/PACKAGES, nunca algo tecleado); el IVA y
     * el total se derivan aquí, en un solo sitio, para que la tabla y el modal de pago no puedan
     * decir números distintos. */
    invoiceTotals: function (inv) {
      var value = Math.max(0, +((inv && inv.amount) || 0));
      var iva = Math.round(value * Store.IVA_RATE);
      return { value: value, iva: iva, total: value + iva };
    },

    /* The only door that settles an invoice: only a 'Pendiente' one can
     * become 'Pagada' or 'Rechazada', and a settled one is locked forever —
     * same spirit as setQuoteStatus's lock on quotes above. Applying the
     * underlying plan/package change is the CALLER's job (admin.html), once
     * this returns 'Pagada' — this function only owns the invoice's own
     * status. */
    isInvoiceSettled: isInvoiceSettled,
    settleInvoice: function (id, status) {
      if (INVOICE_STATUSES.indexOf(status) < 0 || status === 'Pendiente') {
        throw new Error('Estado de factura desconocido: ' + status);
      }
      var inv = Store.get('invoices', id);
      if (!inv) throw new Error('Factura no encontrada');
      if (isInvoiceSettled(inv)) throw new Error('Esta factura ya fue procesada; no se puede modificar.');
      inv.status = status;
      if (status === 'Pagada') inv.paidAt = new Date().toISOString();
      return Store.put('invoices', inv);
    }
  };

  function norm(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  /* 'YYYY-MM' of the LOCAL calendar month (see the usage block in Store). */
  function monthKey(date) {
    var d = date || new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
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
  function packRun(qty, w, h, rollM, allowRotate) {
    var best = Infinity;
    /* Dos orientaciones solo cuando la tela lo permite: `allowRotate` no es un
     * adorno, es el dato de la tela (cutDirection === 'free'). */
    (allowRotate === true ? [[w, h], [h, w]] : [[w, h]]).forEach(function (o) {
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

  /* ------------------------------------------------- insumos del trabajo -- */

  /* La superficie de tela de un mueble, en m², para estimar los insumos del taller
   * (docs/insumos-asistidos.md). Con plantilla sale del DESPIECE —las mismas piezas que el motor
   * corta, así que respeta la cobertura que declaró el cliente—; sin plantilla sale de sus medidas
   * y de los metros base del mueble (los del backoffice), con el rendimiento de un rollo de 1,4 m:
   * 0,8 m² de superficie por metro. Es una aproximación declarada, no una medida de taller.
   * null cuando falta la medida que la sostiene: quien la use lo dice, no la inventa. */
  var SURFACE_PER_METER = 0.8;
  function insumoSurfaces(furniture, inputs) {
    var i = inputs || {};
    var W = (+i.width || 0) / 100, H = (+i.height || 0) / 100, D = (+i.depth || 0) / 100;
    if (!(W > 0 && H > 0 && D > 0)) return null;
    var fondoAsiento = Math.max(0.35, D - 0.18);
    var hRespaldo = Math.max(0.30, H - 0.42);
    var tpl = FURNITURE_TEMPLATES[furniture && furniture.id];
    if (tpl) {
      var asiento = 0, espaldar = 0, tela = 0;
      tpl.pieces(i).forEach(function (p) {
        var area = p.w * p.h * p.qty;
        tela += area;
        if (p.name === 'Asiento superior') asiento += area;
        if (p.name === 'Respaldo frontal') espaldar += area;
      });
      return { tela: tela, asiento: asiento, espaldar: espaldar,
               anchoAsiento: W, fondoAsiento: fondoAsiento };
    }
    var metros = (furniture && furniture.meters) || null;
    /* Sin plantilla, los metros base del mueble son los del backoffice y escalan como escalan en la
     * estimación de tela: por cantidad cuando el mueble se cuenta por piezas y por ancho cuando su
     * consumo va con el ancho (los dos factores y sus topes son los de `estimateBaseline`). Sin
     * esto, tres poltronas recibirían los insumos de una. */
    var qty = Math.max(1, +i.seats || 1);
    var factor = 1;
    if (furniture && furniture.scaleByQty) factor *= qty;
    if (furniture && furniture.widthScaled) factor *= Math.max(0.75, Math.min(1.4, W / 2.10));
    var medio = metros ? (((+metros[0] || 0) + (+metros[1] || 0)) / 2) * factor : 0;
    if (!(medio > 0)) return null;
    return { tela: medio * SURFACE_PER_METER, asiento: W * fondoAsiento * qty,
             espaldar: W * hRespaldo * qty, anchoAsiento: W * qty, fondoAsiento: fondoAsiento };
  }

  /* Qué caras suma un estándar: 'tela' es todo lo tapizado; 'asiento' y 'espaldar', esa cara. */
  function insumoFaceArea(faces, caras) {
    var keys = (faces && faces.length) ? faces : ['tela'];
    return keys.reduce(function (sum, k) {
      return sum + (k === 'tela' ? caras.tela : k === 'asiento' ? caras.asiento
                 : k === 'espaldar' ? caras.espaldar : 0);
    }, 0);
  }

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

  /* ------------------------------------------------------------ brand data -- */

  // The pack's look (clients/<slug>/client.json), rendered by tools/generate.mjs.
  var BRAND_DEFAULTS = {{BRAND_DEFAULTS_JSON}};
  var BRAND_KEY = 'brand';

  /* The pack's assistant presence (clients/<slug>/client.json `assistant`),
   * rendered by tools/generate.mjs and validated by tools/client-pack.mjs. */
  var ASSISTANT_DEFAULTS = {{ASSISTANT_DEFAULTS_JSON}};
  /* El catálogo de líneas es del producto, no del paquete: el pack no declara líneas ni línea
   * base, solo su marca. Quién entra lo decide el negocio desde el backoffice (modelo v2); el
   * `minPlan` de cada línea se conserva como dato de qué paquete lo traía, sin bloquear nada. */
  var SERVICE_LINES = {{SERVICE_LINES_JSON}};
  /* Los textos de cada motivo, por oficio (shared/service-lines.json → `copyByEngine`) con la línea
   * como override: los pasos del cotizador leen la copia YA resuelta y no saben de oficios. */
  var COPY_BY_ENGINE = {{COPY_BY_ENGINE_JSON}};
  /* Los daños que pregunta una línea que los pide (hoy «reparación»): cada ítem suma un valor
   * fijo a la estimación (ver lineEstimate). */
  var DAMAGE_ITEMS = {{DAMAGE_ITEMS_JSON}};
  /* Las preguntas de los motivos que no van por tela y las tarifas de cada oficio: los dos son
   * datos de producto (shared/service-lines.json), no código. */
  var ASK_SPECS = {{ASK_SPECS_JSON}};
  var PRICING_RATES = {{PRICING_RATES_JSON}};
  var PRESETS = {{PRESETS_JSON}};
  var ASSISTANT_KEY = 'assistant';
  var ASSISTANT_WELCOMED_KEY = 'assistantWelcomed';
  var ASSISTANT_NAME_MAX = 40;
  // Configuring the presence (on/off, character, name, suit) starts at this plan.
  var ASSISTANT_GATED_PLAN = 'Professional';
  // Same ids as tools/client-pack.mjs (ASSISTANT_CHARACTERS) — keep both in sync.
  var ASSISTANT_CHARACTERS = [
    { id: 'female', label: 'Mujer', defaultName: 'Lía' },
    { id: 'male', label: 'Hombre', defaultName: 'Tomás' }
  ];
  function assistantCharacter(id) {
    return ASSISTANT_CHARACTERS.filter(function (c) { return c.id === id; })[0] || null;
  }
  var BRAND_NAME_MAX = 60;
  var BRAND_HEADER_VARIANTS = ['normal', 'inverted'];
  /* Same names tools/generate.mjs emits in each page's :root (see
   * CORE_VAR_ALIASES there): three core keys are spelled differently per page. */
  var BRAND_VAR_ALIASES = {
    inkSecondary: ['--ink-2', '--ink2'],
    goldLight: ['--gold-light', '--gold2'],
    success: ['--success', '--green']
  };
  var PLAN_ORDER = ['Essential', 'Professional', 'Business'];
  var BRAND_GATED = { fonts: 'Professional', headerVariant: 'Professional' };
  /* Approved Google Fonts. `weights` only lists weights each family really
   * ships (the css2 API rejects the whole request over one missing weight —
   * Lato has no 500/600). */
  var BRAND_FONTS = [
    { name: 'Montserrat', category: 'sans-serif', weights: '400;500;600;700' },
    { name: 'Roboto', category: 'sans-serif', weights: '400;500;600;700' },
    { name: 'Inter', category: 'sans-serif', weights: '400;500;600;700' },
    { name: 'Lato', category: 'sans-serif', weights: '400;700' },
    { name: 'Open Sans', category: 'sans-serif', weights: '400;500;600;700' },
    { name: 'Poppins', category: 'sans-serif', weights: '400;500;600;700' },
    { name: 'Playfair Display', category: 'serif', weights: '400;500;600;700' },
    { name: 'Cormorant Garamond', category: 'serif', weights: '400;500;600;700' }
  ];

  /* Essential < Professional < Business; an unknown plan counts as Essential. */
  function planAtLeast(plan, need) {
    return Math.max(0, PLAN_ORDER.indexOf(plan)) >= PLAN_ORDER.indexOf(need);
  }

  function planAllows(plan, feature) {
    var need = BRAND_GATED[feature];
    if (!need) return true;
    return planAtLeast(plan, need);
  }

  function kebab(s) { return String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(); }

  function firstFamily(stack) { return String(stack || '').split(',')[0].trim().replace(/^["']|["']$/g, ''); }

  function brandFontList() {
    var list = BRAND_FONTS.map(function (f) { return clone(f); });
    var d = BRAND_DEFAULTS.fonts;
    var bodyCategory = /(^|,)\s*serif\s*$/.test(d.body) ? 'serif' : 'sans-serif';
    [[d.headingName, d.headingFallback === 'serif' ? 'serif' : 'sans-serif'], [firstFamily(d.body), bodyCategory]].forEach(function (pair) {
      if (pair[0] && !list.some(function (f) { return f.name === pair[0]; })) {
        list.push({ name: pair[0], category: pair[1], weights: '400;500;600;700' });
      }
    });
    return list;
  }

  function fontInfo(name) {
    return brandFontList().filter(function (f) { return f.name === name; })[0] || null;
  }

  /* Fonts for a heading/body pair. Both at their defaults gives back the
   * pack's own fonts untouched (its hand-written href included). */
  function fontsFor(headingName, bodyName) {
    var d = BRAND_DEFAULTS.fonts;
    if (headingName === d.headingName && bodyName === firstFamily(d.body)) return clone(d);
    var h = fontInfo(headingName), b = fontInfo(bodyName);
    var families = [h];
    if (b.name !== h.name) families.push(b);
    return {
      href: 'https://fonts.googleapis.com/css2?' + families.map(function (f) {
        return 'family=' + f.name.replace(/ /g, '+') + ':wght@' + f.weights;
      }).join('&') + '&display=swap',
      headingName: h.name,
      headingFallback: h.category,
      body: '"' + b.name + '",' + (b.category === 'serif' ? 'Georgia,serif' : 'Arial,sans-serif')
    };
  }

  function isHex6(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v); }
  function isPngDataUrl(v) { return typeof v === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(v); }

  function hexToRgb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(rgb) {
    return '#' + rgb.map(function (v) { return ('0' + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2); }).join('');
  }
  function normHex(hex) { return rgbToHex(hexToRgb(hex)); }

  /* Linear interpolation in sRGB, t=0 -> a, t=1 -> b. Same space the pages'
   * own color-mix(in srgb, ...) uses (modes/inverted.css, admin.html), so a
   * derived tint and a CSS-mixed one agree. */
  function mixHex(a, b, t) {
    var x = hexToRgb(a), y = hexToRgb(b);
    return rgbToHex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; }));
  }

  function luminance(hex) {
    var c = hexToRgb(hex).map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function contrastRatio(a, b) {
    var la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  /* Nudges fg toward black (on a light bg) or white (on a dark one) in 5%
   * steps until it reaches `min` contrast against bg. */
  function readableOn(fg, bg, min) {
    if (contrastRatio(fg, bg) >= min) return fg;
    var target = luminance(bg) > 0.18 ? '#000000' : '#ffffff';
    for (var t = 0.05; t <= 1.0001; t += 0.05) {
      var c = mixHex(fg, target, t);
      if (contrastRatio(c, bg) >= min) return c;
    }
    return target;
  }

  /* THE palette derivation rule. Only runs when an admin overrides the
   * primary (ink) and/or accent color; pack defaults are never derived.
   *
   * Every other brand color is a mix of ink (or accent, for the one
   * accent-tinted wash) toward white (tints: washes, lines, borders) or
   * toward black (shades: secondary ink, shadows, the demo banner), in sRGB
   * — the space the pages' own color-mix() already uses, so results are
   * predictable and match the CSS. sRGB is not perceptually uniform, which
   * is why readable roles are not trusted to the mix alone: every tint used
   * as TEXT is then pushed by readableOn() until it clears 4.5:1 against the
   * surface it sits on (captions on ink, hints on white...). Semantic colors
   * (amber, red, success) keep the pack's values; the success washes are
   * mixed from that unchanged success color. */
  function derivePalette(base, ink, accent) {
    var W = '#ffffff', K = '#000000';
    var P = normHex(ink), A = normHex(accent);
    var tint = function (t) { return mixHex(P, W, t); };
    var shade = function (t) { return mixHex(P, K, t); };
    var onInk = function (t) { return readableOn(tint(t), P, 4.5); };
    var onWhite = function (t) { return readableOn(tint(t), W, 4.5); };
    var cream = tint(0.94);
    var bannerBg = shade(0.82);
    var successWash = mixHex(normHex(base.success), W, 0.85);
    var core = {
      ink: P,
      inkSecondary: shade(0.25),
      accent: A,
      gold: W,
      goldLight: onInk(0.8),
      cream: cream,
      paper: W,
      text: readableOn(shade(0.78), cream, 7),
      muted: readableOn(mixHex(shade(0.5), W, 0.3), cream, 4.5),
      line: tint(0.8),
      success: base.success,
      soft: tint(0.92),
      amber: base.amber,
      red: base.red
    };
    var tints = {
      bannerBg: bannerBg,
      demoCaption: readableOn(tint(0.8), bannerBg, 4.5),
      bannerTextAdmin: readableOn(tint(0.8), bannerBg, 4.5),
      panelWash: tint(0.96),
      selectedTint: mixHex(A, W, 0.9),
      messagesBg: tint(0.95),
      tagBg: tint(0.93),
      requestNumberBg: tint(0.95),
      secureText: onInk(0.78),
      journeyIntroText: onInk(0.75),
      helpCardText: onInk(0.7),
      dashedBorder: tint(0.6),
      secondaryBorder: tint(0.55),
      measureVisualText: onInk(0.75),
      unitLabel: onWhite(0.45),
      noticeText: readableOn(shade(0.4), tint(0.96), 4.5),
      noticeIconBorder: tint(0.5),
      quotePreviewCaption: onInk(0.7),
      summaryCaption: onInk(0.7),
      summaryFoot: onInk(0.65),
      wizardHint: onWhite(0.45),
      chatHeaderCaption: onInk(0.7),
      quickQuestionBorder: tint(0.72),
      progressTrackBg: tint(0.86),
      photoPlaceholderBg: tint(0.25),
      uploadZoneBg: tint(0.97),
      iconCircleBg: tint(0.9),
      stepBorder: tint(0.45),
      stepLabel: onInk(0.65),
      successIconBg: successWash,
      successBorder: successWash,
      profileCaption: onInk(0.7),
      sideFootText: onInk(0.65),
      buttonSecondaryBorder: tint(0.6),
      navInactiveText: onInk(0.7),
      activityTimeText: onWhite(0.45),
      donutThird: tint(0.55),
      tableHeadText: readableOn(shade(0.3), tint(0.95), 4.5),
      availabilityRing: successWash,
      availabilityOffBg: tint(0.6),
      availabilityOffRing: tint(0.92),
      zoneBorder: tint(0.7),
      toggleOffBg: tint(0.65),
      tableHeadBg: tint(0.95),
      statusNewBg: tint(0.9),
      statusSentBg: successWash,
      activityBorder: tint(0.92),
      shellLeadText: onWhite(0.4),
      shellFootText: onInk(0.65)
    };
    var shadow = hexToRgb(shade(0.6)).join(','), backdrop = hexToRgb(shade(0.75)).join(',');
    var out = clone(base);
    Object.keys(core).forEach(function (k) { out[k] = core[k]; });
    out.tints = {};
    Object.keys(base.tints || {}).forEach(function (k) { out.tints[k] = tints[k] || base.tints[k]; });
    out.rgb = {};
    Object.keys(base.rgb || {}).forEach(function (k) { out.rgb[k] = k === 'modalBackdrop' ? backdrop : shadow; });
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
        req.onsuccess = function () {
          // The backoffice now keeps a connection open just to measure storage,
          // so let a reset/deleteDatabase through instead of blocking it; the
          // next call simply reopens.
          req.result.onversionchange = function () { req.result.close(); Photos._db = null; };
          resolve(req.result);
        };
        req.onerror = function () { reject(req.error); };
      });
      return Photos._db;
    },

    _tx: function (mode, run) {
      return Photos._open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction('photos', mode);
          var out = run(tx.objectStore('photos'));
          tx.oncomplete = function () {
            /* Un IDBRequest se resuelve SIEMPRE con su `result`: si no, una clave que no está
             * devolvía el request entero — un objeto truthy — y `getAll` no podía filtrar nada
             * (una foto ausente se pintaba como un <img> roto). `result` undefined es null. */
            if (out && typeof IDBRequest !== 'undefined' && out instanceof IDBRequest) {
              return resolve(out.result === undefined ? null : out.result);
            }
            resolve(out && out.result !== undefined ? out.result : out);
          };
          tx.onerror = function () { reject(tx.error); };
        });
      });
    },

    put: function (id, dataUrl) {
      return Photos._tx('readwrite', function (s) { s.put(dataUrl, id); }).then(function () { return id; });
    },

    /* Una clave que no está devuelve null, NO el IDBRequest: `_tx` resuelve con el propio request
     * cuando su `result` es undefined, y eso es un objeto truthy. Sin esto `getAll` no filtraba
     * nada y una foto que no está en este navegador se pintaba como un `<img>` roto — el rectángulo
     * vacío que se veía como una foto oscura en el detalle de la solicitud. */
    get: function (id) {
      if (!id) return Promise.resolve(null);
      return Photos._tx('readonly', function (s) { return s.get(id); })
        .then(function (v) { return v === undefined ? null : v; })
        .catch(function () { return null; });
    },

    remove: function (id) {
      return Photos._tx('readwrite', function (s) { s.delete(id); });
    },

    /* Resolves in the order given, dropping any that no longer exist. */
    getAll: function (ids) {
      return Promise.all((ids || []).map(function (id) { return Photos.get(id); }))
        .then(function (list) { return list.filter(Boolean); });
    },

    /* Real bytes held in the photo store, for the backoffice "Usage" page.
     * Records are base64 data URLs, so each counts the bytes it decodes to —
     * the image itself, not its text encoding; a Blob counts its own size. */
    totalBytes: function () {
      return Photos._tx('readonly', function (s) { return s.getAll(); }).then(function (rows) {
        return (rows || []).reduce(function (sum, v) { return sum + storedBytes(v); }, 0);
      }).catch(function () { return 0; });
    }
  };

  function storedBytes(v) {
    if (typeof Blob !== 'undefined' && v instanceof Blob) return v.size;
    if (typeof v !== 'string') return 0;
    var m = /^data:[^,]*;base64,(.*)$/.exec(v);
    if (!m) return new Blob([v]).size;
    var b64 = m[1].replace(/\s/g, '');
    var pad = b64.slice(-2) === '==' ? 2 : b64.slice(-1) === '=' ? 1 : 0;
    return Math.max(0, Math.floor(b64.length * 3 / 4) - pad);
  }

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
        ? ['dashboard', 'quotes', 'fabrics', 'furniture', 'sellers', 'points', 'settings', 'styles', 'assistant', 'upgrade', 'usage']
        : ['dashboard', 'quotes'];
    },

    can: function (user, section) { return Auth.sections(user).indexOf(section) >= 0; }
  };

  /* ---------------------------------------------------------------- Brand --
   *
   * Paints Store.brand() onto the current page. Called synchronously from
   * each page's <head>, right after this file, so CSS variables, the fonts
   * <link>, the enabled color-mode <style> and document.title are already
   * right before first paint. Logos and [data-brand-name] text live in the
   * body, which is not parsed yet at that point: they are swapped on
   * DOMContentLoaded, and while an override would change them the page keeps
   * them visibility:hidden (data-brand-pending) so the pack's default never
   * flashes first.
   *
   * With no effective override this is a no-op: nothing is touched and the
   * page is exactly what tools/generate.mjs rendered. Once something was
   * applied, a later call with no overrides (reset) restores the defaults by
   * removing the inline properties again. */
  var Brand = {
    _active: false,
    _base: null,
    _domHooked: false,

    apply: function (brand) {
      var doc = global.document;
      if (!doc) return false;
      var b = brand || Store.brand();
      var o = b.overridden;
      var active = o.companyName || o.colors || o.logos || o.fonts || o.headerVariant;
      if (!active && !Brand._active) return false;
      Brand._active = !!active;
      var root = doc.documentElement;
      if (!Brand._base) {
        Brand._base = { title: doc.title, watermark: global.getComputedStyle(root).getPropertyValue('--print-watermark').trim() };
      }
      applyBrandColors(b, root);
      applyBrandFonts(b, doc, root);
      each(doc.querySelectorAll('style[data-color-mode]'), function (s) {
        var media = s.getAttribute('data-color-mode') === b.headerVariant ? 'all' : 'not all';
        if (s.getAttribute('media') !== media) s.setAttribute('media', media);
      });
      doc.title = o.companyName ? swapBrandName(Brand._base.title, b.companyName) : Brand._base.title;

      if (doc.readyState === 'loading') {
        if (o.companyName || o.logos || o.headerVariant) {
          if (!doc.getElementById('brandPendingStyle')) {
            var st = doc.createElement('style');
            st.id = 'brandPendingStyle';
            st.textContent = 'html[data-brand-pending] [data-brand-logo],html[data-brand-pending] [data-brand-name]{visibility:hidden}';
            (doc.head || root).appendChild(st);
          }
          root.setAttribute('data-brand-pending', '');
        }
        if (!Brand._domHooked) {
          Brand._domHooked = true;
          doc.addEventListener('DOMContentLoaded', function () {
            /* El finally no es decorativo: data-brand-pending esconde el logo y
             * el nombre para que no parpadee el valor del pack. Si applyBrandDom
             * fallara, sin esto quedarían ocultos para siempre. */
            try { applyBrandDom(Store.brand()); }
            finally { root.removeAttribute('data-brand-pending'); }
          });
        }
      } else {
        applyBrandDom(b);
      }
      return true;
    }
  };

  function each(list, fn) { Array.prototype.forEach.call(list || [], fn); }

  function brandVarEntries(colors) {
    var out = [];
    Object.keys(colors).forEach(function (k) {
      if (k === 'tints' || k === 'rgb') return;
      (BRAND_VAR_ALIASES[k] || ['--' + kebab(k)]).forEach(function (n) { out.push([n, colors[k]]); });
    });
    out.push(['--rgb-accent', hexToRgb(colors.accent).join(',')]);
    Object.keys(colors.tints || {}).forEach(function (k) { out.push(['--tint-' + kebab(k), colors.tints[k]]); });
    Object.keys(colors.rgb || {}).forEach(function (k) { out.push(['--rgb-' + kebab(k), colors.rgb[k]]); });
    return out;
  }

  function applyBrandColors(b, root) {
    var on = b.overridden.colors;
    brandVarEntries(on ? b.colors : BRAND_DEFAULTS.colors).forEach(function (e) {
      if (on) root.style.setProperty(e[0], e[1]); else root.style.removeProperty(e[0]);
    });
    /* The watermark is an SVG data URI (var() cannot reach inside it): its
     * only color is the %23rrggbb fill, rebuilt from the default value. */
    if (on && Brand._base.watermark) {
      root.style.setProperty('--print-watermark', Brand._base.watermark.replace(/%23[0-9a-fA-F]{3,6}/, '%23' + normHex(b.colors.inkSecondary).slice(1)));
    } else {
      root.style.removeProperty('--print-watermark');
    }
  }

  function applyBrandFonts(b, doc, root) {
    var link = doc.querySelector('link[data-brand-fonts]');
    if (link && link.getAttribute('href') !== b.fonts.href) link.setAttribute('href', b.fonts.href);
    if (b.overridden.fonts) {
      root.style.setProperty('--font-body', b.fonts.body);
      root.style.setProperty('--font-heading', '"' + b.fonts.headingName + '",' + b.fonts.headingFallback);
    } else {
      root.style.removeProperty('--font-body');
      root.style.removeProperty('--font-heading');
    }
  }

  function applyBrandDom(b) {
    var doc = global.document;
    var slot = b.headerVariant === 'inverted' ? 'onLight' : 'onDark';
    each(doc.querySelectorAll('img[data-brand-logo]'), function (img) {
      if (!img.hasAttribute('data-brand-alt')) img.setAttribute('data-brand-alt', img.getAttribute('alt') || '');
      var src = b.logos[slot] || b.logos.onDark || b.logos.onLight;
      if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
      if (img.getAttribute('data-brand-logo') !== slot) img.setAttribute('data-brand-logo', slot);
      var base = img.getAttribute('data-brand-alt');
      var alt = b.overridden.companyName ? swapBrandName(base, b.companyName) : base;
      if (img.getAttribute('alt') !== alt) img.setAttribute('alt', alt);
    });
    each(doc.querySelectorAll('[data-brand-name]'), function (el) {
      if (!el.hasAttribute('data-brand-base')) el.setAttribute('data-brand-base', el.textContent);
      var t = b.overridden.companyName ? b.companyName : el.getAttribute('data-brand-base');
      if (el.textContent !== t) el.textContent = t;
    });
    each(doc.querySelectorAll('[data-brand-label]'), function (el) {
      if (!el.hasAttribute('data-brand-label-base')) el.setAttribute('data-brand-label-base', el.getAttribute('aria-label') || '');
      var base = el.getAttribute('data-brand-label-base');
      el.setAttribute('aria-label', b.overridden.companyName ? swapBrandName(base, b.companyName) : base);
    });
  }

  /* Replaces the pack's name inside a generated string (title, alt text,
   * aria-label): displayName first, then shortName ("Asistente Macizo"). */
  function swapBrandName(str, name) {
    var s = String(str || '');
    var from = [BRAND_DEFAULTS.companyName, BRAND_DEFAULTS.shortName].filter(function (n) { return n && s.indexOf(n) >= 0; })[0];
    return from ? s.split(from).join(name) : s;
  }

  /* ------------------------------------------------------------ Assistant --
   *
   * Paints Store.assistant() onto the cotizador's markup, with no 3D involved:
   * html[data-assistant="on"|"off"] (CSS hides the character layer, "Preguntar",
   * the chat button and panel, and swaps assistant copy for neutral copy when
   * off), [data-assistant-name] text and [data-assistant-label] aria-labels
   * ("{name}" is replaced). Called from the page's <head> like Brand.apply(),
   * so a disabled presence never flashes. Fires "assistantchange" on window so
   * the 3D layer (a module script in index.html) can follow. */
  var Assistant = {
    apply: function () {
      var doc = global.document;
      if (!doc) return;
      var a = Store.assistant();
      doc.documentElement.setAttribute('data-assistant', a.enabled ? 'on' : 'off');
      var paint = function () {
        each(doc.querySelectorAll('[data-assistant-name]'), function (el) { el.textContent = a.name; });
        each(doc.querySelectorAll('[data-assistant-label]'), function (el) {
          el.setAttribute('aria-label', el.getAttribute('data-assistant-label').split('{name}').join(a.name));
        });
      };
      if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', paint, { once: true });
      else paint();
      try { global.dispatchEvent(new CustomEvent('assistantchange', { detail: a })); } catch (err) { /* ignore */ }
      return a;
    }
  };

  /* Another tab saving (or resetting) the brand, the plan or the assistant repaints this one. */
  if (global.addEventListener) {
    global.addEventListener('storage', function (e) {
      if (e.key === null || e.key === NS + BRAND_KEY || e.key === NS + 'settings') Brand.apply();
      // The plan lives in settings: a downgrade/upgrade changes what the presence shows.
      if (e.key === null || e.key === NS + ASSISTANT_KEY || e.key === NS + 'settings') Assistant.apply();
    });
  }

  global.Auth = Auth;
  global.Store = Store;
  global.Photos = Photos;
  global.Brand = Brand;
  global.Assistant = Assistant;
})(window);
