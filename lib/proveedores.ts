import { mergeMoney, type MoneyByCurrency } from './money'
import type {
  Currency,
  FacturaProveedor,
  MoneyMovement,
  Proveedor,
} from './types'

/**
 * El estado de una factura de proveedor y los números de cada uno.
 *
 * Espejo exacto de `lib/facturas.ts`, del lado de lo que sale. El estado no
 * se guarda: sale de comparar el importe con los pagos imputados. Un pago es
 * un movimiento de caja categoría 'Gasto' — no hay tabla de pagos, porque
 * eso le daría dos fuentes al saldo de cada cuenta.
 */

export const FACTURA_PROVEEDOR_ESTADOS = [
  'Pendiente',
  'Parcial',
  'Pagada',
] as const

export type FacturaProveedorEstado =
  (typeof FACTURA_PROVEEDOR_ESTADOS)[number]

/**
 * Cuánto salda un movimiento, medido en `moneda`.
 *
 * Un movimiento está en la moneda de su cuenta de origen. Si coincide con la
 * de la factura, salda lo que salió; si no, salda su equivalente. Sin
 * equivalente no salda nada: no hay cotización que inventar.
 */
export function loQuePaga(mov: MoneyMovement, moneda: Currency): number {
  // `facturaAplicado` manda siempre que esté: es la conversión declarada
  // para esta operación puntual.
  if (mov.facturaAplicado !== null) return mov.facturaAplicado
  return mov.amountOut
}

/**
 * Lo pagado de una factura.
 *
 * OJO con la moneda: cuando no hay equivalente cargado se asume que el
 * movimiento está en la moneda de la factura. Quien arme la pantalla tiene
 * que filtrar antes los que no coinciden — igual que del lado de los cobros,
 * donde `appliedAmount` cumple el mismo papel.
 */
export function pagadoDe(
  factura: FacturaProveedor,
  movements: MoneyMovement[],
): number {
  return movements
    .filter((m) => m.facturaProveedorId === factura.id)
    .reduce((sum, m) => sum + loQuePaga(m, factura.moneda), 0)
}

export function estadoFacturaProveedor(
  factura: FacturaProveedor,
  movements: MoneyMovement[],
): FacturaProveedorEstado {
  const pagado = Math.round(pagadoDe(factura, movements) * 100) / 100
  const importe = Math.round(factura.importe * 100) / 100
  if (pagado <= 0) return 'Pendiente'
  if (pagado >= importe) return 'Pagada'
  return 'Parcial'
}

/** Lo que falta pagarle. Nunca negativo. */
export function saldoFacturaProveedor(
  factura: FacturaProveedor,
  movements: MoneyMovement[],
): number {
  return Math.max(0, factura.importe - pagadoDe(factura, movements))
}

/**
 * El vencimiento que le corresponde a una factura según el plazo pactado
 * con ese proveedor. Null si no hay plazo o no hay fecha de emisión.
 */
export function vencimientoSugerido(
  proveedor: Proveedor,
  emitidaOn: string,
): string | null {
  if (proveedor.plazoDias === null) return null
  const d = new Date(emitidaOn + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + proveedor.plazoDias)
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

export interface ResumenProveedor {
  facturas: FacturaProveedor[]
  /** Total facturado por moneda: puede facturar en varias. */
  facturado: MoneyByCurrency
  /**
   * LO QUE LE DEBEMOS: lo facturado que todavía no se pagó.
   *
   * Se suma factura por factura con piso en cero. Si no, una pagada de más
   * taparía la deuda de otra y el proveedor figuraría al día cobrándonos.
   */
  pendienteDePago: MoneyByCurrency
  /** Los pagos que le hicimos, imputados o no. */
  pagos: MoneyMovement[]
  /** Pagos a este proveedor que no saldan ninguna factura. */
  sinImputar: MoneyMovement[]
}

export function resumenProveedor(
  proveedor: Proveedor,
  facturas: FacturaProveedor[],
  movements: MoneyMovement[],
): ResumenProveedor {
  const propias = facturas
    .filter((f) => f.proveedorId === proveedor.id)
    .sort((a, b) => b.emitidaOn.localeCompare(a.emitidaOn))

  const pagos = movements
    .filter((m) => m.proveedorId === proveedor.id)
    .sort((a, b) => b.movedOn.localeCompare(a.movedOn))

  return {
    facturas: propias,
    facturado: mergeMoney(...propias.map((f) => ({ [f.moneda]: f.importe }))),
    pendienteDePago: mergeMoney(
      ...propias.map((f) => ({
        [f.moneda]: saldoFacturaProveedor(f, movements),
      })),
    ),
    pagos,
    sinImputar: pagos.filter((m) => m.facturaProveedorId === null),
  }
}
