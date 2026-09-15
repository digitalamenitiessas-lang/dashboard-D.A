'use client'

import * as React from 'react'
import { createClient } from './supabase/client'
import type { Currency } from './types'

/**
 * La cotización del Banco Nación, para prellenar los formularios.
 *
 * La trae `19_cotizacion_bna.sql` con un reloj cada hora; acá sólo se lee.
 * Es una SUGERENCIA, nunca un valor impuesto: el campo sigue siendo
 * editable porque la operación real puede haberse hecho a otro valor, y lo
 * que el sistema guarda tiene que ser lo que pasó y no lo que debería
 * haber pasado.
 */

export interface Cotizacion {
  fecha: string
  compra: number
  venta: number
  fuente: string
  tomadaAt: string
  /** Días entre la cotización y hoy. 0 = es de hoy. */
  diasDeAtraso: number
}

/** Pasados estos días, el número deja de ser confiable y hay que avisarlo. */
export const DIAS_TOLERADOS = 3

// Una sola consulta por sesión, compartida entre todos los diálogos: la
// cotización cambia una vez por día y abrir cuatro formularios no tiene por
// qué pegarle cuatro veces a la base.
let cache: { valor: Cotizacion | null; vence: number } | null = null
let enVuelo: Promise<Cotizacion | null> | null = null
const TTL_MS = 10 * 60 * 1000

async function traer(): Promise<Cotizacion | null> {
  if (cache && cache.vence > Date.now()) return cache.valor
  if (enVuelo) return enVuelo

  enVuelo = (async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('cotizacion_vigente')
      // Sin el 19 corrido la función no existe. No es algo que haya que
      // gritarle a nadie: simplemente no hay sugerencia y el campo se
      // completa a mano, como venía siendo.
      const valor = error || !data ? null : (data as Cotizacion)
      cache = { valor, vence: Date.now() + TTL_MS }
      return valor
    } finally {
      enVuelo = null
    }
  })()

  return enVuelo
}

export function useCotizacion() {
  const [cotizacion, setCotizacion] = React.useState<Cotizacion | null>(
    cache?.valor ?? null,
  )

  React.useEffect(() => {
    let vivo = true
    void traer().then((c) => {
      if (vivo) setCotizacion(c)
    })
    return () => {
      vivo = false
    }
  }, [])

  return cotizacion
}

export interface Sugerencia {
  /** Cuántas unidades de la moneda destino vale una de la de origen. */
  valor: number
  /** Qué lado del mostrador se usó, para poder explicarlo en pantalla. */
  lado: 'compra' | 'venta'
  etiqueta: string
  /** La cotización está vieja: mostrarla en ámbar, no en gris. */
  vieja: boolean
}

const formato = (n: number) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n)

/**
 * Qué cotización corresponde para COBRARLE a un cliente.
 *
 * Siempre la de venta, en cualquier dirección: el cliente que paga en pesos
 * un servicio cotizado en dólares tiene que ir a comprar esos dólares, y los
 * compra al valor de venta del banco. Tomarle el de compra sería regalarle
 * la diferencia.
 *
 * `origen` es la moneda de la deuda y `destino` la del cobro. Devuelve null
 * cuando el par no es USD/ARS: la tabla sólo tiene el dólar, y para el euro
 * no hay de dónde sacarlo.
 */
export function sugerenciaParaCobro(
  origen: Currency,
  destino: Currency,
  c: Cotizacion | null,
): Sugerencia | null {
  if (!c || origen === destino) return null

  const vieja = c.diasDeAtraso > DIAS_TOLERADOS
  const sufijo = c.diasDeAtraso === 0 ? 'de hoy' : `del ${c.fecha}`

  if (origen === 'USD' && destino === 'ARS') {
    return {
      valor: c.venta,
      lado: 'venta',
      etiqueta: `BNA ${sufijo} · venta ${formato(c.venta)}`,
      vieja,
    }
  }
  // Deuda en pesos cobrada en dólares: cuántos dólares son esos pesos.
  if (origen === 'ARS' && destino === 'USD') {
    return {
      valor: Math.round((1 / c.venta) * 1e6) / 1e6,
      lado: 'venta',
      etiqueta: `BNA ${sufijo} · venta ${formato(c.venta)}`,
      vieja,
    }
  }
  return null
}

/**
 * Qué cotización corresponde para un CAMBIO propio de la empresa.
 *
 * Acá el lado se invierte según la dirección, porque del otro lado del
 * mostrador está el banco: si vendemos dólares nos los pagan al de compra,
 * y si los compramos nos los cobran al de venta. Usar siempre venta —como
 * en un cobro— inflaría lo que creemos que vale la caja en dólares.
 */
export function sugerenciaParaCambio(
  origen: Currency,
  destino: Currency,
  c: Cotizacion | null,
): Sugerencia | null {
  if (!c || origen === destino) return null

  const vieja = c.diasDeAtraso > DIAS_TOLERADOS
  const sufijo = c.diasDeAtraso === 0 ? 'de hoy' : `del ${c.fecha}`

  if (origen === 'USD' && destino === 'ARS') {
    // Vendemos dólares: el banco nos los compra.
    return {
      valor: c.compra,
      lado: 'compra',
      etiqueta: `BNA ${sufijo} · compra ${formato(c.compra)}`,
      vieja,
    }
  }
  if (origen === 'ARS' && destino === 'USD') {
    // Compramos dólares: el banco nos los vende.
    return {
      valor: Math.round((1 / c.venta) * 1e6) / 1e6,
      lado: 'venta',
      etiqueta: `BNA ${sufijo} · venta ${formato(c.venta)}`,
      vieja,
    }
  }
  return null
}
