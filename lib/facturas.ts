import { mergeMoney, type MoneyByCurrency } from './money'
import type { Factura, FacturaEstado, Payment, Project } from './types'

/**
 * El estado de una factura y los números de facturación de un proyecto.
 *
 * Nada de esto se guarda. El estado sale de comparar el importe de la
 * factura con lo que se le imputó de cobros, y por eso «que el cobro mueva
 * el estado» no existe como trabajo: editar, borrar o reimputar un cobro
 * reacomoda todo solo, y no llega el día en que una columna diga una cosa y
 * los cobros otra. Es la misma regla que en `tickets`, en `fixed_expenses` y
 * en los saldos de caja.
 */

/**
 * Cuánto salda un cobro, en la moneda del PROYECTO.
 *
 * Si entró en esa moneda, salda su propio importe. Si entró en otra, salda su
 * equivalente (`appliedAmount`, del paso 14) — el caso real de cotizar en
 * dólares y cobrar en pesos. Sin equivalente cargado no salda nada: no hay
 * cotización que inventar, y la pantalla ya avisa de esos.
 */
export function loQueSalda(pago: Payment, project: Project): number {
  if (pago.currency === project.currency) return pago.amount
  return pago.appliedAmount ?? 0
}

/** Lo imputado a una factura, en la moneda del proyecto. */
export function imputadoA(
  factura: Factura,
  payments: Payment[],
  project: Project,
): number {
  return payments
    .filter((p) => p.facturaId === factura.id)
    .reduce((sum, p) => sum + loQueSalda(p, project), 0)
}

/**
 * Pendiente / Parcial / Cancelada.
 *
 * El redondeo a centavos evita que una diferencia de 0,004 por una división
 * de cotización deje una factura eternamente «Parcial» por medio centavo.
 */
export function estadoFactura(
  factura: Factura,
  payments: Payment[],
  project: Project,
): FacturaEstado {
  const imputado = Math.round(imputadoA(factura, payments, project) * 100) / 100
  const importe = Math.round(factura.importe * 100) / 100
  if (imputado <= 0) return 'Pendiente'
  if (imputado >= importe) return 'Cancelada'
  return 'Parcial'
}

/** Lo que falta cobrar de esta factura. Nunca negativo. */
export function saldoFactura(
  factura: Factura,
  payments: Payment[],
  project: Project,
): number {
  return Math.max(0, factura.importe - imputadoA(factura, payments, project))
}

export interface ResumenFacturacion {
  /** Total facturado del proyecto, en su moneda. */
  facturado: number
  /**
   * LA DEUDA: lo facturado que todavía no se cobró.
   *
   * Se suma factura por factura con piso en cero, no como
   * `facturado − cobrado` global. Si no, una factura cobrada de más taparía
   * la deuda de otra y el cliente figuraría al día debiendo. Es el mismo
   * criterio que ya usa el pendiente por proyecto.
   */
  pendienteDeCobro: number
  /**
   * Trabajo acordado que todavía no se facturó: cotizado − facturado.
   *
   * No es deuda —el cliente todavía no debe nada de esto— pero es plata que
   * hay que facturar, y sin este número se perdería de vista al pasar la
   * deuda a medirse contra las facturas.
   */
  sinFacturar: number
  /** Cobros del proyecto que no están imputados a ninguna factura. */
  sinImputar: Payment[]
  facturas: Factura[]
}

export function resumenFacturacion(
  project: Project,
  facturas: Factura[],
  payments: Payment[],
): ResumenFacturacion {
  const propias = facturas
    .filter((f) => f.projectId === project.id)
    .sort((a, b) => b.emitidaOn.localeCompare(a.emitidaOn))
  const pagos = payments.filter((p) => p.projectId === project.id)

  const facturado = propias.reduce((s, f) => s + f.importe, 0)
  const pendienteDeCobro = propias.reduce(
    (s, f) => s + saldoFactura(f, pagos, project),
    0,
  )

  return {
    facturado,
    pendienteDeCobro,
    sinFacturar: Math.max(0, project.quotedAmount - facturado),
    sinImputar: pagos.filter((p) => p.facturaId === null),
    facturas: propias,
  }
}

/** Lo mismo para varios proyectos, agrupado por moneda. */
export function facturacionPorMoneda(
  projects: Project[],
  facturas: Factura[],
  payments: Payment[],
): {
  facturado: MoneyByCurrency
  pendienteDeCobro: MoneyByCurrency
  sinFacturar: MoneyByCurrency
} {
  const facturado: MoneyByCurrency[] = []
  const pendiente: MoneyByCurrency[] = []
  const sinFacturar: MoneyByCurrency[] = []

  for (const p of projects) {
    const r = resumenFacturacion(p, facturas, payments)
    facturado.push({ [p.currency]: r.facturado })
    pendiente.push({ [p.currency]: r.pendienteDeCobro })
    sinFacturar.push({ [p.currency]: r.sinFacturar })
  }

  return {
    facturado: mergeMoney(...facturado),
    pendienteDeCobro: mergeMoney(...pendiente),
    sinFacturar: mergeMoney(...sinFacturar),
  }
}
