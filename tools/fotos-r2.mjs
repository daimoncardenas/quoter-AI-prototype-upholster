/* LAS FOTOS EN CLOUDFLARE R2 — almacén de objetos (S3), con subida firmada.
 *
 * El camino es el de producción: el navegador NO manda los bytes a nuestra función.
 *
 *   1. el navegador pide las firmas      POST /api/photos/firmas
 *   2. la función firma una URL corta    (un solo objeto, PUT, 10 minutos)
 *   3. el navegador sube DIRECTO a R2    PUT <url firmada>
 *   4. la cotización viaja liviana       photos: [{ pieza, key, url, width, height, bytes, mime }]
 *      y Mongo guarda solo metadatos + la clave del objeto.
 *
 * Las claves las arma SIEMPRE el servidor —`photos/<ns>/<COT-####>/NN.ext`, el prefijo que el dueño
 * creó en el bucket—, nunca el navegador: una firma no puede escribir fuera de la carpeta de su
 * cotización.
 *
 * Sin R2 configurado (R2_* en .env) todo sigue como antes: el motor de casa guarda en disco, el de
 * Mongo en su GridFS, y la página manda los dataURL como ayer. Es la misma degradación que la llave
 * de DeepSeek y la cadena de Atlas: el extra nunca es un requisito.
 */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { loadDotEnv } from './env.mjs';

export const MIME_POR_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
export const EXT_PERMITIDAS = Object.keys(MIME_POR_EXT);
export const EXPIRA_FIRMA_S = 600;              // 10 minutos: subir una foto, no una sesión

export function configR2() {
  const env = loadDotEnv();
  const lee = k => String(process.env[k] || env[k] || '').trim();
  return {
    endpoint: lee('R2_ENDPOINT'),
    accessKeyId: lee('R2_ACCESS_KEY_ID'),
    secretAccessKey: lee('R2_SECRET_ACCESS_KEY'),
    bucket: lee('R2_BUCKET'),
    publicBase: lee('R2_PUBLIC_BASE').replace(/\/+$/, '')
  };
}

export function hayR2() {
  const c = configR2();
  return Boolean(c.endpoint && c.accessKeyId && c.secretAccessKey && c.bucket);
}

/* La clave de una foto: `photos/<ns>/<COT-####>/NN.ext`. El namespace solo entra si es un nombre
 * sano (letras, números, puntos y guiones): un `..` no puede salirse de su carpeta. */
const limpio = v => String(v || '').replace(/[^a-zA-Z0-9._-]/g, '');
export const claveDeFoto = (ns, id, slot, ext) =>
  `photos/${limpio(ns)}/${limpio(id)}/${String(slot).padStart(2, '0')}.${limpio(ext)}`;
/* La clave ya completa (cuando lo que se tiene es el nombre del archivo: `01.png`). */
export const claveDeArchivo = (ns, id, archivo) => `photos/${limpio(ns)}/${limpio(id)}/${limpio(archivo)}`;

export function almacenR2() {
  const cfg = configR2();
  if (!hayR2()) throw new Error('R2 sin configurar (faltan R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET)');
  const cliente = new S3Client({
    region: 'auto',
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
  });
  const urlDe = clave => (cfg.publicBase ? `${cfg.publicBase}/${clave}` : null);

  return {
    nombre: 'r2',
    bucket: cfg.bucket,
    urlDe,
    /* La firma de subida: corta, de UN objeto, y con su Content-Type amarrado (el navegador tiene que
     * mandar ese mismo encabezado o R2 rechaza el PUT). */
    async firmarSubida(clave, mime = 'application/octet-stream', segundos = EXPIRA_FIRMA_S) {
      const url = await getSignedUrl(cliente, new PutObjectCommand({ Bucket: cfg.bucket, Key: clave, ContentType: mime }), { expiresIn: segundos });
      return { clave, url, mime, segundos };
    },
    /* La subida del lado del servidor (el camino de siempre, cuando la página manda dataURL). */
    async subir(clave, buffer, mime = 'application/octet-stream') {
      await cliente.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: clave, Body: buffer, ContentType: mime }));
      return { clave, url: urlDe(clave) };
    },
    async leer(clave) {
      try {
        const r = await cliente.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: clave }));
        const buffer = Buffer.from(await r.Body.transformToByteArray());
        return { buffer, mime: r.ContentType || MIME_POR_EXT[String(clave).split('.').pop().toLowerCase()] || 'application/octet-stream' };
      } catch (err) {
        if (err && (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404)) return null;
        throw err;
      }
    },
    async llaves(prefijo) {
      const salida = [];
      let token;
      do {
        const r = await cliente.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefijo, ContinuationToken: token }));
        for (const o of r.Contents || []) salida.push(o.Key);
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token);
      return salida;
    },
    async borrarLlaves(claves) {
      const lista = (claves || []).filter(Boolean);
      let borradas = 0;
      for (let i = 0; i < lista.length; i += 500) {          // DeleteObjects acepta de a 1000; 500 deja aire
        const trozo = lista.slice(i, i + 500);
        if (!trozo.length) break;
        await cliente.send(new DeleteObjectsCommand({ Bucket: cfg.bucket, Delete: { Objects: trozo.map(k => ({ Key: k })), Quiet: true } }));
        borradas += trozo.length;
      }
      return borradas;
    }
  };
}
