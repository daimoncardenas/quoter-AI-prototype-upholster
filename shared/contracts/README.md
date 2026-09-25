# Los contratos: el cuerpo que recibe el endpoint

Un archivo por **rama** — el camino completo del cliente por el wizard (línea → ruta → propósito →
saber). El nombre del archivo es el `branch`: lo que el endpoint recibe cuando esa rama se completa.

- `schemaVersion` — la versión de esta forma. Si un campo cambia de tipo, sube.
- `branch` — el id de la rama, igual al nombre del archivo.
- `source` — quién lo llena: `web-quoter` (el formulario o la conversación, da igual).
- `brand` — el paquete (marca blanca).
- `submittedAt` — ISO 8601 con offset.
- Los campos del caso, en `camelCase`, **solo los que esa rama pide**: la ausencia de `furniture`,
  `measurements` o `photos` ya dice de qué rama se trata.

## Convenciones

| Dato | Forma | De dónde sale el valor |
| --- | --- | --- |
| Ids de conjuntos cerrados | el id, no el rótulo | catálogo de telas (`fabricId`), puntos de servicio (`office`), muebles (`furniture.type`), el wizard (puestos, cojines, cobertura, entrega) |
| Plata | `{ "min": 1246000, "max": 1691000, "currency": "COP" }` — enteros, sin formato | el motor |
| Cantidades | número + `unit` (`m`, `m²`) | la fila del cliente |
| Rótulos libres | texto tal cual (los chips de necesidades no tienen id: son su rótulo) | el cliente |
| `null` | el dato no está fijado en el demo | — |

## Las ramas

| `branch` | Línea | Camino |
| --- | --- | --- |
| `supply.purchase.resale.knows-fabric` | Suministro de tela | compra → reventa → sé qué tela quiero |
| `supply.purchase.resale.wants-suggestions` | Suministro de tela | compra → reventa → quiero sugerencias |
| `supply.purchase.workshop.knows-both` | Suministro de tela | compra → taller → conozco tela y cuánto |
| `supply.purchase.workshop.knows-fabric` | Suministro de tela | compra → taller → conozco la tela |
| `supply.purchase.personal-project.knows-both` | Suministro de tela | compra → mueble → conozco las dos |
| `supply.purchase.personal-project.knows-amount` | Suministro de tela | compra → mueble → sé los metros |
| `supply.purchase.personal-project.knows-nothing` | Suministro de tela | compra → mueble → no sé ninguna |
| `supply.previous-order` | Suministro de tela | pedido anterior |
| `reupholstery` | Retapizado de muebles | — |
| `repair` | Reparación y restauración | — |
| `custom-made` | A la medida | — |
| `commercial-project` | Proyecto comercial | — |
| `architectural-upholstery` | Tapicería arquitectónica | — |

## Lo que no vive aquí

Los pasos del wizard y sus controles (el **espejo** que comprueba que estas dos maneras de llenar el
contrato no se separan) viven en `tests/mirror/<branch>.json`: son verificación, no contrato.

Los nombres internos del cotizador siguen en español (`linea`, `lista`, `atencion`); el mapeo campo a
campo se cierra cuando los nombres del endpoint queden definidos.
