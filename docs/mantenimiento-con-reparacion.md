# Una tarjeta: «Mantenimiento» con limpieza y reparación adentro

Dueño, 21/09: en el paso de la línea **«solo mantenimiento»**, y adentro «limpieza» y «reparación y
restauración». Hoy el paso muestra dos tarjetas sueltas: `mantenimiento` (limpieza por pieza) y
`reparacion` (tela + 60 % de mano de obra + daños).

## La forma

El paso pinta **una** tarjeta, «Mantenimiento», y al elegirla pregunta cuál de las dos
cosas es: **limpieza** (lo que hace hoy: por pieza, con las preguntas de limpieza y traslado) o
**reparación y restauración** (lo que hace su línea: tela, daños y mano de obra).

Es el mecanismo que ya usa el suministro: **una línea, dos caminos** (`_rutas`: «¿para qué?» /
«¿qué sabes?»). No se inventa nada nuevo.

## Por qué los planes no se mueven

Las dos siguen siendo **líneas de la empresa** (`servicePrices`: `reparacion` 175.000, `mantenimiento`
70.000) y siguen en los paquetes que las incluyen. Lo que cambia es **cómo se presentan** en el paso:
una tarjeta en vez de dos. Ningún precio de plan, ninguna suma y ninguna cuota se toca.

## Lo que hay que tocar

- `shared/service-lines.json`: `mantenimiento` declara sus dos caminos (limpieza = su comportamiento
  de hoy; reparación = la línea `reparacion`) y `reparacion` deja de pintar tarjeta propia.
- `index.html`: el paso de líneas pinta una tarjeta por línea con caminos; al elegirla, la pregunta
  del camino; el resto del recorrido corre con el camino elegido (como el suministro).
- Spec: la tarjeta única, las dos opciones, y que cada una lleve su recorrido (limpieza sin tela ni
  mueble; reparación con tela y daños).
