# Retapizado: el mismo recorrido del mueble, con trabajo

Decisión del dueño (20/09): «retapizado es lo mismo del otro lado de *mi mueble o proyecto
personal*… solo que se le añade **mano de obra** e **insumos**». Y en la misma conversación:

- **«Insumos» tiene su propio paso.**
- **«Mano de obra» va en el resumen** —no se pregunta— y **se configura en el backoffice**, en
  función de **los metros de tela y el mueble**.
- **«Insumos» también se configura en el backoffice.**

## El problema, medido

`shared/service-lines.json` declaraba la mano de obra como **porcentaje del material**:
`retapizado` 60 %, `cambio-de-tela` 45 %, `reparacion` 60 % (`store.js:647-667`; el desglose la pinta
como «Mano de obra (≈ 60 %)», `store.js:773`). Hoy `retapizado` cotiza por **tabla** y la línea
`cambio-de-tela` se retiró (20/09: "solo la cubierta" es retapizado sin insumos marcados; cobraba el
45 % de la tela, que es el precio equivocado). `reparacion` conserva su 60 %.

Consecuencia: **el mismo sofá cuesta ≈ 400.000 más o menos según la tela** (21,5 m de Velvet Siena
≈ 1.535.100 contra la misma cantidad de Lino Verona ≈ 1.148.100). El trabajo del taller no cambió
nada; el precio del insumo sí. Y no existe ningún lado donde el taller escriba lo que le cuesta
tapizar un sofá.

## El modelo

**Un solo recorrido de mueble.** El de «Mi mueble o proyecto personal» ya está: tipo → fotos →
medidas → preferencias → validación → recomendación. Retapizado **no estrena flujo**: es el mismo,
con otro precio. Sigue siendo su propia línea del catálogo (así el negocio la habilita aparte y con
su plan mínimo), hermana de aquella.

Lo que la línea declara de más es **qué suma**:

```json
{ "id": "retapizado", "label": "Retapizado de muebles", "journey": "existente",
  "pricing": "tela",
  "labor": { "mode": "tabla", "perMeter": 9500,
             "porMueble": { "Sofá": 180000, "Sillón": 120000, "Silla": 45000 } },
  "asks": ["insumos"],
  "insumos": [ { "id": "espuma", "label": "Espuma", "unit": "m²", "cop": 38000,
                 "hint": "Asiento y espaldar; se cambia cuando el relleno cedió." } ] }
```

- `labor.mode`: **`pct`** (lo de hoy — `reparacion` lo conserva: la regla del
  repo es sumar al selector, no reemplazarlo) o **`tabla`** (mueble + metros, lo que pide el dueño).
- La mano de obra se **calcula**, no se pregunta: `porMueble[mueble] + perMeter × metros de tela`
  (redondeo a la décima, igual que el resto del motor).
- `asks: ["insumos"]`: el mismo selector que ya usa `reparacion` con `"danos"` — la línea decide si
  su recorrido pregunta insumos.
- Los valores de arriba son **DEMO declarado** (`demo: true` + `nota`, como `shared/presets.json`):
  el taller los edita en el backoffice y el catálogo no inventa precios de ningún cliente.

## El paso nuevo: Insumos

- Vive entre **Medidas** y **Preferencias** del recorrido del mueble (después de saber el mueble y
  su tamaño, antes de elegir la tela). Sólo existe si la línea lo pide.
- Una fila por insumo del catálogo: **casilla + cantidad + unidad** (m², m, caja, rollo). Vacío =
  no se cambia.
- Sólo aparece en líneas de trabajo (`asks: ["insumos"]`); Suministro de tela no lo ve.
- En el paso de la lista se suman a la solicitud como los daños: **congelados** con su precio del
  día (`state.insumos`), para que una solicitud vieja siga diciendo lo que se le mostró.

## El resumen

El desglose del paso de la estimación queda con las líneas del trabajo, en este orden:

```
Material          tela: metros × precio            (lo de siempre)
Mano de obra      por pieza + por metro            («Mano de obra (Sofá · 21,5 m)»)
Insumos           lo marcado, con su unidad        («Espuma 3 m² · Grapas 1 caja»)
Reparaciones      los daños marcados               (sólo con asks: ["danos"])
```

Sin tocar el caso de las líneas que hoy usan `pct`: ahí la línea sigue diciendo «Mano de obra
(≈ 60 %)». **Compatibilidad primero**: los números que Macizo ve hoy no se mueven.

## Backoffice

En el modal de la línea: `labor.mode` (porcentaje / tabla), la tabla **por mueble** (una fila por
tipo del catálogo de la línea) y el **precio por metro**, más la lista de **insumos** (id, etiqueta,
unidad, costo). Los valores DEMO entran declarados como demo.

## Lo que NO cambia

- Suministro de tela: sólo material (`laborPct: 0`), sin insumos, sin paso nuevo.
- Retapizado sigue cotizando **sobre el mueble del cliente** (mismo recorrido, mismas fotos).
- El lote y la continuidad del color siguen sin fingirse: los confirma un asesor.
