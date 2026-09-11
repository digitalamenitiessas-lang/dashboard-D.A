import { mergeMoney, type MoneyByCurrency } from './money'
import type {
  Client,
  Currency,
  Factura,
  FacturaEstado,
  Payment,
  Project,
} from './types'

/**
 * El estado de una factura y los números de facturación.
 *
 * Nada de esto se guarda. El estado sale de comparar el importe de la
 * factura con lo que se le imputó de cobros, y por eso «que el cobro mueva
 * el estado» no existe como trabajo: editar, borrar o reimputar un cobro
 * reacomoda todo solo, y no llega el día en que una columna diga una cosa y
 * los cobros otra. Misma regla que en `tickets`, `fixed_expenses` y los
 * saldos de caja.
 */

/**
 * Cuánto salda un cobro, medido en `moneda`.
 *
 * Si entró en esa moneda, salda su propio importe. Si entró en otra, salda
 * su equivalente — el caso real de facturar en dólares y cobrar en pesos.
 * Sin equivalente cargado no salda nada: no hay cotización que inventar, y
 * la pantalla avisa de esos en vez de dejar la deuda alta sin explicación.
 */
export function loQueSalda(pago: Payment, moneda: Currency): number {
  if (pago.currency === moneda) return pago.amount
  return pago.appliedAmount ?? 0
}

/** Lo imputado a una factura, en la moneda de la factura. */
export function imputadoA(factura: Factura, payments: Payment[]): number {
  return payments
    .filter((p) => p.facturaId === factura.id)
    .reduce((sum, p) => sum + loQueSalda(p, factura.moneda), 0)
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
): FacturaEstado {
  const imputado = Math.round(imputadoA(factura, payments) * 100) / 100
  const importe = Math.round(factura.importe * 100) / 100
  if (imputado <= 0) return 'Pendiente'
  if (imputado >= importe) return 'Cancelada'
  return 'Parcial'
}

/** Lo que falta cobrar de esta factura. Nunca negativo. */
export function saldoFactura(factura: Factura, payments: Payment[]): number {
  return Math.max(0, factura.importe - imputadoA(factura, payments))
}

/**
 * La moneda contra la que un cobro salda algo.
 *
 * La de su factura si está imputado; si no, la de su proyecto. Un cobro sin
 * factura y sin proyecto no salda nada y devuelve null: es plata que entró y
 * todavía no se sabe contra qué va.
 */
export function monedaDeSaldo(
  pago: Payment,
  facturas: Factura[],
  projects: Project[],
): Currency | null {
  if (pago.facturaId) {
    return facturas.find((f) => f.id === pago.facturaId)?.moneda ?? null
  }
  if (pago.projectId) {
    return projects.find((p) => p.id === pago.projectId)?.currency ?? null
  }
  return null
}

// ---------------------------------------------------------------------
// Por cliente — que es como se mira ahora
// ---------------------------------------------------------------------

export interface ResumenCliente {
  facturas: Factura[]
  /** Total facturado, por moneda: un cliente puede tener facturas en varias. */
  facturado: MoneyByCurrency
  /**
   * LA DEUDA: lo facturado que todavía no se cobró.
   *
   * Se suma factura por factura con piso en cero, no como facturado menos
   * cobrado global. Si no, una factura cobrada de más taparía la deuda de
   * otra y el cliente figuraría al día debiendo.
   */
  pendienteDeCobro: MoneyByCurrency
  /** Cobros de este cliente que no saldan ninguna factura. */
  sinImputar: Payment[]
}

export function resumenCliente(
  client: Client,
  facturas: Factura[],
  payments: Payment[],
  projects: Project[],
): ResumenCliente {
  const propias = facturas
    .filter((f) => f.clienteId === client.id)
    .sort((a, b) => b.emitidaOn.localeCompare(a.emitidaOn))

  // Los cobros del cliente: los que saldan una factura suya, más los de sus
  // proyectos. Un cobro puede no tener proyecto (servicio suelto), así que
  // no alcanza con mirar los proyectos.
  const idsFacturas = new Set(propias.map((f) => f.id))
  const idsProyectos = new Set(
    projects.filter((p) => p.clientId === client.id).map((p) => p.id),
  )
  const suyos = payments.filter(
    (p) =>
      (p.facturaId && idsFacturas.has(p.facturaId)) ||
      (p.projectId && idsProyectos.has(p.projectId)),
  )

  return {
    facturas: propias,
    facturado: mergeMoney(...propias.map((f) => ({ [f.moneda]: f.importe }))),
    pendienteDeCobro: mergeMoney(
      ...propias.map((f) => ({ [f.moneda]: saldoFactura(f, payments) })),
    ),
    sinImputar: suyos.filter((p) => p.facturaId === null),
  }
}

// ---------------------------------------------------------------------
// Por proyecto — sigue existiendo para las facturas que sí tienen uno
// ---------------------------------------------------------------------

export interface ResumenFacturacion {
  facturado: number
  pendienteDeCobro: number
  /**
   * Trabajo acordado que todavía no se facturó: cotizado − facturado.
   *
   * No es deuda —el cliente todavía no debe nada de esto— pero es plata que
   * hay que facturar, y sin este número se perdería de vista al pasar la
   * deuda a medirse contra las facturas.
   */
  sinFacturar: number
  facturas: Factura[]
}

export function resumenFacturacion(
  project: Project,
  facturas: Factura[],
  payments: Payment[],
): ResumenFacturacion {
  // Sólo las que apuntan a ESTE proyecto. Una factura de servicio suelto del
  // mismo cliente no es de este proyecto y no entra: sumarla haría que «sin
  // facturar» diera de menos y el proyecto pareciera facturado de más.
  const propias = facturas
    .filter((f) => f.projectId === project.id)
    .sort((a, b) => b.emitidaOn.localeCompare(a.emitidaOn))

  const facturado = propias.reduce((s, f) => s + f.importe, 0)

  return {
    facturado,
    pendienteDeCobro: propias.reduce((s, f) => s + saldoFactura(f, payments), 0),
    sinFacturar: Math.max(0, project.quotedAmount - facturado),
    facturas: propias,
  }
}
