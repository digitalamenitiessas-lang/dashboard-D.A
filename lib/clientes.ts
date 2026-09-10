import { projectFinance } from './derive'
import {
  collectionRatio,
  mergeMoney,
  type MoneyByCurrency,
} from './money'
import type {
  Client,
  MaintenanceCharge,
  Payment,
  Project,
} from './types'

/**
 * Un cliente con sus proyectos y su situación financiera.
 *
 * Vive acá y no en una pantalla porque lo consumen DOS vistas: la ficha
 * agrupada dentro de /proyectos y la sección propia de /clientes. Dos
 * pantallas calculando por su cuenta «cuánto me debe este cliente» es la
 * forma más corta de que muestren números distintos del mismo dato, y que
 * después nadie sepa cuál creer.
 */
export interface ClienteEnriquecido {
  client: Client
  /** Sólo los de terceros: un proyecto propio no tiene cliente. */
  projects: Project[]
  quoted: MoneyByCurrency
  paid: MoneyByCurrency
  /** Mantenimientos efectivamente cobrados. No suman al pendiente. */
  maintenance: MoneyByCurrency
  /** Cobrado + mantenimientos: todo lo que entró por este cliente. */
  collected: MoneyByCurrency
  /**
   * Lo que falta cobrar, medido contra lo COTIZADO. Los mantenimientos
   * quedan afuera a propósito: son recurrentes, no parte de lo cotizado del
   * proyecto. El piso en cero viene de cada proyecto — si uno está cobrado
   * de más, eso no borra la deuda de otro.
   */
  pending: MoneyByCurrency
  /** Null si hay más de una moneda en juego: no hay cotización cargada. */
  pct: number | null
  activeMaintenances: Project[]
}

export function enriquecerClientes({
  clients,
  projects,
  payments,
  maintenanceCharges,
}: {
  clients: Client[]
  projects: Project[]
  payments: Payment[]
  maintenanceCharges: MaintenanceCharge[]
}): ClienteEnriquecido[] {
  const terceros = projects.filter((p) => p.type === 'terceros')

  return clients.map((client) => {
    const clientProjects = terceros.filter((p) => p.clientId === client.id)
    const finances = clientProjects.map((p) =>
      projectFinance(p, payments, maintenanceCharges),
    )
    const quoted = mergeMoney(...finances.map((f) => f.quotedByCurrency))
    const paid = mergeMoney(...finances.map((f) => f.paidByCurrency))
    const maintenance = mergeMoney(
      ...finances.map((f) => f.maintenanceByCurrency),
    )
    return {
      client,
      projects: clientProjects,
      quoted,
      paid,
      maintenance,
      collected: mergeMoney(paid, maintenance),
      pending: mergeMoney(...finances.map((f) => f.pendingByCurrency)),
      pct: collectionRatio(quoted, paid),
      activeMaintenances: clientProjects.filter(
        (p) => p.maintenance.status === 'Activo',
      ),
    }
  })
}

/** Los proyectos de terceros a los que nadie les asignó cliente todavía. */
export function proyectosSinCliente(projects: Project[]): Project[] {
  return projects.filter((p) => p.type === 'terceros' && !p.clientId)
}
