import { isEmptyMoney, type MoneyByCurrency } from './money'
import { formatDate, formatMoneyWithCode } from './format'
import type { Currency } from './types'

/**
 * Los textos con los que se abre WhatsApp.
 *
 * Viven acá y no en cada pantalla para que el tono sea uno solo: son
 * mensajes que le llegan a un cliente con el nombre de la empresa adelante,
 * y tres pantallas escribiéndolos por su cuenta terminan en tres tonos
 * distintos para el mismo reclamo.
 *
 * Ninguno se manda solo: `wa.me` abre el chat con el texto escrito y la
 * persona decide. Por eso pueden incluir montos — siempre pasan por un par
 * de ojos antes de salir.
 *
 * El saludo usa el nombre del CONTACTO si está cargado, y si no cae en un
 * «Hola» a secas. Nunca usa la razón social: «Hola Hotel Mediterráneo SRL»
 * se lee como un mail automático, que es exactamente lo que no se quiere
 * cuando estás reclamando plata.
 */

const FIRMA = 'Digital Amenities'

/**
 * Los montos de un mensaje SIEMPRE llevan el código de moneda, aunque haya
 * una sola en juego.
 *
 * `formatMoneyByCurrency()` sólo lo pone cuando hay dos o más, y adentro de
 * la app está bien: el contexto desambigua. Pero esto sale del sistema y le
 * llega a un cliente por WhatsApp. Un «$625» a un cliente argentino se lee
 * como pesos, y si eran dólares el reclamo nace roto — o al revés, y le
 * estás pidiendo mil veces de más. La regla de la app es no dejar nunca un
 * «$» solo entre dos monedas que lo comparten; en un mensaje que sale hacia
 * afuera esa regla no admite la excepción de «pero acá hay una sola».
 */
function montos(totales: MoneyByCurrency): string {
  const partes = Object.entries(totales).filter(
    ([, monto]) => Math.round(monto) !== 0,
  )
  if (partes.length === 0) return '—'
  return partes
    .map(([moneda, monto]) => formatMoneyWithCode(monto, moneda as Currency))
    .join(' y ')
}

function saludo(contacto: string): string {
  const nombre = contacto.trim().split(/\s+/)[0]
  return nombre ? `Hola ${nombre}` : 'Hola'
}

/** Por el saldo total de un cliente, sumando todos sus proyectos. */
export function mensajeCobroCliente(
  contacto: string,
  pendiente: MoneyByCurrency,
): string {
  const base = `${saludo(contacto)}, ¿cómo estás? Te escribo de ${FIRMA}.`
  if (isEmptyMoney(pendiente)) {
    return `${base} Quería consultarte por el estado de la facturación.`
  }
  return `${base} Te paso el detalle de lo que quedó pendiente: ${montos(pendiente)}. Cualquier cosa quedamos a disposición.`
}

/** Por un proyecto puntual. */
export function mensajeCobroProyecto(
  contacto: string,
  proyecto: string,
  pendiente: MoneyByCurrency,
): string {
  const base = `${saludo(contacto)}, ¿cómo estás? Te escribo de ${FIRMA} por el proyecto ${proyecto}.`
  if (isEmptyMoney(pendiente)) {
    return `${base} Quería consultarte por el estado de la facturación.`
  }
  return `${base} Quedó pendiente ${montos(pendiente)}. Cualquier cosa quedamos a disposición.`
}

/**
 * Por mantenimientos vencidos. Lleva el detalle de cuántos períodos y desde
 * cuándo: un «tenés algo pendiente» sin fechas obliga a una segunda vuelta
 * de mensajes para aclarar de qué se trata.
 */
export function mensajeMantenimientoVencido(
  contacto: string,
  proyecto: string,
  periodos: number,
  desde: string,
  total: MoneyByCurrency,
): string {
  const cuantos =
    periodos === 1
      ? 'el mantenimiento'
      : `${periodos} períodos de mantenimiento`
  return (
    `${saludo(contacto)}, ¿cómo estás? Te escribo de ${FIRMA} por ${proyecto}. ` +
    `Nos figura ${cuantos} sin registrar desde el ${formatDate(desde)}` +
    (isEmptyMoney(total) ? '' : `, por un total de ${montos(total)}`) +
    `. ¿Lo vemos? Cualquier cosa quedamos a disposición.`
  )
}
