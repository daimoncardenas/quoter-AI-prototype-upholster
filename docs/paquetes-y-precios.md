# Paquetes y precios — el modelo v2 (reemplaza a «Planes → líneas»)

> **Estado:** **primera entrega implementada** (dueño: «ok» el 18 de septiembre). En el código:
> `shared/presets.json` (Core + paquetes + precio por servicio), `Store.myAci()` y
> `Store.setLines()`, y la pantalla **«Armar mi ACI»** en `admin.html` → Configuraciones de
> cotizador. El plan **dejó de ser la puerta** (`Store.services()` ya no bloquea por plan; solo
> queda el candado del negocio y el mínimo de una línea). Las tres decisiones de §8 se resolvieron
> con mi recomendación y son cambiables en una línea de `shared/presets.json`: nombres nuevos para
> el cliente, precios demo rotulados, capacidad fuera de esta entrega. **Pendiente declarado:** sus
> tests (el invariante de `wiring.spec.mjs` «marcada ⇔ dentro del plan» quedó obsoleto con v2 y hay
> que cambiarlo a «marcada ⇔ habilitada») y el párrafo en `CLAUDE.md`.

## 1. Qué cambia, en palabras del dueño

> «we need change the focus of prices and plans... currently we have plans and package... but now
> the approach is only packages... the user can choose and build his own package... according his
> own necessities.. ... can be with checkbox... but at the same time we should have a button with
> packages recommended default»

O sea: **el cliente arma su ACI**, y los planes dejan de ser el producto. Tres planes fijos se
convierten en **paquetes recomendados** (un clic los marca) y el resto se elige con casillas.

## 2. El modelo

```
ACI CORE  (obligatorio, no se elige)
   portal público de cotización · backoffice · clientes · motor de cotización
        │
        ├── SERVICIOS     las 8 líneas del catálogo, una casilla cada una
        ├── CAPACIDADES   asistente, recomendaciones, analítica, integraciones   [v2, ver §6]
        └── CAPACIDAD     cotizaciones/mes, usuarios, sedes                      [ya existe]
```

**Servicios** es exactamente el catálogo que ya vive en `shared/service-lines.json`: activar
«Muebles a la medida» habilita su recorrido, sus preguntas, sus medidas y sus fórmulas de
cotización — no es una bandera cosmética. **Capacidad** ya está en el producto (sedes, usuarios,
cotizaciones) y no cambia aquí. **Capacidades** (Lía, analítica, integraciones) quedan **fuera de
la primera versión** y se especifican después: son features, no líneas de cotización.

## 3. Los paquetes recomendados (v1) y la migración

Un botón por paquete; al pulsarlo se marcan sus casillas y el cliente puede desmarcar lo que no
quiera. La matriz actual **no se pierde**: cada preset es hoy un plan.

| Paquete (botón)         | Nombre interno hoy      | Líneas |
|-------------------------|-------------------------|--------|
| Taller                  | Essential               | 2      |
| Empresa de muebles      | Professional            | 5      |
| Distribuidor            | Business                | 8      |
| **Armar mi ACI**        | (sin equivalente)       | a gusto |

Los nombres y los precios de arriba salen del texto que me pasaste
(`Taller pequeño desde $299.000`, `Empresa de muebles desde $699.000`, `Distribuidor desde $1.2M`,
`Core ACI $199.000`) y **están marcados como demo**: un número que describe realidad (un precio de
venta) sale de ti o va rotulado como inventado. La composición de ejemplo del texto —Retapizado
+$80.000, Suministro +$50.000, Lía +$120.000— es el formato del precio, no una tarifa aprobada.

**El nombre del paquete es el nombre del plan en pantalla** (`Store.planLabel()`, una sola fuente en
`shared/presets.json`): las tarjetas de Planes, Usage, las notas de plan bloqueado y la nota del paso
de la línea dicen Taller / Empresa de muebles / Distribuidor. El nombre interno
(Essential/Professional/Business) queda como dato y no se dibuja.

## 4. La aceptación (coherencia, medida)

1. Marcar una casilla **agrega** el servicio al primer paso del cotizador; desmarcarla lo **quita**
   (invariante que ya existe: la coherencia es lo que se evalúa, no el cliente).
2. Un botón de paquete deja sus líneas marcadas y el total recompuesto en el mismo clic.
3. El total se recalcula en vivo con cada casilla (Core + servicios + capacidad).
4. Nunca cero servicios: apagar el último se rechaza con el mismo mensaje de hoy
   («Debe quedar al menos una línea habilitada.»).
