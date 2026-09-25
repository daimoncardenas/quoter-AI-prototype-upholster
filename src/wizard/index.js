/* LA PUERTA DEL WIZARD (src/wizard) — para que la página no sepa de archivos.
 *
 * `window.Wizard` es lo que index.html ve; el día que el núcleo sea modular, esto es lo único que
 * queda apuntando a módulos y la página se vuelve una cáscara.
 */
import { pintarElMueble } from './mueble.js';
import { pintarLaCompra, pintarLaLinea, pintarElProposito, pintarElSaber, pintarLaRuta, conectarLaCompra } from './compra.js';
import { pintarLasPiezas, pintarLasMedidasPorPieza, laPiezaEnFoco, cantidadDeLaPiezaParaElMotor,
         enfocarLaPieza, agregarUnaPieza, quitarLaPieza, guardarLaPiezaDelFoco, lasFotosDeLaPieza,
         lasPiezasQueLesFaltanFotos, etiquetaDeUnaPieza, conectarLasPiezas } from './piezas.js';
import { pintarLasFotos, losLimitesDeLasFotos, cargarLasFotos, conectarLasFotos } from './fotos.js';
import { pintarLasTelas, recomendarLasTelas, esperarLasTelas, olvidarLoDeLaIA, conectarLasTelas } from './telas.js';
import { pintarLaRevision, correrLaRevision, lasFilasDeclaradas, conectarLaRevision } from './revision.js';
import { laAtencionDeclarada, pintarLasCiudades, pintarElResumen, conectarElContacto } from './contacto.js';
import { correrLaValidacion, conectarLaValidacion } from './validacion.js';

window.Wizard = {
  mueble: { pintar: pintarElMueble },
  compra: { pintarTodo: pintarLaCompra, pintarLinea: pintarLaLinea, pintarProposito: pintarElProposito, pintarSaber: pintarElSaber, pintarRuta: pintarLaRuta, conectar: conectarLaCompra },
  piezas: {
    pintarLista: pintarLasPiezas, pintarFichas: pintarLasMedidasPorPieza,
    enFoco: laPiezaEnFoco, cantidadParaElMotor: cantidadDeLaPiezaParaElMotor,
    enfocar: enfocarLaPieza, agregar: agregarUnaPieza, quitar: quitarLaPieza,
    guardar: guardarLaPiezaDelFoco, fotosDeLaPieza: lasFotosDeLaPieza,
    piezasSinFotos: lasPiezasQueLesFaltanFotos, etiquetaDeLaPieza: etiquetaDeUnaPieza,
    conectar: conectarLasPiezas
  },
  fotos: {
    pintar: pintarLasFotos, limites: losLimitesDeLasFotos, cargar: cargarLasFotos,
    conectar: conectarLasFotos
  },
  telas: {
    pintar: pintarLasTelas, recomendar: recomendarLasTelas, esperar: esperarLasTelas,
    olvidar: olvidarLoDeLaIA, conectar: conectarLasTelas
  },
  revision: {
    pintar: pintarLaRevision, correr: correrLaRevision, filas: lasFilasDeclaradas,
    conectar: conectarLaRevision
  },
  contacto: {
    atencion: laAtencionDeclarada, ciudades: pintarLasCiudades, resumen: pintarElResumen,
    conectar: conectarElContacto
  },
  validacion: { correr: correrLaValidacion, conectar: conectarLaValidacion }
};
