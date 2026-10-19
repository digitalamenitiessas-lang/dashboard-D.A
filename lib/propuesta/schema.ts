/**
 * La forma de una propuesta.
 *
 * Es el contrato entre tres lugares que tienen que estar de acuerdo: lo que le
 * pedimos al modelo que devuelva, lo que edita la pantalla, y lo que se dibuja
 * en el PDF. Por eso vive en un módulo solo, sin directiva: lo importan tanto
 * el route handler (servidor) como la pantalla (navegador).
 *
 * UN SOLO ESQUEMA PARA LAS DOS PLANTILLAS, y no uno por plantilla. Las
 * plantillas no se diferencian en qué datos existen sino en cuáles se
 * imprimen: el presupuesto corto es el subconjunto del que no lleva
 * presentación ni etapas. Con dos esquemas, pasar de corto a largo obligaría a
 * volver a generar —plata y medio minuto— y se perderían las correcciones
 * hechas a mano. Con uno, es cambiar un select.
 *
 * Tres reglas al tocar esto:
 *
 * - NADA DE `.optional()`. La salida estructurada exige que todas las claves
 *   estén en `required`; un campo opcional vuelve como `undefined` y ensucia el
 *   estado de React. La ausencia se codifica como '', [] o null.
 *
 * - NADA DE `.min()` / `.max()` / `.length()`. No viajan al proveedor, pero sí
 *   quedan en la validación local: si el modelo devuelve algo que las viola, se
 *   descarta la respuesta entera por una regla cosmética. Los topes se validan
 *   en la pantalla, donde se pueden mostrar.
 *
 * - UNA SOLA MONEDA POR PROPUESTA, no una por ítem. Es la regla dura del repo
 *   (`lib/money.ts`): nunca se suman monedas distintas. Con moneda por ítem el
 *   subtotal deja de existir.
 */

import { z } from 'zod'

export const PLANTILLAS = ['corta', 'larga'] as const
export type Plantilla = (typeof PLANTILLAS)[number]

/**
 * Cada cuánto se cobra un ítem.
 *
 * Existe porque sin esto el mantenimiento mensual sumaba al total como si
 * fuera pago único: «desarrollo 8.500 + mantenimiento 300 = total 8.800», y
 * esos 8.800 no son lo que el cliente paga. Como acá SIEMPRE se cotiza
 * desarrollo más mantenimiento, salía mal en todas las propuestas.
 *
 * En ASCII y en minúscula a propósito, aunque el resto del repo escriba
 * «Mensual» con mayúscula: estos valores viajan en el JSON Schema que se le
 * manda al modelo, y un enum con tildes es una fuente de problemas que no
 * hace falta correr. La etiqueta linda se arma al mostrarlo.
 */
export const RECURRENCIAS = [
  'unica',
  'mensual',
  'trimestral',
  'semestral',
  'anual',
] as const
export type Recurrencia = (typeof RECURRENCIAS)[number]

export const ETIQUETA_RECURRENCIA: Record<Recurrencia, string> = {
  unica: 'Pago único',
  mensual: 'Mensual',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
}

export const ItemSchema = z.object({
  descripcion: z.string(),
  /** La bajada, si la hay. '' si no. */
  detalle: z.string(),
  cantidad: z.number(),
  /**
   * `null` es «el texto no decía el precio», distinto de `0`, que es un ítem
   * bonificado. Se ven igual en un input vacío si la conversión está mal
   * hecha, y confundirlos hace que una bonificación salga impresa como un
   * precio que falta.
   */
  precioUnitario: z.number().nullable(),
  recurrencia: z.enum(RECURRENCIAS),
})

export const EtapaSchema = z.object({
  nombre: z.string(),
  descripcion: z.string(),
  /** Texto libre: «2 semanas», «a convenir», '' si no dice. */
  plazo: z.string(),
})