5. Se mide con la matriz de siempre: por paquete, cuántas líneas quedan habilitadas, si existe el
   paso de la línea, cuántas filas y si hay scroll — en los tres paquetes de marca.

## 5. Lo que NO cambia

- El catálogo es del producto (`shared/service-lines.json`), no del paquete de marca.
- El paquete de marca no declara líneas: sigue aportando solo marca, correo y namespaces.
- El negocio prende y apaga sus líneas (`settings.disabledLines`, solo lo apagado se guarda).
- El asistente, los pasos y los precios por motivo: intactos.

## 6. Fuera de esta primera versión (se dice, no se disimula)

- **Capacidades** (asistente, recomendaciones IA, analítica, integraciones): son features de la
  app, no del catálogo de servicios. Entran cuando definas su lista y su precio.
- **Cobro real** de la composición: hoy el flujo simulado de Bold es de CARDYRAM, no del cliente.
- `minPlan` en el catálogo: con el modelo de casillas pierde su función de candado. En la
  implementación se retira de la puerta y pasa a vivir en los presets (qué líneas trae cada uno).
- La pantalla «Mi ACI» con el formato *Activas / Disponibles [+ Añadir]* del texto: es la
  evolución de la pestaña de plan; se hace cuando el modelo de casillas esté aprobado y verde.

## 7. Dónde vive cada cosa (corregido con el dueño: comprar ≠ configurar)

Su distinción, textual: «this section is for configuration ... that is where the user can enable or
disable ... the purchase is in upgrade section». Así que las dos pantallas se reparten:

- **Upgrade → Mi ACI** (pestaña nueva, por defecto): el mercado. Core fijo, los tres paquetes
  recomendados como atajo (cada uno con su precio compuesto) y cada servicio con su casilla y su
  precio, cerrando con **«Tu ACI $x / mes»**. Aquí se contrata.
- **Configuraciones de cotizador → Líneas de servicio**: el conmutador operativo del negocio —
  prender y apagar lo que presta HOY, sin precios, con el aviso de que contratar se hace en
  Upgrade → Mi ACI.

Las dos escriben el MISMO estado (`settings.disabledLines`), así que coinciden: marcar un paquete
en Upgrade se ve al instante en Configuraciones y en el primer paso del cotizador (medido:
«Empresa de muebles» ⇒ 5 líneas marcadas en las dos pantallas y 5 tarjetas en el paso 1).

Pendiente de su texto que aún NO está: las pestañas **Consumo** y **Facturación** reorganizadas
bajo «Mi ACI» (hoy Paquetes y Facturación siguen como estaban) y la sección de **Capacidades**
(Lía, recomendaciones, analítica, integraciones), que es feature y necesita su propia lista y su
propio precio.

**Tests:** en `wiring.spec.mjs` (la capa que une backoffice y cotizador) — marcar/desmarcar agrega y
quita la línea en el paso 1; el botón de paquete marca exactamente sus líneas; el total cuadra con
las casillas; y el rechazo de la última línea. Más la matriz medida por paquete.

## 9. Auditoría: qué prometen los planes y qué falta en «Mi ACI» (antes de borrar Planes)

Pedido textual: «before you delete the section plan.. look first.. what are missing for add in my
ACI». Fuente: `PLANS[]` en `admin.html` (la copia real, no la captura), que además de las listas
lleva un `quota` por plan — `{quotes, aiCredits, storageGB, users, locations, historyMonths}` — y
es lo que hoy diferencia de verdad a Essential / Professional / Business.

