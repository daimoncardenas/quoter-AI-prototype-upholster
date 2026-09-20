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

1. Cambio visual o CSS → se verifica **mirando**: aplicar, UNA captura de la zona, mirarla, responder
   con la captura. Sin tests funcionales, sin worktrees, sin barrer historial.
2. Cambio funcional → su test puntual. La **batería completa** (`npm test`, ~13 min) va UNA vez al
   cerrar el lote o antes de un commit.
3. Al **sumar** a un selector o condición, se suma, no se sustituye (y se comprueba con
   `git diff <archivo> | grep <lo que tocaste>`).
4. Ediciones de texto: imprimir cuántas líneas se borran **antes** de escribir.
5. Verificar con código de salida y `ALL PASS` / `TODO PASA`, nunca con `grep -c FAIL`.
6. Si el dueño está molesto: responder **en español**, corto, sin discursos.
