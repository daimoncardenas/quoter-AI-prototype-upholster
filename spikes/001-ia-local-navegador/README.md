# 001 · IA local en el navegador detrás del asistente: negocio, formulario, cerco y conversación

**Pregunta.** ¿Puede el asistente conversar sin problema —varios turnos, sin guion— sobre el negocio y sobre
lo que el cliente ya escribió en el formulario, sin inventar precios ni prometer lo que el taller no ha
declarado, con un modelo que corre en la máquina del cliente y sin claves ni facturas de nube?

**Por qué importa.** El prototipo tiene que *parecer real* en la demo. Hoy el asistente es simulado y
contesta con respuestas preparadas: las preguntas que descubrió el testing de Retapizado no tienen ninguna, y
las de la empresa (dónde quedan, hasta qué hora, cuál es la página, aceptan tarjeta) tampoco. Dos caminos:
escribir las respuestas (barato, determinista, y el spec las verifica) o poner un modelo local detrás de
`respond()` que converse con el contexto por delante y el cerco por detrás.

## Cómo se corre

```
node spikes/001-ia-local-navegador/serve.mjs      → http://127.0.0.1:4173
```

Abrirlo **con Chrome 138 o más** (el de Windows: 153 ✓) y **por `http://127.0.0.1`**, no como archivo: el
navegador solo expone el modelo local en contexto seguro (`file://` no lo es) — la misma razón por la que el
login del backoffice necesita `localhost` (`tools/dev.mjs`, líneas 10-12). Sin modelo la página funciona
igual: responde un sustituto y todo lo demás se prueba.

```
node spikes/001-ia-local-navegador/conversacion.mjs    → 5 conversaciones, 15 turnos, en consola
node spikes/001-ia-local-navegador/fence.mjs           → 8 respuestas de prueba contra el cerco
node spikes/001-ia-local-navegador/smoke.mjs           → la página carga, arma el contexto y corre todo
node spikes/001-ia-local-navegador/probar-modelo.mjs   → ¿responde de verdad el modelo local?
```

## Las piezas

    empresa.json      lo que el negocio es y lo que DECLARA (sedes, horarios, página, canales).
                      Datos de demostración, agnósticos, como el catálogo compartido: los reemplaza el
                      taller en su onboarding, igual que sus precios. Lo que está en null, el asistente
                      NO puede afirmarlo.
    comun.mjs         una sola lista: el contexto que se le entrega al modelo, el cerco, las conversaciones
                      y la regla de respaldo. Lo importan la consola y la página — nada duplicado.
    index.html        el banco de pruebas: capacidad del navegador, contexto a la vista, las preguntas,
                      las conversaciones y la caja para pegar texto y ver al cerco morder.
    conversacion.mjs  las 5 conversaciones de varios turnos, con un sustituto de modelo.
    fence.mjs         el cerco solo, contra respuestas escritas como de modelo.

## Qué se prueba (y por qué así)

1. **Capacidad**: `LanguageModel` presente o ausente, `availability()`, WebGPU, contexto seguro. Sin esa
   respuesta, todo lo demás es adivinanza.
2. **Contexto**: negocio + catálogo + formulario, en el *system prompt* y en cada turno. Es lo que le permite
   hablar de SUS datos («elegiste la tela Lino Verona», «tu estimación va en $ 1.780.000 – $ 1.993.600»).
3. **Conversaciones de varios turnos**, no preguntas sueltas: el que busca el taller y pregunta el horario,
   el que pide la página y pregunta por otro servicio, el que pregunta por lo que ya puso, el que se
   contradice a mitad, y el que intenta sacar una promesa.
4. **El cerco en CADA turno**, con la regla que lo hace sostenible: **no bloquea «plazos» ni «transporte»
   para siempre — bloquea lo que la empresa NO declaró**. El mismo turno, con el transporte declarado o no,
   cambia de veredicto sin tocar código.
5. **La red de seguridad**: si un turno rompe el cerco, no se muestra; se responde con una respuesta
   aprobada. El modelo nunca tiene la última palabra sobre lo que lee el cliente.

## Resultados (lo corrido)

- **Conversaciones**: 5 conversaciones, 15 turnos, `TODO PASA`. El sustituto rompe el cerco a propósito en el
  turno de la promesa («te lo recogemos el viernes sin costo y con garantía de un año») y la red lo tapa con
  la respuesta aprobada en las tres variantes (transporte, plazo, garantía). Ninguna respuesta mostrada quedó
  insegura.