| Lo que promete el plan                          | Dónde va en v2        | En «Mi ACI» hoy |
|-------------------------------------------------|-----------------------|-----------------|
| 2 / varias categorías de servicio               | Servicios             | ✓ (las 8 líneas con casilla) |
| 30 / 90 / 300 cotizaciones al mes               | Capacidad (cuota del paquete) | ✗ vive en las tarjetas de plan |
| 75 / 300 / 1.000 créditos de IA al mes          | Capacidad             | ✗ |
| 1 / 5 / 15 GB de almacenamiento                 | Capacidad             | ✗ |
| 1 / 3 / 10 usuarios internos                    | Capacidad             | ✗ |
| 1 / 3 / 10 sedes                                | Capacidad             | ✗ |
| 3 / 12 meses de historial de analítica          | Capacidad             | ✗ |
| Analítica: básica · embudo · por sede/vendedor  | Capacidad (feature)   | ✗ la app la tiene (Resumen, Usage, reportes) y no se vende |
| Asignación de vendedores · reglas avanzadas      | Capacidad (feature)   | ✗ la app la tiene (`autoAssignByZone`, vendedores y zonas) |
| Validación y recomendaciones asistidas por IA    | Capacidad (feature)   | ✗ la app la tiene (paso de validación + `aiCreditsUsed`) |
| Dominio propio o subdominio del cliente          | Capacidad             | ✗ no existe en la app: es hosting |
| Sin mención de CARDYRAM (white-label)            | Capacidad             | ✗ palanca comercial, no código |
| Varias plantillas de cotización                  | Capacidad             | ✗ hoy hay una |
| Exportación CSV de clientes y cotizaciones       | Capacidad             | ✗ no existe en la app |
| Acceso a integraciones estandarizadas            | Capacidad             | ✗ no existen (hay `UPGRADE_NOTE` con los costos de terceros) |
| Soporte: correo · con prioridad · prioritario    | Capacidad (servicio)  | ✗ acuerdo comercial |
| Portal, marca, tipos de mueble, fotos, fórmulas, contacto, PDF, enlace de aceptación, estados, notificaciones, actualizaciones | Core | ✓ es lo que el ACI Core ya dice |

**Conclusión:** los SERVICIOS ya están; lo que falta antes de retirar Planes es (1) **la cuota dentro
de cada paquete** — el dato ya existe en `PLANS[].quota` y es lo que hace que Taller / Empresa /
Distribuidor signifiquen algo más que «cuántos oficios»; (2) el bloque de **Capacidades** con su
precio (las que la app ya tiene se venden; las que no existen —dominio, CSV, integraciones,
soporte— se marcan como tales, no se inventan); y (3) el detalle comercial del `+` frente a la
cuota: el paquete trae una cuota mensual y los paquetes de capacidad (25 cotizaciones, 100 créditos,
5 GB, usuario, sede) se suman ENCIMA.

No se borra la pestaña Planes hasta que (1) y (2) estén en Mi ACI: hoy esas tarjetas son el único
lugar donde vive la cuota.

## 10. Resuelto (esta sesión)

1. **Nombres**: Taller / Empresa de muebles / Distribuidor son los que se ven —el nombre del
   paquete— en las tarjetas de Planes, Usage y las notas de plan bloqueado; los nombres
   Essential / Professional / Business quedan solo como identificador interno de la cuota
   (`settings.plan`, `PLANS[].name`, `PLAN_ORDER`).
2. **Precios**: los tuyos donde los diste (Core $199.000; suministro, retapizado, arquitectónica,
   asignación, analítica, asistentes adicionales) + investigados con fuente donde hacían falta
   (interacciones de IA, soporte), y los provisionales marcados en `shared/presets.json`.
3. **La pantalla de Consumo** entró en esta entrega; los paquetes de capacidad se siguen comprando
   en Paquetes.

### 10.1 La suma cuadra con el precio del mes (resuelto)

Manda el precio POR MES (tu decisión del 18 de septiembre): la composición —`Core + servicios +
capacidades`— suma EXACTO lo que se paga cada mes, y el precio del contrato de arrendamiento a 12
meses es más bajo y se muestra aparte (el mismo plan, con el compromiso de un año). Las cifras viven
una sola vez en `shared/presets.json` (`presets[].price` para el mes, `presets[].priceYearly` para el
contrato) y `Store.planPrice()` las sirve a las dos pantallas.

| Paquete | Mes a mes (lo que suma la composición) | Con contrato de 12 meses | La suma, parte por parte |
|---|---|---|---|
| Taller | $399.000 / mes | $299.000 / mes | 299.000 + 100.000 |
| Empresa de muebles | $899.000 / mes | $699.000 / mes | 299.000 + 415.000 + 185.000 |
| Distribuidor | $1.490.000 / mes | $1.290.000 / mes | 299.000 + 685.000 + 506.000 |

