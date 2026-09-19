# 002 · ¿El modelo local mira de verdad la fotografía?

**Pregunta.** ¿Acepta el Chrome de este equipo la foto como entrada del modelo local (`expectedInputs` con
`image`), y qué dice cuando en la foto no hay un mueble —un documento, por ejemplo—?

**Por qué importa.** El dueño pidió ojos en el paso 4: «this step needs eyes for validation of photos... and
related with another information». La fila ya está puesta (`docs/revision-con-ojos.md`), pero en su pantalla
salió con la línea neutra después de subir fotos de **documentos**, no de muebles: o su modelo no acepta
imágenes, o su respuesta no pasó el cerco. El cotizador no puede distinguirlo por sí solo — y tampoco debe
inventarse la razón. Esta página sí: enseña la verdad del equipo, la respuesta cruda y el veredicto del cerco
real, sin wizard de por medio.

## Cómo se corre

```
node spikes/002-el-modelo-mira-la-foto/serve.mjs   →  http://127.0.0.1:4174/spikes/002-el-modelo-mira-la-foto/
node spikes/002-el-modelo-mira-la-foto/probar-pagina.mjs   →  la página se prueba sola, con modelos de mentira
```

Abrirlo con el **Chrome del equipo** (153 ✓) y **por `http://127.0.0.1`**, no como archivo: el modelo local
solo existe en contexto seguro (`file://` no lo es), la misma razón que en el spike 001.

## Qué muestra

| Sección | Qué responde |
|---|---|
| Este equipo | si hay API, si está lista, y —la pregunta de verdad— si la **sesión con imagen** se crea o se rechaza, con el mensaje del error |
| La fotografía | la foto que arrastres, con sus píxeles y su peso |
| Lo que responde el modelo | la respuesta cruda del modelo y cuántos segundos tardó, con el tamaño de la copia que se le mandó (1024 px) |
| El cerco real | el veredicto de `assistant-fence.js` sobre esa respuesta: **limpia** (se mostraría) o **no limpia**, con las cifras, promesas o el tema que la tumbaron |

Si la sesión con imagen sale **rechazada**, el modelo de ese Chrome no mira fotos: la entrada multimodal vive
detrás de su propia bandera —`chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, en Enabled, y
reiniciar el navegador— y de su propia descarga de modelo (≥22 GB libres en el volumen del perfil; ver
`chrome://on-device-internals`). Sin ella, el cotizador simplemente no pinta la fila de la mirada y el aviso
de la tarjeta lo aclara (`puedeVerLaFoto()` pregunta una vez, ver `docs/revision-con-ojos.md`).

La fila **Disponibilidad CON imagen** es la que dice qué falta: `available` (lista), `downloadable` /
`downloading` (existe para este equipo y no está bajada) o `unavailable` (esta máquina no tiene la variante).

Prueba con **las dos fotos**: la de un mueble y la de un documento. La segunda es la que enseña si el modelo
dice lo que ve —«veo un documento con texto, no un mueble»— o se calla.

## Lo que salga de aquí, va a

- `docs/revision-con-ojos.md` — el contrato de la fila del cotizador y sus tres desenlaces (la mirada, la
  línea neutra cuando el cerco la tumba, y «No pude mirar la fotografía…» cuando el modelo no puede).
- `CLAUDE.md`, la viñeta «The review has eyes, and says whose they are».
