# AGENTS.md

Las reglas de este repo viven en `CLAUDE.md`, sección **"Cómo se trabaja en este repo (reglas)"**
— y el resto de ese archivo es la arquitectura. Léelo antes de tocar nada: es un prototipo de
demostración, los packs son datos de demo agnósticos, y lo que se evalúa es la coherencia de la
aplicación (cambiar de plan agrega o quita servicios), no el cliente con el que corras.

Este archivo es el que Hermes carga al abrir el repo. Aquí van las reglas de CÓMO trabajar; las de
qué es el producto están en `CLAUDE.md`.

## Reglas de trabajo (canónico: `CLAUDE.md` § Ritmo y verificación)

Las de CÓMO trabajar viven en **`CLAUDE.md`, sección «Ritmo y verificación»** — ahí las leen también
Claude Code y las demás herramientas. Resumen, para quien sólo lea este archivo:

1. **Diseño primero, y solo el diseño.** Un cambio de interfaz se hace visual (marcado y estilos, sin
   lógica nueva) y se le enseña al dueño con UNA captura, **rápido**: la lógica y las pruebas se
   conectan **solo después** de que él apruebe el diseño. Sin suites mientras él mira un diseño.
   (Dueño, 25/09, ya dicho varias veces: «primero diseño de ahora en adelante» · «solo diseño» · «y si
   se aprueba, se conecta logica y demas para testing».)
2. Cambio visual o CSS → se verifica **mirando**: aplicar, UNA captura de la zona, mirarla, responder
   con la captura. Sin tests funcionales, sin worktrees, sin barrer historial.
3. **Las suites solo se corren AL DESPLEGAR** (dueño, 25/09: «the suite only should be run when is
   deploy»): mientras se trabaja, un cambio funcional se verifica **en vivo** —el navegador, un guion
   corto que lee el estado, o una captura—, nunca con `npm test` ni con la batería por edición.
4. Al **sumar** a un selector o condición, se suma, no se sustituye (y se comprueba con
   `git diff <archivo> | grep <lo que tocaste>`).
5. Ediciones de texto: imprimir cuántas líneas se borran **antes** de escribir.
6. Verificar con código de salida y `ALL PASS` / `TODO PASA`, nunca con `grep -c FAIL`.
7. Si el dueño está molesto: responder **en español**, corto, sin discursos.
8. **Si no lees un archivo, no lo actualices.** Este agente lee y escribe `AGENTS.md`; `CLAUDE.md` es
   de las otras herramientas y del dueño (dueño, 25/09: «si no lees claude... no actualices claude»).
9. **Pregunta sencilla → respuesta inmediata.** Una línea, sin herramientas, sin análisis ni vueltas.
   Al dueño le molesta la demora y que «piense tanto» en cosas simples (25/09).