La base es el **ACI Core, 299.000** (antes 199.000, por tu instrucción del 18 de septiembre): es lo que
todo paquete incluye y de ahí para arriba suma cada uno. Lo que se movió además para que cuadrara
(detalle y provenance en `pricingNota` del catálogo): suministro 50.000 (tu cifra, sin tocar),
retapizado 80→50, cambio de tela 70→75, reparación 95→100, a la medida 130→140, proyecto comercial
120→100, mantenimiento 85→70, marca blanca 45→25, plantillas 25→20, CSV 20→15, asistentes
adicionales 100→96. Intactos de tu texto: arquitectónica 100.000, asignación 60.000, analítica
80.000; investigados con fuente: soporte 190.000 y dominio 20.000.

El total de «Configurar mi plan» es esa suma y lo dice con sus palabras: «Precio del paquete «Taller»
· mes a mes, sin contrato · con contrato de arrendamiento a 12 meses $299.000». `tests/wiring.spec.mjs`
sostiene la igualdad: si alguien mueve una cifra del catálogo, el test lo dice antes de que las dos
cuentas se separen.

## 11. Vocabulario (el del dueño)

- **Taller / Empresa de muebles / Distribuidor** — los nombres que se ven de los planes (son los del
  paquete; `Store.planLabel()`). Essential / Professional / Business no se dibujan: son el dato.
- **Consumo** — la cuota del paquete (cotizaciones, interacciones de IA, GB, usuarios, sedes).
- **Capacidades** — el producto que se contrata, cada una con su valor.
- **Configurar mi plan** — la pantalla (antes «Mi ACI»), con su botón Guardar configuración.
- **Plan a la medida** — la tarjeta que aparece en Planes con el botón Pagar (factura + Bold
  simulado, el mismo flujo que los planes del catálogo).
- **Interacciones de IA** — jamás «créditos»: la IA se cobra por interacciones (cuota del paquete),
  no como checkbox del marketplace.
- **Soporte en dos niveles**: el correo del Core (incluido para todos) y el prioritario (capacidad
  de pago, hoy solo en Distribuidor).

## 12. La regla de los precios

Un precio o es del dueño o está investigado con fuente citada en el archivo; los provisionales se
marcan como tales ahí mismo. No se ajusta a ojo, no se retira la fila que molesta y no se inventa un
ancla para justificar un número. (CLAUDE.md, regla 10.)

## 13. IVA (19%)

Los precios del catálogo son **antes de IVA** y las pantallas lo dicen («+ IVA» pegado a la cifra en
las tarjetas de Planes, en la tarjeta a la medida, en las confirmaciones y en todo «Configurar mi
plan»). La **factura lo suma**: `Store.IVA_RATE` (0.19) y `Store.invoiceTotals(inv)` →
`{value, iva, total}`, el único sitio donde se calcula, así que la tabla de Facturación y el modal de
pago no pueden dar números distintos — la tabla muestra el total con su desglose («valor $ 399.000 +
IVA $ 75.810») y el modal, el total grande con la línea del desglose.

El `amount` GUARDADO en la factura sigue siendo el valor del catálogo (lo que sale de
`PLANS`/`PACKAGES`, nunca algo tecleado): el IVA y el total son derivados. Si mañana el IVA cambia,
cambia en una constante y todas las facturas —viejas incluidas, que no guardan el suyo— lo reflejan;
si debe congelarse por factura, es un campo más en el registro.

## 14. La estimación que vio el cliente viaja con la solicitud

`Store.lineQuote()` (por oficio: material + mano de obra + daños, piezas, m², unidades o
fabricación) es el número que pintan el paso de recomendación y el resumen. Hasta ahora la
solicitud guardaba solo `price` (metros × precio de tela) — o `null` cuando el oficio no lleva
tela — así que en 7 de las 8 líneas lo guardado no era lo que se le mostró al cliente. Ahora la
solicitud guarda además `estimate`: el desglose (`parts`), el `total`, el oficio (`kind`),
`calculatedAt`, `engineVersion` y las `inputs` normalizadas que lo produjeron (mueble, cantidad,
rango de material, tela por m², daños, respuestas de los pasos y filas del BOQ).

Es un **snapshot**, no una receta para recalcular: el catálogo, las tarifas y las fórmulas cambian,
y una solicitud vieja tiene que seguir diciendo exactamente lo que se le prometió al cliente. Por
eso el backoffice pinta el número guardado — nunca uno recalculado — y cae al rango de tela cuando
la solicitud es anterior a este campo (`quote.estimate?.total ?? quote.price ?? null`).
`ESTIMATE_ENGINE_VERSION` (index.html) marca con qué motor se congeló: súbelo al cambiar una
fórmula, no al cambiar un precio (los precios ya van dentro del snapshot).