- **El cerco es data-driven**: el mismo texto, «sin declarar transporte» → bloqueado por transporte y
  garantía; «declarando *Recogida y entrega en Bogotá, $ 80.000*» → el transporte pasa y solo queda bloqueada
  la garantía.
- **El cerco muerde** (`fence.mjs`): de ocho respuestas de prueba, cinco cazadas —cifra inventada para el
  relleno, transporte «sin costo», «es el precio final», una mezcla de plazo + relleno incluido, y una que no
  responde nada— y tres limpias (la honesta sobre el relleno, el desvío correcto a otro motivo, y la que
  contesta con datos del negocio).
- **Un agujero que apareció en la primera prueba de la página** (Daimon pegó «necesito plátanos para el
  techo» y el cerco la dejó pasar): una frase que no inventa cifras ni promete nada pasaba sin más. Se cerró
  con la regla mínima — la respuesta tiene que hablar del motivo o de los datos del negocio — y esa frase
  quedó como caso de prueba. Sigue siendo un filtro de patrones, y ese es su límite honesto: puede marcar una
  respuesta legítima que no use ninguna de esas palabras, y puede dejar pasar una tontería que las use.
  Entiende una persona; el cerco solo impide lo que no debe *pasar*.
- **La página funciona sin modelo**: arma el contexto (negocio + los 8 motivos del catálogo + formulario),
  corre las conversaciones con el sustituto, muestra los chips por turno y no lanza un solo error de página.
- **En este entorno el modelo no está**: Chrome 151 headless *expone* `LanguageModel` pero no trae el modelo
  — `availability()` dice `downloadable` y `create()` contesta «On-device model is not available in Chromium,
  this API is just echoing back the input» (`diagnostico.mjs`; con un prompt largo salta
  `QuotaExceededError`, el mismo aviso disfrazado). Eso no dice nada del Chrome del cliente.
- **El primer uso del modelo descarga ~2 GB**, una vez por equipo, y el navegador lo cachea. Conviene hacerlo
  antes de una demo, no delante del cliente.

## Veredicto: **PARTIAL** (falta que el modelo converse en el Chrome del cliente)

- **Probado aquí, con evidencia**: el contexto completo (negocio + catálogo + formulario), el cerco
  data-driven juzgando respuestas de modelo, la red de seguridad tapando un turno roto, las conversaciones de
  varios turnos y la página como banco de pruebas — todo sin modelo y sin un solo error.
- **No probado aquí**: un turno real del modelo local. En Chromium no hay modelo que responda.
- **Lo que falta para el veredicto final**: abrir la página en el Chrome 153 de Windows y pulsar «Preguntar»
  una vez (descarga ~2 GB). Si conversa con los datos del negocio y el cerco deja pasar sus turnos, es
  VALIDADO; si inventa una cifra o promete transporte, la red lo tapa y también es un resultado.

## Recomendación para la construcción real

1. **El archivo de la empresa es la pieza que faltaba**, y es onboarding, no código: sedes, horarios, canales,
   página y lo que el negocio declara. Igual que los precios (`docs/onboarding-precios.md`), se entrega con
   datos de demostración marcados y lo llena el taller. Nada inventado sobre un cliente real.
2. **El cerco se vuelve «no prometas más allá de lo declarado»**, que es la regla que el negocio entiende y
   defiende. Hoy bloquea transporte, plazos, garantías y descuentos porque nadie los ha declarado; el día que
   el taller los escriba, dejan de estar prohibidos sin tocar código.
3. **Una sola lista de patrones y una sola regla de respaldo**, en un módulo compartido por el spec de la
   evaluación, el adaptador del asistente y esta prueba. Aquí ya vive en `comun.mjs`; en el producto tiene que
   pasar lo mismo, o las tres copias se separan.
4. **El modelo detrás de `respond()`, no en su lugar**: el cerebro ya propone acciones y el adaptador las
   valida contra una lista cerrada — ese es el contrato de *tool calling* que un modelo necesita. El modelo
   redacta; la lista decide; el asesor cierra.
5. **Dos modos de demo**: doble clic (`file://`) con respuestas preparadas, sin setup, y servido (`localhost`)
   con el modelo local — el modo «parece real», donde nada sale de la máquina.
6. **Primero las respuestas a mano, después el modelo.** Las cinco preguntas sin respuesta son hechos del
   negocio (transporte, relleno, otro motivo) y hacen falta igual: el modelo solo las redactaría. Este
   directorio es desechable y no se commitea.
