/**
 * Los avisos silenciados.
 *
 * El `asunto` es la identidad estable de la cosa avisada, y resultó ser el
 * mismo id que ya usaba `buildAlerts()`: `mnt-<proyecto>`, `dom-<proyecto>`,
 * `nota-<nota>`. Las dos puntas ya llamaban igual a lo mismo, así que
 * silenciar una alerta de la pantalla apaga también su push.
 *
 * QUIÉN DECIDE SI SIGUE CALLADO. La base, no acá. El reloj diario recalcula la
 * gravedad de cada asunto, y si superó a la que tenía cuando se lo silenció
 * —el mantenimiento pasó de uno a dos períodos impagos— le levanta el silencio
 * solo. La pantalla no repite esa cuenta: se limita a mirar si el silencio
 * sigue puesto.
 *
 * La consecuencia, que conviene tener presente: si algo empeora hoy a la
 * tarde, la alerta vuelve a aparecer cuando corra el reloj, no en el momento.
 * Como máximo un día de demora. Para un mantenimiento impago es de sobra; si
 * alguna vez hiciera falta que sea inmediato, la cuenta habría que duplicarla
 * en el cliente, y dos cuentas que tienen que dar lo mismo terminan dando
 * distinto.
 */

import { formatDate } from './format'

export interface Aviso {
  asunto: string
  /** Lo último que vio el reloj diario. */
  titulo: string
  gravedad: number
  vistoAt: string
  /** null con silencio puesto = sin plazo, sólo se levanta si empeora. */
  silenciadoHasta: string | null
  silenciadoGravedad: number | null
  /** null = no está silenciado. */
  silenciadoAt: string | null
}

export const estaSilenciado = (a: Aviso) => a.silenciadoAt !== null

/** Los asuntos callados, para filtrar la lista de alertas de un vistazo. */
export const asuntosSilenciados = (avisos: Aviso[]) =>
  new Set(avisos.filter(estaSilenciado).map((a) => a.asunto))

/** Qué decirle a alguien sobre por qué este aviso no está sonando. */
export function textoSilencio(a: Aviso): string {
  if (!estaSilenciado(a)) return ''
  const base = a.silenciadoHasta
    ? `Callado hasta el ${formatDate(a.silenciadoHasta)}`
    : 'Callado sin plazo'
  return `${base}. Vuelve antes si empeora.`
}

/** Las opciones del menú de silenciar. `null` = sin plazo. */
export const PLAZOS: { dias: number | null; label: string }[] = [
  { dias: 7, label: 'Una semana' },
  { dias: 30, label: 'Un mes' },
  { dias: 90, label: 'Tres meses' },
  { dias: null, label: 'Sin plazo' },
]
