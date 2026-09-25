/* La interfaz del cuerpo que arma `submitQuote()` (index.html:2538-2651) y guarda
 * `Store.put('quotes', quote)`: el caso completo de una pre-cotización, tal como el prototipo lo
 * escribe HOY — cada bloque anotado con su línea.
 *
 * Convenciones del PROTOTIPO, hoy distintas a las del producto:
 *   · ids de tela numéricos            (producto: string)
 *   · dinero en pesos                  (producto: céntimos → pricePerMeterCents, totalCents)
 *   · estado 'Nueva'                   (producto: draft | issued | accepted | cancelled)
 *   · las fotos van a IndexedDB        (aquí solo viajan sus ids; el producto no las tiene aún)
 */
export interface QuoteRequest {
  id: string;                              // Store.nextQuoteId() → "COT-1045"           (2590)
  date: string;                            // fecha del CLIENTE "YYYY-MM-DD"             (2569)

  /* La ruta de entrada (docs/flujo-de-suministro.md) y sus dos respuestas. */
  ruta: string | null;                     //                                            (2594)
  proposito: { id: string; label: string } | null;   // para qué necesita la tela        (2597)
  saber: { id: string; label: string } | null;       // qué sabía al entrar              (2598)
  entrega: string | null;                  // sede / envío / asesor, si el paso existe   (2600)

  /* La persona (Ley 1581: solo con su autorización, que marca ella). */
  customer: { name: string; email: string; phone: string };                           // (2601)

  /* La pieza y la línea. */
  furniture: string;                       // "Sofá", "Sofá en L"…                       (2604)
  service: { id: string; label: string; journey?: unknown } | null;                   // (2605)
  quantityLabel: string;                   // el texto del selector de puestos           (2606)

  measures: { width: number | null; height: number | null; depth: number | null };    // (2607)
  coverage: string;                        // cobertura del tapizado                     (2610)
  cushions: number | string | null;        // cojines(): el valor del control            (2611)

  /* Lo declarado para la recomendación. */
  needs: string[];                         // chips marcados                             (2612)
  style: string;                                                                       // (2613)
  colorRange: string;                                                                  // (2614)
  budget: number | null;                                                               // (2615)

  /* El trabajo. */
  damages: string[];                       // damageIds(): ids marcados                  (2616)
  insumos: Array<{ id: string; label: string; unit?: string; cop?: number; qty: number }>;
                                           // insumosMarcados(): los del taller con su precio del
                                           // día, congelados (docs/retapizado-trabajo.md)  (2619)

  /* La atención (docs/punto-de-atencion.md). */
  city: string;                            // "Bogotá · Patio Bonito"                    (2620)
  servicePointId: string;                  // el id sobrevive a un renombre              (2620)
  customerCity: string;                    // de dónde escribe                           (2622)
  serviceCity: string;                     // para dónde es el servicio                  (2622)

  /* La tela y la cantidad. */
  fabricId: number | null;                 //                                            (2623)
  fabricName: string;                      // "Lino Verona · Arena"                      (2624)
  meters: [number, number];                // [mín, máx] del consumo                     (2625)
  lista: Array<{                           // cada referencia con SU cantidad y su regla
    fabricId: number; fabricName: string;  // congelados con la solicitud               (2629-2633)
    valor: number; unidad: string; rollos?: number; rollLengthM?: number;
    declarado: number; facturable: number;
    compra: number; sobrante: number;
    price: number; valorTotal: [number, number];
    sinTela: boolean; porCalculo: boolean;
  }> | null;
  pedidoDe: { id: string; fabricName: string } | null;   // el faltante de un pedido     (2634)

  /* El costeo CONGELADO: lo cotizado no se recalcula (2635-2637). */
  billing: {
    modelo: string; tecnico: string;
    rollWidthCm?: number; piezas?: number; cutDirection?: string; patternMatch?: string;
    consumo: [number, number]; facturable: [number, number];
    compra: [number, number]; sobrante: [number, number];
    razones: string[]; reglas: unknown;
  } | null;                                                                             // (2638-2646)
  price: [number, number] | null;          // facturable × precio de la tela             (2645)

  /* La estimación que el cliente VIO (el mismo motor de la pantalla: linePrice). */
  estimate: {
    kind: string | null;
    engineVersion: string;
    calculatedAt: string;                  // ISO
    parts: Array<{ label: string; value: [number, number] }>;
    total: [number, number];
    inputs: unknown;                       // estimateInputs() + la lista declarada       (2577-2587)
  } | null;

  /* El cierre. */
  seller: string;                          // el vendedor asignado por zona, si hay      (2553-2554)
  sellerId: string;                                                                    // (2649)
  status: 'Nueva';                                                                    // (2649)
  photoIds: string[];                      // "photo-COT-1045-1" — las fotos viven en IndexedDB
}
