/* EL NÚCLEO DEL WIZARD (src/wizard/core.js) — el tramo barato del «headless wizard».
 *
 * El dueño trajo la crítica de su revisor (26/09) y la firmó: el wizard no debería ser un HTML del
 * que la conversación infiere la estructura, sino un núcleo con estado, revisión y órdenes —y el HTML,
 * la validación y Lía, tres bocas del MISMO objeto—. Esto es la primera rebanada, la que se paga sola:
 *
 *   1) `revision`: un número que sube con CADA escritura —mano, teclado, chat, voz—. Una propuesta que
 *      llega con la revisión vieja se rechaza (`STALE_STATE`): es la respuesta lenta del modelo que
 *      pretendía pisar lo que el cliente acababa de escribir.
 *   2) `apply()` con ACK REAL: no se dice que algo quedó guardado porque una frase lo dijera; se dice
 *      porque el que escribe contesta. (Dueño, 26/09: el recibo salía de un barrido que probaba la
 *      frase contra todos los campos hasta que uno la aceptara; con ACK esa clase se muere.)
 *   3) `advance()` con autoridad: el que decide si un paso se puede pasar es el núcleo, no el botón ni
 *      el caminador. `STEP_INCOMPLETE` con la lista de lo que falta.
 *
 * El núcleo NO toca el DOM: eso es del adaptador, que se le enchufa con `conectar()` —así el día que
 * el HTML cambie de forma (un `<select>` que sea `<div role="combobox">`), el cerebro no se entera.
 * El adaptador de esta página se registra desde index.html; `describe()` es lo que Lía lee.
 */
(function () {
  let revision = 1;                     // sube con cada escritura real
  let puerto = null;                    // { leer, escribir, avanzar } — lo pone la página
  const bitacora = [];                  // las últimas escrituras, con quién y con qué revisión

  const ahora = () => Date.now();
  const sube = (quien, detalle) => {
    revision += 1;
    bitacora.push({ revision, quien, detalle: detalle || null, cuando: ahora() });
    if (bitacora.length > 80) bitacora.shift();
    return revision;
  };

  function conectar(p) {
    puerto = p || null;
    return { ok: true, revision };
  }

  /* Lo que el núcleo SABE del paso de delante: lo que Lía lee en vez de mirar la pantalla. */
  function describe() {
    if (!puerto || typeof puerto.leer !== 'function') return { ok: false, reason: 'SIN_PUERTO', revision };
    const p = puerto.leer() || {};
    const campos = (p.campos || []).map(c => ({
      path: c.id, question: c.etiqueta || c.pregunta || c.id,
      value: (c.valor != null ? c.valor : null), required: true, valid: !!c.lleno,
      options: c.opciones || []
    }));
    const pendiente = campos.filter(f => f.required && !f.valid)[0] || null;
    return { ok: true, stepId: p.etiqueta || null, step: (typeof p.paso === 'number' ? p.paso : null),
      revision, stepRevision: p.revision || null, fields: campos,
      complete: !pendiente, nextMissing: pendiente ? pendiente.path : null };
  }

  /* Escribir: con ACK. `expectedRevision` es la foto que el que propone tenía delante; si el estado
   * ya cambió, no se pisa y se dice por qué. */
  async function apply(orden) {
    const o = orden || {};
    if (!puerto || typeof puerto.escribir !== 'function') return { ok: false, reason: 'SIN_PUERTO', revision };
    if (o.expectedRevision != null && Number(o.expectedRevision) !== revision) {
      bitacora.push({ revision, quien: (o.source || '?'), detalle: { rechazado: o.path, esperaba: o.expectedRevision }, cuando: ahora() });
      return { ok: false, reason: 'STALE_STATE', currentRevision: revision, expectedRevision: o.expectedRevision };
    }
    const r = await puerto.escribir(o.path, o.value, o.texto).catch(e => ({ ok: false, motivo: String(e && e.message || e) }));
    if (!r || !r.ok) return { ok: false, reason: 'NO_ENTRO', motivo: (r && r.motivo) || null, revision };
    const nueva = sube(o.source || 'desconocido', { path: o.path, value: o.value });
    const d = describe();
    return { ok: true, revision: nueva, applied: { path: o.path, value: o.value, dicho: (r.dicho != null ? r.dicho : null) },
      aviso: r.aviso || null, currentStep: { complete: !!d.complete, nextMissing: d.nextMissing || null },
      pendiente: d.nextMissing || null };
  }

  /* Pasar de paso: lo decide el núcleo, con los campos leídos del adaptador. */
  async function advance(orden) {
    const o = orden || {};
    if (o.expectedRevision != null && Number(o.expectedRevision) !== revision) {
      return { ok: false, reason: 'STALE_STATE', currentRevision: revision, expectedRevision: o.expectedRevision };
    }
    const d = describe();
    if (!d.ok) return { ok: false, reason: d.reason || 'SIN_PUERTO', revision };
    const faltan = (d.fields || []).filter(f => f.required && !f.valid).map(f => f.path);
    if (faltan.length) return { ok: false, reason: 'STEP_INCOMPLETE', missing: faltan, revision };
    if (!puerto || typeof puerto.avanzar !== 'function') return { ok: false, reason: 'SIN_PUERTO', revision };
    const r = await Promise.resolve(puerto.avanzar(o.destino)).catch(() => ({ ok: false }));
    if (r && r.ok === false) return { ok: false, reason: r.reason || 'NO_AVANZO', revision };
    const nueva = sube('avance', { destino: (o.destino != null ? o.destino : null) });
    return { ok: true, revision: nueva, step: (r && r.step != null ? r.step : null) };
  }

  /* La mano y el teclado también cambian el estado: suben la revisión para que una propuesta vieja
   * no pise lo que el cliente acaba de escribir. */
  const oido = (quien, detalle) => sube(quien || 'mano', detalle);

  window.WizardCore = { conectar, describe, apply, advance, oido,
    revision: () => revision, bitacora: () => bitacora.slice(-20) };
})();
