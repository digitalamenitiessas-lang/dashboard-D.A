/**
 * La propuesta mientras se edita.
 *
 * Los campos numéricos viven como texto todo el tiempo que están en pantalla,
 * y recién se convierten a número al armar el PDF. No es un capricho: si
 * `precioUnitario` fuera `number`, borrar el contenido del input deja un `NaN`
 * o un `0` que no se puede borrar —el bug clásico de los formularios sin
 * librería—. Además `MoneyInput` ya habla en cadenas numéricas planas
 * («3700000.5»), así que encaja sin adaptador.
 *
 * La distinción que hay que cuidar en la ida y la vuelta: `null` es «no se
 * sabe el precio» y `0` es «bonificado». Se ven igual en un input vacío si la
 * conversión está mal hecha, y una bonificación impresa como precio faltante
 * es un papelón.
 */

import { todayIso } from '@/lib/format'
import {
  RECURRENCIAS,
  type ItemPropuesta,
  type Propuesta,
  type Recurrencia,
} from './schema'

export interface ItemEditable {
  descripcion: string
  detalle: string
  cantidad: string
  /** '' es «falta el precio». '0' es bonificado. No son lo mismo. */
  precioUnitario: string
  /** Esta no se edita como texto: sale de un select, ya es un valor valido. */
  recurrencia: Recurrencia
}

export type PropuestaEditable = Omit<Propuesta, 'items' | 'validezDias'> & {
  items: ItemEditable[]
  validezDias: string
}

const aTexto = (n: number | null) => (n === null ? '' : String(n))
const aNumero = (s: string) => {
  const n = Number(s)
  return s.trim() === '' || Number.isNaN(n) ? null : n
}

export function aEditable(p: Propuesta): PropuestaEditable {
  return {
    ...p,
    items: p.items.map((i) => ({
      descripcion: i.descripcion,
      detalle: i.detalle,
      cantidad: String(i.cantidad),
      precioUnitario: aTexto(i.precioUnitario),
      // Las propuestas emitidas antes de que existiera el campo no lo traen.
      recurrencia: RECURRENCIAS.includes(i.recurrencia) ? i.recurrencia : 'unica',
    })),
    validezDias: aTexto(p.validezDias),
  }
}

export function aPropuesta(e: PropuestaEditable): Propuesta {
  return {
    ...e,
    items: e.items
      // Una fila que quedó del todo vacía es una fila que alguien agregó y no
      // usó. No tiene por qué salir impresa.
      .filter((i) => i.descripcion.trim() || i.precioUnitario.trim())
      .map((i) => ({
        descripcion: i.descripcion.trim(),
        detalle: i.detalle.trim(),
        cantidad: aNumero(i.cantidad) ?? 1,
        precioUnitario: aNumero(i.precioUnitario),
        recurrencia: i.recurrencia,
      })),
    validezDias: aNumero(e.validezDias),
  }
}

export function propuestaVacia(): PropuestaEditable {
  return {
    cliente: { nombre: '', empresa: '', contacto: '' },
    titulo: '',
    resumen: '',
    items: [itemVacio()],
    moneda: 'USD',
    incluyeImpuestos: false,
    formaDePago: [],
    validezDias: '',
    plazoEntrega: '',
    notas: '',
    presentacion: '',
    alcance: [],
    fueraDeAlcance: [],
    supuestos: [],
    etapas: [],
    faltantes: [],
    // `fecha` no está en el esquema a propósito: el PDF usa la del día en que
    // se baja, que es la única que no puede quedar vieja.
  } satisfies PropuestaEditable
}

export const itemVacio = (): ItemEditable => ({
  descripcion: '',
  detalle: '',
  cantidad: '1',
  precioUnitario: '',
  recurrencia: 'unica',
})

export const etapaVacia = () => ({ nombre: '', descripcion: '', plazo: '' })

/**
 * Los totales mientras se edita, separados por cada cuánto se cobran.
 *
 * Mismo criterio que `totalesPorRecurrencia()` sobre la propuesta ya armada:
 * lo mensual no se suma a lo único. Se repite acá y no se reusa aquélla
 * porque los montos todavía son texto a medio escribir, y convertir la
 * propuesta entera en cada tecla para leer un total sería dar una vuelta
 * larga para lo mismo.
 */
export function totalesEditables(
  items: ItemEditable[],
): { recurrencia: Recurrencia; total: number }[] {
  return RECURRENCIAS.map((recurrencia) => ({
    recurrencia,
    total: items
      .filter((i) => i.recurrencia === recurrencia)
      .reduce((t, i) => {
        const precio = aNumero(i.precioUnitario)
        if (precio === null) return t
        return t + (aNumero(i.cantidad) ?? 1) * precio
      }, 0),
  })).filter((x) => x.total > 0)
}

/** Cuántas filas con descripción quedaron sin precio. */
export const sinPrecio = (items: ItemEditable[]) =>
  items.filter((i) => i.descripcion.trim() && !i.precioUnitario.trim()).length

/** Una propuesta se puede bajar si tiene a quién y por qué. */
export const sePuedeEmitir = (e: PropuestaEditable) =>
  (e.cliente.nombre.trim() !== '' || e.cliente.empresa.trim() !== '') &&
  e.items.some((i) => i.descripcion.trim() !== '')

// ---------------------------------------------------------------------
// Listas de largo variable
//
// Genéricos y puros, para que los tres componentes de lista —texto, ítems y
// etapas— no repitan la misma manipulación de arrays tres veces.
// ---------------------------------------------------------------------

export const agregar = <T,>(xs: T[], nuevo: T): T[] => [...xs, nuevo]

export const quitar = <T,>(xs: T[], i: number): T[] =>
  xs.filter((_, j) => j !== i)

export const cambiar = <T,>(xs: T[], i: number, parche: Partial<T>): T[] =>
  xs.map((x, j) => (j === i ? { ...x, ...parche } : x))

/** La fecha que se imprime, que es siempre la del día en que se baja. */
export const fechaDeHoy = () => todayIso()
