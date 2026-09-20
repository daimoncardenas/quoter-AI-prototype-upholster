# La atención: ciudad del cliente, ciudad del servicio y sede — en el último paso

El dueño, el 20/09:

> «another think..."punto de atencion"...is another key... and this should be standard in the last
> step for all lines... with aditional data. of user "En que ciudad te encuentras"....and another
> "para que ciudad es el servicio"...and finally "cual sede eliges"»

## Qué había

«Punto de atención» (`#city`) vivía en el paso de **Preferencias** —el que tres líneas no tienen
(arquitectónica, mantenimiento, proyecto comercial)—, así que su cliente nunca elegía sede; y se
ofrecía solo, sin decir desde dónde pregunta el cliente ni para dónde es el servicio. Las opciones
salen de las sedes configuradas (`Store.activeServicePoints()`, agrupadas por ciudad), que ya traen
su ciudad: la materia prima estaba.

## Qué queda

- **Un bloque en el último paso (CONTACT, «Tu cotización · Datos de contacto»)**, que todas las
  líneas tienen, con los tres campos:
  1. **¿En qué ciudad te encuentras?** — la ciudad desde la que escribe el cliente.
  2. **¿Para qué ciudad es el servicio?** — la ciudad donde se presta.
  3. **¿Cuál sede eliges?** — el antiguo «Punto de atención» (`#city`, mismas opciones y mismos
     consumidores), ahora con nombre de sede.
- **Las ciudades salen de los datos**: las de las sedes activas del cliente, sin inventar ninguna.
  Como la lista puede no tener la ciudad del cliente, cada campo de ciudad ofrece **«Otra ciudad…»**,
  que abajo revela un campo de texto (el mismo patrón de «Otro» en el mueble).
- **Las dos ciudades son requeridas en ese paso**: sin ellas no se cierra la solicitud y la que
  falta lo dice ella en su burbuja («Necesito saber en qué ciudad estás…»), con el campo enfocado y
  marcado. La **sede no bloquea**: el campo viene con la principal elegida y «Otra ciudad» es una
  respuesta legítima —el caso sin punto, que no asigna vendedor y la solicitud guarda tal cual.
- **Viajan a todas partes**: el contexto del asistente (`location: {customerCity, serviceCity,
  servicePoint}`), el resumen declarado («Ciudad del cliente», «Ciudad del servicio», «Sede») y la
  solicitud guardada. Se quedan al cambiar de línea, como los datos de contacto: son de la persona y
  de dónde compra, no del proyecto (`docs/cambio-de-linea.md`).

## Lo que NO se toca

- El **backoffice** sigue igual: sólo se leen sus sedes.
- Las sedes no cambian de forma: es el mismo `#city`, con otra etiqueta y otro paso.
- `preferences.servicePoint` deja de existir como tal y pasa a `location.servicePoint` (top-level),
  porque ahora lo declaran todas las líneas y no sólo las que tienen preferencias.

## Cómo se comprueba

`tests/atencion.spec.mjs`:

1. con cada una de las ocho líneas, el bloque aparece en el último paso (CONTACT) y no en otro;
2. las ciudades que ofrece son las de las sedes activas del cliente (y ninguna inventada);
3. «Otra ciudad…» revela el texto y lo declarado es lo escrito;
4. sin los tres campos no se cierra, y cada uno tiene su frase en la voz de ella;
5. el contexto (`location`), el resumen y la solicitud guardada los llevan;
6. cambiar de línea no los borra (son de la persona, no del proyecto).
