# ACI · La capa de conocimiento por motivo (contrato, PARKEADO)

**Estado: no implementado, a propósito.** Este documento fija el contrato de lo que sería la capa de
conocimiento de Lía por línea de servicio, y por qué no se escribe todavía. El prototipo no tiene
ningún mecanismo que cargue o ejecute estos archivos: Lía sigue siendo simulada
(`src/assistant/brain.js` es su contrato, y las respuestas del chat lo dicen). Crear hoy dieciséis
`SKILL.md` que nada consume produce deuda, no arquitectura — se decide cuando haya quien los lea.

## Lo que existiría (cuando se decida)

```
services/
  <serviceId>/                 ← el mismo id estable del catálogo (shared/service-lines.json → lines[].id)
    qualification/SKILL.md     ← qué debe averiguar de un cliente interesado en ESTE motivo
    expert/SKILL.md            ← qué sabe del motivo: vocabulario, opciones, criterios, límites
```

El par vive **dentro** de la carpeta del motivo, no en dos árboles separados: separarlos es la forma
segura de actualizar uno y olvidar el otro.

## Qué debe contener cada uno

`qualification` — el contrato de la conversación de interés, no las preguntas: qué señales indican
interés real en **este** motivo, qué preguntas son legítimas, qué desvía a otro motivo y cómo se
dice, qué falta para pasar a estimación o a un humano, y cuál es la siguiente acción. **Las preguntas
concretas siguen viviendo en el catálogo** (`asks`/`skips`/`pricing` de cada línea): una segunda
copia drifta, y ya limpiarnos ese tipo de deriva costó tres pasadas de auditoría.

`expert` — el conocimiento validado del motivo para explicar, recomendar y responder: vocabulario,
opciones y materiales, restricciones técnicas, criterios de recomendación, entradas del cálculo,
preguntas frecuentes, **límites** (lo que no se puede prometer) y cuándo hace falta validación
humana. Igual que arriba: apunta a `docs/journeys.md`, `docs/paquetes-y-precios.md` y el catálogo en
vez de recopiarlos.

## Reglas de frontera (no negociables cuando se implemente)

1. **Una sola verdad operativa.** Preguntas, saltos, precios y copia del cliente: el catálogo
   (`shared/service-lines.json`). Capacidades y restricciones del chat: `src/assistant/brain.js`
   (`ACTION_TYPES`, `NEVER_SETTABLE`). Los skills referencian, no redefinen.
2. **Nada inventado.** Lo que no esté validado se marca «por confirmar» (como `docs/journeys.md` §8).
   La regla 10 del repo aplica igual: un precio es del dueño o está citado.
3. **Sin router en lenguaje natural.** Hoy el router es el paso 0 (la línea que elige el cliente) más
   `Store.servicesEnabled()`. Un router por intención exige decidir antes si Lía usa un modelo real
   —hoy el prototipo dice que no— y un relato honesto de simulación para la demo.
4. **Los límites del `expert` se copian de la realidad del motor**, no de la intención: la estimación
   es preliminar, el IVA es de la factura, y lo que el motor no valora (hoy: relleno/espuma y
   transporte) no se promete.

## Qué haría falta para activar esto

1. Un mecanismo que cargue y ejecute los skills (o un modelo real detrás del chat).
2. Que las reglas de negocio que faltan estén validadas (`docs/onboarding-precios.md`: la entrevista).
3. Tests que los consuman: sin un consumidor, no hay nada que probar — y sin prueba, es prosa.

## Mientras tanto

La evaluación de cada línea **desde el lado del cliente** se hace con skills de Hermes, fuera del
repo y de su código: hoy existen `retapizado-evaluacion` (personas, señales, objeciones, recorridos,
promesas prohibidas, criterios) y `retapizado-experto` (el conocimiento validado para juzgar
respuestas y cifras). Son la plantilla a replicar por motivo; se crean de a una, validando la
estructura antes de multiplicarla. Su mitad mecánica ya vive en el repo y corre con el resto de la
suite: `npm run test:evaluacion-retapizado` (`tests/evaluacion-retapizado.spec.mjs`) recorre el motivo
con formas de persona distintas e imprime el informe; el juicio lo pone quien evalúa.