export const PropuestaSchema = z.object({
  cliente: z.object({
    nombre: z.string(),
    empresa: z.string(),
    contacto: z.string(),
  }),
  titulo: z.string(),
  /** Un párrafo. Va de bajada en la corta y de objetivo en la larga. */
  resumen: z.string(),

  items: z.array(ItemSchema),
  moneda: z.enum(['USD', 'ARS', 'EUR']),
  incluyeImpuestos: z.boolean(),

  formaDePago: z.array(z.string()),
  /** `null` si el texto no lo dice. No se inventan 15 ni 30 días. */
  validezDias: z.number().nullable(),
  plazoEntrega: z.string(),
  notas: z.string(),

  // ---- Sólo las imprime la plantilla larga ---------------------------
  presentacion: z.string(),
  alcance: z.array(z.string()),
  fueraDeAlcance: z.array(z.string()),
  supuestos: z.array(z.string()),
  etapas: z.array(EtapaSchema),

  /**
   * Lo que el modelo no pudo deducir del texto. Se muestra en pantalla como
   * una lista de pendientes y NUNCA entra al PDF.
   *
   * Es la pieza que contesta el pedido original —«así no nos anda arriando»—:
   * un campo vacío no comunica que hay que completarlo, y un dato inventado es
   * peor que un dato que falta. Vacío más señalado es el punto medio.
   */
  faltantes: z.array(z.string()),
})

export type Propuesta = z.infer<typeof PropuestaSchema>
export type ItemPropuesta = z.infer<typeof ItemSchema>
export type EtapaPropuesta = z.infer<typeof EtapaSchema>

/** Lo que suma un ítem. Sin precio, nada. */
const subtotalItem = (i: ItemPropuesta) =>
  i.precioUnitario === null ? 0 : i.cantidad * i.precioUnitario

/**
 * Los totales, uno por cada forma de cobro que aparezca.
 *
 * NO se normaliza a mensual ni se suma todo junto. Un presupuesto no es un
 * reporte de ingresos: el cliente va a pagar 8.500 una vez y 300 todos los
 * meses, y las dos cifras tienen que estar separadas porque son dos
 * compromisos distintos. Prorratear el anual a mensual —que es lo correcto
 * para mirar el flujo de la empresa— acá sería inventar un número que el
 * cliente nunca va a ver en su resumen.
 *
 * Devuelve sólo las recurrencias con algo adentro, en orden: primero el pago
 * único, después de más frecuente a menos.
 */
export function totalesPorRecurrencia(
  items: ItemPropuesta[],
): { recurrencia: Recurrencia; total: number }[] {
  return RECURRENCIAS.map((recurrencia) => ({
    recurrencia,
    total: items
      .filter((i) => i.recurrencia === recurrencia)
      .reduce((t, i) => t + subtotalItem(i), 0),
  })).filter((x) => x.total > 0)
}

/**
 * Lo que se paga una sola vez. Es el número que va a la columna `total` de la
 * tabla y al aviso por push: el que contesta «¿por cuánto salió?».
 *
 * Los ítems sin recurrencia cargada cuentan como únicos. Pasa con las
 * propuestas emitidas antes de que existiera el campo.
 */
export function totalUnico(items: ItemPropuesta[]): number {
  return items
    .filter((i) => (i.recurrencia ?? 'unica') === 'unica')
    .reduce((t, i) => t + subtotalItem(i), 0)
}

/** Cuántos ítems quedaron sin precio. El PDF lo aclara al pie del total. */
export const itemsSinPrecio = (items: ItemPropuesta[]) =>
  items.filter((i) => i.precioUnitario === null).length

// ---------------------------------------------------------------------
// La propuesta ya emitida
//
// Aparece recién cuando alguien baja el PDF: es el momento en que deja de
// ser un borrador y pasa a ser un papel que salió para afuera. Ver el
// encabezado de `supabase/23_propuestas.sql`.
// ---------------------------------------------------------------------

export interface PropuestaEmitida {
  id: string
  numero: number
  emitidaOn: string
  plantilla: Plantilla
  clienteNombre: string
  titulo: string
  /** Lo recalcula la base del propio contenido, no lo manda la pantalla. */
  total: number
  moneda: Propuesta['moneda']
  validezDias: number | null
  /** La foto completa: con esto se vuelve a dibujar el PDF sin pasar por la IA. */
  contenido: Propuesta
  createdAt: string
}
