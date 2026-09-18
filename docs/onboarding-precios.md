# ACI · Onboarding de precios del negocio (relleno/espuma y transporte)

Cardyram define **la estructura del cálculo**; cada taller aporta **sus valores comerciales**. Por
eso este documento no contiene ni un precio: contiene la entrevista que los obtiene y el esquema
donde van a caer. Sin esa entrevista, relleno y transporte se preguntan al cliente y **no suman** —
que es justo el hueco que la auditoría marcó (`docs/paquetes-y-precios.md` §14, `docs/journeys.md`
§10).

**Estado: no implementado.** Hoy el catálogo pregunta la firmeza del relleno (`shared/service-lines.json`
→ `asks.firmeza`) y el traslado en mantenimiento (`asks.traslado`, el único que sí se cobra, y solo
en el oficio `pieza`), y nada de eso cambia el precio de los oficios `tela` ni de `fabricacion`.
Este documento es la entrada de esa implementación; no la reemplaza.

## 1. La entrevista (45–60 min, con 5–10 cotizaciones reales encima de la mesa)

Se pide al taller **lo que ya cobró**, no lo que cree que cobraría: las últimas cotizaciones
cerradas de los últimos tres meses, buscando variedad (silla, sofá, mueble grande, un proyecto
pequeño, una limpieza). Cada respuesta se anota con la cotización de la que sale.

| # | Pregunta | Qué anotar | Dónde cae |
|---|----------|------------|-----------|
| 1 | ¿Qué espuma compra y a quién? | Proveedor, presentación (plancha de X×Y cm, bloque, rollo), precio y unidad | valores (`materialCop…`) |
| 2 | ¿Qué densidades usa y para qué firmeza? | blanda/media/firme → densidad o SKU | estructura + valores |
| 3 | ¿Por componente? | asiento, espalda, brazos, cojines sueltos: espesor y si lleva refuerzo | estructura (`components`) |
| 4 | ¿Cómo la cobra? | por pieza, por m², por volumen o por tipo de mueble — **la forma real**, aunque no sea la más cómoda | estructura (`pricing`) |
| 5 | Merma y recortes | % que suma al material por desperdicio | valores (`wastePct`) |
| 6 | Mano de obra | ¿separada del material o embebida? ¿% o valor fijo por componente? | valores (`labor`) |
| 7 | ¿Cobra corte, pegante, grapas o herramienta? | casi nunca: confirmarlo para no inventar un rubro | estructura |
| 8 | Transporte: ¿recoge y entrega? | sí/no cada uno, y si el taller cobra el viaje de vuelta | estructura (`zones`) |
| 9 | Zonas que cobra de verdad | nombre **y valor** de cada zona (no inventar zonas plausibles) | valores (`pickupCop`/`deliveryCop`) |
| 10 | ¿Por viaje, por vehículo o por km? | la unidad real; si es negociado, decirlo en `requiresReview` | estructura |
| 11 | Escaleras sin ascensor, muebles sobredimensionados o modulares | si suman y cuánto | valores (`stairs…`, `oversized…`) |
| 12 | ¿Qué NO cobra? | rubros que el negocio no usa: para no añadirlos «por completitud» | estructura |
| 13 | ¿Qué casos pide ver siempre? | los que nunca cotiza por teléfono | `requiresReview` de la zona/componente |

**Contraste obligatorio antes de codificar**: con los valores obtenidos, recalcular 2 de esas 10
cotizaciones y comparar con lo que el taller cobró. Si la diferencia pasa de ±10 %, la regla está
mal capturada (no se «ajusta» el resultado a mano).

## 2. Dónde cae cada cosa (la costura que ya existe en el repo)

- **Estructura** — qué componentes existen, cómo se combina firmeza→densidad, qué hace falta antes
  de poder cotizar, qué casos van a revisión: es **producto** y vive en el catálogo
  (`shared/service-lines.json`, junto a `asks`/`pricingRates`) y en las plantillas. Un taller nuevo
  hereda la estructura sin tocar código.
