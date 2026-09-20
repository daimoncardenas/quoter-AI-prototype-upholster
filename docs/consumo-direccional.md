# La orientación del corte es de la tela, no del mueble

## Qué pasaba

`packRun()` probaba las dos orientaciones de cada pieza y se quedaba con la más barata (store.js). Para
una tela lisa eso es correcto — es justo lo que hace que dos piezas de 65 cm entren lado a lado en un
rollo de 140 y dos de 80 no. Pero con una tela de pelo, rayas o un dibujo con dirección, girar la pieza
la deja al revés (o descuadra el empate) y **mide menos de lo que el corte necesita**: es el único error
del cotizador que el cliente no puede corregir después — cotiza de menos.

## Qué queda

- **Tres estados por tela** (`Store.fabricRules` → `Store.estimateByComponents`):
  - `free` — las piezas pueden girar (tela lisa).
  - `directional` — no giran (pelo, rayas, dibujo con dirección).
  - `unknown` — **no giran** y un asesor confirma el corte.
  Un registro **sin el dato** cae en `unknown`, no en `free`: el default inseguro es el que no se puede
  permitir.
- **El patrón se declara, no se calcula**: `patternMatch` es `none` o `confirm`. Con `confirm`, la
  estimación dice que la repetición y el empate pueden subir la cantidad y que un asesor confirma los
  metros antes del corte. No hay fórmula de empate en el prototipo, y no se finge una.
- **Dónde se declara**: en el backoffice, en el modal de la tela, junto a las reglas de rollo. El
  cotizador solo lee; una tela nueva nace en `unknown` / `confirm` (los defaults salen de `fabricRules`,
  que es de donde el modal se llena).
- **Las seis telas del demo traen su valor explícito** (`free` + `none`) para que los números que hoy se
  muestran no se muevan, y el seed lo dice en su `nota`: son valores de DEMO, no una ficha técnica. Una
  tela guardada antes de este campo lo hereda del seed por id (`migrateFabrics`, una sola vez); cualquier
  otra se queda en `unknown`.
- **Se congela con la solicitud**: `billing.cutDirection` y `billing.patternMatch`, y el motor sube a
  **v2** (`ESTIMATE_ENGINE_VERSION`): la misma entrada puede dar otro número que en v1, y una solicitud
  vieja tiene que poder explicarse con el motor con el que se cotizó.
- **La estimación lo dice**: en «Con qué se calculó» aparece la tela con dirección (o la orientación por
  confirmar) y, si aplica, la línea de repetición. Un número conservador sin su porqué es un número raro.

## Cómo se comprueba

- `tests/components.spec.mjs`: las telas de las pruebas declaran `free` (los números ya calibrados no se
  tocan) y un bloque nuevo compara una tela `directional` contra una `free`: nunca cuesta menos, y la
  respuesta dice que no se giraron piezas. El `unknown` y el registro sin el dato cuestan exactamente lo
  mismo que el `directional`.
- `tests/billing.spec.mjs`: el modal de la tela lleva los dos campos, una tela nueva nace en
  `unknown` / `confirm`, y la solicitud enviada congela la orientación, el patrón y el motor v2.
