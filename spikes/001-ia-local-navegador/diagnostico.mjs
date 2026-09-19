/* Diagnóstico: qué cuota tiene la sesión, si el modelo se descargó, y cuánto entra. */
import { chromium } from 'playwright';
const URL = process.env.SPIKE_URL || 'http://127.0.0.1:4173/';
const b = await chromium.launch(); const p = await b.newPage();
p.setDefaultTimeout(300000);
await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(400);
const r = await p.evaluate(async () => {
  const A = globalThis.LanguageModel;
  const out = { availability: await A.availability().catch(e => 'err:' + e.message) };
  try { out.params = await A.params(); } catch (e) { out.params = 'err:' + e.message; }
  try {
    const s = await A.create();
    out.sesionVacia = true;
    out.inputQuota = s.inputQuota; out.inputUsage = s.inputUsage;
    const t0 = Date.now();
    out.respuestaCorta = String(await s.prompt('Di solo: listo')).trim();
    out.ms = Date.now() - t0;
  } catch (e) { out.errSesionVacia = String(e).slice(0, 200); }
  try {
    const s2 = await A.create({ initialPrompts: [{ role: 'system', content: 'Responde en una frase.' }] });
    out.conSistemaChico = String(await s2.prompt('Di hola')).trim().slice(0, 80);
  } catch (e) { out.errSistemaChico = String(e).slice(0, 200); }
  return out;
});
console.log(JSON.stringify(r, null, 1)); await b.close();
