'use client'

/**
 * El borrador, mientras se edita.
 *
 * Nada de esto va a la base: una propuesta se guarda recién cuando se baja el
 * PDF. Pero el paso de corregir a mano es donde se invierte el tiempo —y lo
 * que ya costó plata generar— así que cerrar la pestaña no puede perderlo.
 *
 * `localStorage` y no otra cosa: `sessionStorage` muere con la pestaña, que es
 * justo el caso que hay que cubrir; guardar en Supabase contradice la decisión
 * de no persistir borradores; y `beforeunload` da un cartel feo del navegador
 * y no salva nada si el navegador se cae. Como todos comparten el mismo
 * usuario, «por navegador» es además el granulado real: el borrador de Joaco
 * queda en la máquina de Joaco.
 *
 * NO se restaura solo. Al entrar se ofrece retomarlo: restaurar en silencio es
 * desorientante para quien vino a empezar una propuesta nueva.
 */

import type { PropuestaEditable } from './editar'
import type { Plantilla } from './schema'

const CLAVE = 'da:propuesta-borrador'
const VIGENCIA_DIAS = 7

export interface Borrador {
  /** Si el esquema cambia, se sube y los borradores viejos se descartan solos. */
  v: 1
  guardadoOn: string
  plantilla: Plantilla
  /** El texto original, para poder regenerar sin volver a escribirlo. */
  texto: string
  propuesta: PropuestaEditable
}

export function guardarBorrador(
  b: Omit<Borrador, 'v' | 'guardadoOn'>,
): void {
  try {
    const lleno: Borrador = { v: 1, guardadoOn: new Date().toISOString(), ...b }
    localStorage.setItem(CLAVE, JSON.stringify(lleno))
  } catch {
    // Ventana privada, almacenamiento lleno o bloqueado. No poder guardar un
    // borrador no puede romper la pantalla.
  }
}

export function leerBorrador(): Borrador | null {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (!crudo) return null

    const b = JSON.parse(crudo) as Borrador
    if (b?.v !== 1 || !b.propuesta) return null

    const dias =
      (Date.now() - new Date(b.guardadoOn).getTime()) / 86_400_000
    if (!(dias >= 0) || dias > VIGENCIA_DIAS) return null

    return b
  } catch {
    // Un JSON corrupto no puede impedir que la pantalla abra.
    return null
  }
}

export function borrarBorrador(): void {
  try {
    localStorage.removeItem(CLAVE)
  } catch {
    // Ídem.
  }
}