- **Valores** — pesos, porcentajes, nombres de zona: son **del negocio** y viven en `settings`
  (backoffice → «Configuraciones de cotizador», como `disabledLines` o `budgets`). **Nunca en el
  pack**: los packs son marca (`README.md` §«Agregar un cliente nuevo», `CLAUDE.md` §pack contract,
  «— (no `seed.json`)»).

## 3. Esquema provisional (no codificar hasta que la entrevista lo valide)

Los `null` son deliberados: son el hueco que hay que llenar antes de cobrar. `null` **no** es 0.

```json
{
  "foamRules": {
    "enabled": false,
    "pricing": "pieza",
    "firmness": {
      "blanda": { "density": null, "materialCopPerM3": null, "sku": null },
      "media":  { "density": null, "materialCopPerM3": null, "sku": null },
      "firme":  { "density": null, "materialCopPerM3": null, "sku": null }
    },
    "components": {
      "asiento": { "thicknessCm": null, "laborCop": null, "requiresReview": false },
      "espalda": { "thicknessCm": null, "laborCop": null, "requiresReview": false },
      "brazos":  { "thicknessCm": null, "laborCop": null, "requiresReview": false },
      "cojin":   { "perUnitCop": null, "requiresReview": false }
    },
    "wastePct": null,
    "marginPct": null
  },
  "transportRules": {
    "zones": [
      { "id": "bogota-central",  "label": "Bogotá zona central",  "pickupCop": null, "deliveryCop": null },
      { "id": "bogota-extendida","label": "Bogotá zona extendida", "pickupCop": null, "deliveryCop": null },
      { "id": "fuera-de-bogota","label": "Fuera de Bogotá",        "requiresReview": true }
    ],
    "roundTripDiscountPct": null,
    "oversizedFurnitureCop": null,
    "stairsWithoutElevatorCop": null
  }
}
```

Lo que la entrevista debe decidir antes de dar esto por bueno: si el relleno se cobra por pieza,
por volumen, por componente o por tipo de mueble (campo `pricing`); si la mano de obra va separada o
embebida (`laborCop` vs. un porcentaje); si el transporte se cobra por zona, por viaje, por vehículo
o negociado; y qué casos entran por `requiresReview`.

## 4. Regla de seguridad (la misma del resto del producto)

Ningún componente entra en la estimación con su configuración incompleta. El backoffice **rechaza**
encender «Cobrar relleno» o «Cobrar transporte» con campos requeridos en `null`, y la estimación no
devuelve un **cero silencioso**: dice que falta.

```json
{
  "estimate": {
    "status": "partial",
    "parts": [
      { "id": "material",  "value": [400000, 500000] },
      { "id": "foam",      "value": null, "status": "pending_configuration" },
      { "id": "transport", "value": null, "status": "pending_confirmation" }
    ],
    "knownSubtotal": [400000, 500000],
    "total": null,
    "pending": ["foam", "transport"]
  }
}
```

Y en pantalla, en ese orden:

```
Conocido: $ 400.000 – $ 500.000
Relleno y transporte: por confirmar
Total estimado: por confirmar
```

Mientras exista un componente pendiente el total **no** se muestra como si estuviera completo: es
la diferencia entre una estimación honesta y una que dice más de lo que sabe. Esta forma convive con
el snapshot de `docs/paquetes-y-precios.md` §14 — `knownSubtotal` es lo que el cliente vio y
`pending` es lo que falta, los dos congelados con la solicitud.

## 5. Valores de demostración

Un prototipo de demostración puede necesitar un relleno y un transporte que sumen, para no mostrar
un hueco. La procedencia honesta es **una cotización real anonimizada** aportada en la entrevista, y
el preset lo dice con estas palabras:

> Valores demostrativos derivados de una cotización anonimizada de tapicería recogida el [fecha]; no
> aplicables a otros negocios.

Lo que **no** se hace: investigar un precio nacional de espuma; preguntarle al cliente final la
densidad (eso lo configura el tapicero, no el cliente); devolver 0 sin avisar; inventar una zona de
transporte que el taller no cobra.
