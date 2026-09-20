# El presupuesto, en todas las líneas y en la unidad de cada oficio

El dueño, el 19/09:

> «do you know what is the field very important for all lines service?...budget "presupuesto"...is
> data key for the bussiness.. and the assistant can recommend fabric and another things according
> the budget...this field "presupuesto"...or "presupuesto por metro"...or "presupuesto por
> proyecto"...and so on.. according the line... can be useful data... for the process...»

## Qué había

El presupuesto ya existía, pero **sólo dentro del paso «Preferencias»** y con una sola lectura:
«Presupuesto por metro». De las ocho líneas, tres no tienen ese paso —tapicería arquitectónica,
mantenimiento y proyecto comercial—, así que su cliente nunca lo declaraba; y las otras cinco lo
declaraban en metros aunque su oficio se cobre por m², por pieza o por mueble. La parrilla de telas
prometía «ordenadas según el uso, estilo, gama de color y presupuesto que indicaste», y el motor de
recomendación (`recommend()`) ya lo usaba: `overBudget` marca las que se pasan del tramo.

Los tramos salen de los ajustes del cliente (`Store.settings().budgets`, los que el backoffice
edita): 100.000 / 120.000 / 140.000 / 160.000 en la semilla de demostración. El backoffice **no se
toca**: esto sólo lee esos ajustes.

## Qué queda

- **Un solo presupuesto, en el paso que todas las líneas tienen**: la fila se muda del paso de
  preferencias al de **Validación** (el mismo `#budget`, mismos tramos, mismos consumidores), que va
  justo antes de la recomendación de telas y de la estimación.
- **La unidad la pone el oficio**, según el `pricing` de la línea:

  | `pricing` | se pregunta | unidad | ejemplo |
  |---|---|---|---|
  | `tela` | ¿Cuál es tu presupuesto por metro de tela? | por metro de tela | suministro, retapizado, cambio de tela, reparación |
  | `m2` | ¿Cuál es tu presupuesto por metro cuadrado? | por metro cuadrado | tapicería arquitectónica |
  | `pieza` | ¿Cuál es tu presupuesto por pieza? | por pieza | mantenimiento |
  | `fabricacion` | ¿Cuál es tu presupuesto por mueble? | por mueble | muebles a la medida |
  | `unidad` | ¿Cuál es tu presupuesto por proyecto? | por proyecto | proyecto comercial |

- **Viaja a todas partes**: el resumen declarado («Presupuesto»), el contexto del asistente
  (`budget: {amount, unit, unitLabel, declared}`), la revisión (fila «Presupuesto», sin bloquear) y
  la solicitud guardada. El tramo abierto («Más de $X») se declara como **sin tope**: no marca nada
  sobre presupuesto y la fila lo dice con esas palabras.
- **La estimación lo contrasta**: el paso de la estimación gana una línea que traduce el tramo a
  total con la cantidad del proyecto (metros, m², piezas) y dice si la estimación queda dentro o por
  encima del presupuesto declarado.
- **El reset de línea** devuelve el presupuesto a su tramo por defecto, como todo lo demás del
  proyecto (docs/cambio-de-linea.md).

## Cómo se comprueba

`tests/presupuesto.spec.mjs`:

1. con cada una de las ocho líneas, la fila aparece en Validación con su pregunta y su unidad;
2. el resumen, el contexto y la revisión lo llevan con la unidad de la línea;
3. el tramo abierto se declara «sin tope» y no marca telas sobre presupuesto;
4. con un tramo corto, `recommend()` marca «Por encima del presupuesto» (ya existía) y con la
   estimación se lee «dentro» o «por encima»;
5. cambiar de línea lo devuelve a su tramo por defecto.

Y `tests/entities.spec.mjs` sigue fijando los tramos que publica el backoffice: el campo no cambia
de forma, sólo de sitio y de unidad.
