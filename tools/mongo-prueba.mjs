/* LA PRUEBA DE MONGO ATLAS — un viaje de ida y vuelta contra el cluster.
 *
 *   node tools/mongo-prueba.mjs
 *
 * Se corre cuando ya hay MONGODB_URI (en .env o en el entorno). Hace lo que hará el prototipo
 * desplegado, en chico: conecta, escribe una cotización de prueba con su pieza y su foto, la lee de
 * vuelta (documento, pieza y la foto DESDE el GridFS), la borra y deja el cluster como estaba.
 *
 * Todo va a un negocio de prueba propio («prueba.base.»), no al de la demo: no toca nada de nadie.
 * La cadena de conexión no se imprime nunca (regla 9). Sale con 0 si todo pasó y 1 si algo falló.
 */
import { motorMongo, negocioDe } from './api-mongo.mjs';
import { mongoUri, mongoDb } from './api.mjs';

const NS = 'prueba.base.';
const ID = 'COT-PRUEBA';
/* Un PNG de 1×1: alcanza para probar el viaje de la foto sin cargar el cluster de basura. */
const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const pruebas = [];
const revisar = (nombre, condicion, detalle = '') => {
  pruebas.push({ nombre, ok: Boolean(condicion), detalle });
  console.log(`  ${condicion ? '·' : 'x'} ${nombre}${detalle ? ' — ' + detalle : ''}`);
  return Boolean(condicion);
};

function laCotizacionDePrueba() {
  return {
    id: ID,
    date: new Date().toISOString().slice(0, 10),
    source: 'e2e',
    customer: { name: 'Prueba de la base', email: 'base@example.com', phone: '3000000000' },
    service: { id: 'retapizado', label: 'Retapizado de muebles', journey: 'existente' },
    furniture: 'Sofá en L',
    quantityLabel: '3 puestos',
    city: 'Bogotá · 12 de Octubre',
    servicePointId: 'sp-12-de-octubre',
    servicePointName: '12 de Octubre',
    sellerId: 'u_102',
    sellerName: 'Laura Méndez',
    fabricId: 'f_lino_verona',
    fabricName: 'Lino Verona · Arena',
    meters: [27, 32],
    estimate: { kind: 'retapizado', engineVersion: 3, calculatedAt: new Date().toISOString(), parts: [], total: [2899500, 3786000], inputs: { piezas: 1 } },
    price: [2403000, 2848000],
    billing: { modelo: 'corte', facturable: [30, 35], consumo: [27, 32] },
    pieces: [{
      furniture: 'Sofá en L', quantity: 1, coverage: 'complete', cushions: 3,
      measures: { width: 260, height: 85, depth: 170 }, photos: 1,
      meters: [27, 32], value: [2899500, 3786000]
    }],
    photos: [{ pieza: 0, dataUrl: PNG_1X1, width: 1, height: 1, bytes: 70 }],
    status: 'Nueva'
  };
}

async function correr() {
  const uri = mongoUri();
  if (!uri) {
    console.log('Falta MONGODB_URI (en .env o en el entorno): no hay cluster que probar.');
    console.log('Pega la cadena de Atlas en .env y vuelve a correr esta prueba.');
    return 1;
  }
  const donde = negocioDe(NS);
  console.log(`Mongo Atlas · base «${mongoDb()}» · negocio de prueba ${donde.tenantId} / ${donde.brandId}`);
  console.log('');

  const motor = motorMongo({ uri, dbName: mongoDb() });

  /* 1. Escribir (con foto: sube al GridFS y deja su ruta en el documento). */
  const cot = laCotizacionDePrueba();
  const guardadas = await motor.guardar(NS, [cot]);
  revisar('guarda la cotización', guardadas === 1, `${guardadas} guardada`);

  /* 2. Leer de vuelta: documento, pieza, foto y los cajones que el modelo todavía no nombra. */
  const { quotes, total } = await motor.listar(NS);
  const vuelta = quotes.find(q => q.id === ID);
  revisar('la lee de vuelta', Boolean(vuelta), total ? `${total} en el negocio` : '');
  if (!vuelta) return 1;

  revisar('el servicio viaja entero', vuelta.service && vuelta.service.id === 'retapizado' && vuelta.service.journey === 'existente');
  revisar('la estimación congelada vuelve', Array.isArray(vuelta.estimate && vuelta.estimate.total) && vuelta.estimate.total[1] === 3786000);
  revisar('los metros vuelven', Array.isArray(vuelta.meters) && vuelta.meters[0] === 27 && vuelta.meters[1] === 32);
  revisar('el desglose del facturable vuelve', vuelta.billing && Array.isArray(vuelta.billing.facturable) && vuelta.billing.facturable[1] === 35);
  revisar('la pieza vuelve con sus medidas y su valor',
    vuelta.pieces && vuelta.pieces.length === 1 && vuelta.pieces[0].measures.width === 260
    && Array.isArray(vuelta.pieces[0].value) && vuelta.pieces[0].value[0] === 2899500);
  revisar('la etiqueta del mueble vuelve', vuelta.pieces[0].furniture === 'Sofá en L');

  const foto = (vuelta.photos || [])[0];
  revisar('la foto queda en el documento con su ruta',
    foto && typeof foto.path === 'string' && foto.path.startsWith(`api/photos/${NS}/${ID}/`), foto && foto.path);
  revisar('la foto es de su pieza', foto && foto.pieza === 0);

  /* 3. La foto, bajada del GridFS por la misma ruta que atiende la función de Netlify. */
  const archivo = foto && foto.path ? foto.path.split('/').pop() : '';
  const bajada = archivo ? await motor.leerFoto(NS, ID, archivo) : null;
  revisar('la foto se sirve desde el GridFS', Boolean(bajada && bajada.buffer.length), bajada ? `${bajada.buffer.length} bytes · ${bajada.mime}` : 'no bajó');
  if (bajada) {
    const original = Buffer.from(PNG_1X1.split(',')[1], 'base64');
    revisar('la foto llega byte a byte', Buffer.compare(bajada.buffer, original) === 0, `${original.length} bytes esperados`);
  }

  /* 3.b La convención del dueño (25/09): en el CÓDIGO camelCase, en la BASE snake_case. Se mira el
   * documento crudo, no lo que devuelve el motor. */
  const { MongoClient } = await import('mongodb');
  const cliente = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await cliente.connect();
  const crudo = await cliente.db(mongoDb()).collection('quotes').findOne({ _id: ID });
  await cliente.close();
  revisar('en la base las claves son snake_case',
    crudo && 'tenant_id' in crudo && 'service_point_id' in crudo && !('tenantId' in crudo) && !('servicePointId' in crudo));
  revisar('piezas y fotos también',
    crudo && crudo.pieces && 'furniture_label' in crudo.pieces[0] && 'photos_count' in crudo.pieces[0]
    && crudo.photos && 'piece_idx' in crudo.photos[0]);
  revisar('el cajón data también (quantity_label, no quantityLabel)',
    crudo && crudo.data && 'quantity_label' in crudo.data && !('quantityLabel' in crudo.data));

  /* 4. Borrar: el negocio de prueba queda como estaba. */
  const borradas = await motor.borrar(NS, ID);
  const despues = await motor.listar(NS);
  revisar('la borra', borradas === 1);
  revisar('el negocio de prueba queda limpio', !despues.quotes.some(q => q.id === ID));

  const fallas = pruebas.filter(p => !p.ok);
  console.log('');
  if (fallas.length) {
    console.log(`FALLA: ${fallas.length} de ${pruebas.length} — ${fallas.map(f => f.nombre).join(' · ')}`);
    return 1;
  }
  console.log(`TODO PASA: ${pruebas.length} de ${pruebas.length} — el cluster guarda, lee, sirve la foto y borra.`);
  return 0;
}

correr()
  .then(codigo => process.exit(codigo))
  .catch(err => {
    /* La cadena de conexión no se imprime NUNCA: si el error del driver la trae pegada, se tapa. */
    const limpio = String(err.message).replace(/mongodb(\+srv)?:\/\/\S+/gi, '[cadena oculta]');
    console.log('');
    console.log('FALLA: ' + limpio);
    console.log('(La cadena de conexión no se imprime nunca; revisa que el usuario, la clave y los permisos de red del cluster sean los correctos.)');
    process.exit(1);
  });
