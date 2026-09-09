/**
 * Teléfonos en formato internacional, para que el botón de WhatsApp ande.
 *
 * `wa.me` quiere el número en dígitos puros, con código de país y sin `+`,
 * sin espacios y sin guiones. Un celular argentino escrito como uno lo dice
 * por teléfono —0381 15-555-1234— no sirve: hay que sacarle el 0, sacarle el
 * 15, y meterle un 9 entre el código de país y la característica. El
 * resultado es 5493815551234.
 *
 * Nadie se acuerda de esa regla, y equivocarse no da un error: WhatsApp abre
 * y dice que el número no existe, justo cuando uno le está por reclamar
 * plata a un cliente. Por eso la normalización vive acá, en un solo lugar,
 * y la pantalla muestra el número final para que se pueda confirmar de un
 * vistazo antes de guardar.
 *
 * Casos verificados, corriendo la función (si tocás esto, volvé a pasarlos):
 *
 *   '0381 15-555-1234'   -> 5493815551234   (como lo escribe la gente)
 *   '381 15 555 1234'    -> 5493815551234
 *   '3815551234'         -> 5493815551234
 *   '+54 9 381 555 1234' -> 5493815551234
 *   '5493815551234'      -> 5493815551234   (idempotente: lo ya guardado)
 *   '011 15-4444-5555'   -> 5491144445555   (característica de 2)
 *   '02966 15-42-1234'   -> 5492966421234   (característica de 4)
 *   '0381 4212345'       -> 5493814212345   (sin 15)
 *   '', '123', 'no tengo'-> null
 *   '099 123 456'  (UY)  -> 59899123456
 *   '(305) 555-1234' (US)-> 13055551234
 */

export interface Pais {
  codigo: string
  nombre: string
  /** Ejemplo de cómo se escribe ahí, para el placeholder. */
  ejemplo: string
}

/**
 * La lista arranca corta a propósito: Argentina y los países donde esta
 * empresa podría tener un cliente. Agregar uno es una línea.
 */
export const PAISES: Pais[] = [
  { codigo: '54', nombre: 'Argentina', ejemplo: '0381 15-555-1234' },
  { codigo: '598', nombre: 'Uruguay', ejemplo: '099 123 456' },
  { codigo: '55', nombre: 'Brasil', ejemplo: '11 91234-5678' },
  { codigo: '56', nombre: 'Chile', ejemplo: '9 1234 5678' },
  { codigo: '595', nombre: 'Paraguay', ejemplo: '0981 123456' },
  { codigo: '591', nombre: 'Bolivia', ejemplo: '71234567' },
  { codigo: '51', nombre: 'Perú', ejemplo: '912 345 678' },
  { codigo: '57', nombre: 'Colombia', ejemplo: '300 1234567' },
  { codigo: '52', nombre: 'México', ejemplo: '55 1234 5678' },
  { codigo: '34', nombre: 'España', ejemplo: '612 34 56 78' },
  { codigo: '1', nombre: 'EE.UU. / Canadá', ejemplo: '(305) 555-1234' },
]

export const PAIS_POR_DEFECTO = '54'

/**
 * Características argentinas de 2 y 3 dígitos, que son las que hacen
 * ambiguo dónde termina la característica y empieza el 15.
 *
 * Con 11 dígitos (característica + 15 + número) hay que saber si el 15 está
 * en la posición 2, 3 o 4. La lista resuelve los casos frecuentes; para el
 * resto se asume característica de 4 dígitos, que es lo más común en el
 * interior. No pretende ser exhaustiva: por eso el número final se muestra
 * en pantalla en vez de darse por bueno en silencio.
 */
const AREAS_2 = ['11']
const AREAS_3 = [
  '220', '221', '223', '230', '236', '237', '249', '260', '261', '263',
  '264', '266', '280', '291', '294', '297', '299', '341', '342', '343',
  '345', '348', '351', '353', '358', '362', '364', '370', '376', '379',
  '381', '383', '385', '387', '388',
]

const soloDigitos = (v: string) => v.replace(/\D/g, '')

/**
 * Le saca a un número argentino el 0 de larga distancia y el 15 de celular,
 * y devuelve los 10 dígitos de característica + número.
 *
 * Devuelve null si no queda algo con pinta de número argentino: es mejor
 * decir «revisá esto» que armar un link que va a fallar.
 */
function nacionalArgentino(digitos: string): string | null {
  let d = digitos

  // Código de país y el 9 de celular, si ya venían puestos. Se sacan para
  // volver a armarlos igual siempre: así la función es idempotente y un
  // número ya normalizado vuelve a dar el mismo resultado.
  if (d.startsWith('54')) d = d.slice(2)
  if (d.startsWith('9') && d.length > 10) d = d.slice(1)

  // El 0 de larga distancia.
  if (d.startsWith('0')) d = d.slice(1)

  // El 15, que va DESPUÉS de la característica.
  //
  // Un número argentino son SIEMPRE 10 dígitos significativos
  // (característica + abonado), así que con el 15 metido en el medio son
  // 12. No 11: ese error de aritmética hacía que «0381 15-555-1234» —la
  // forma en que la gente escribe el número, la más común de todas— cayera
  // en null y el botón de WhatsApp no apareciera nunca.
  if (d.length === 12) {
    const largoArea = AREAS_2.includes(d.slice(0, 2))
      ? 2
      : AREAS_3.includes(d.slice(0, 3))
        ? 3
        : 4
    if (d.slice(largoArea, largoArea + 2) === '15') {
      d = d.slice(0, largoArea) + d.slice(largoArea + 2)
    }
  }

  // Un número argentino son 10 dígitos: característica + abonado.
  return d.length === 10 ? d : null
}

/**
 * El número listo para `wa.me`: dígitos puros con código de país.
 * Null si no se pudo interpretar.
 */
export function normalizarTelefono(
  crudo: string,
  codigoPais: string = PAIS_POR_DEFECTO,
): string | null {
  const d = soloDigitos(crudo)
  if (!d) return null

  if (codigoPais === '54') {
    const nacional = nacionalArgentino(d)
    // El 9 va entre el 54 y la característica, y es lo que distingue un
    // celular de un fijo. WhatsApp sólo existe en celulares.
    return nacional ? `549${nacional}` : null
  }

  // Para el resto: se saca el 0 de larga distancia y el código de país si ya
  // venía, y se antepone el código. Sin la gimnasia del 15/9, que es una
  // particularidad argentina.
  let resto = d
  if (resto.startsWith(codigoPais)) resto = resto.slice(codigoPais.length)
  if (resto.startsWith('0')) resto = resto.slice(1)
  // Menos de 6 dígitos no es un teléfono; más de 14 tampoco.
  if (resto.length < 6 || resto.length > 14) return null
  return `${codigoPais}${resto}`
}

/** Para mostrar: `+54 9 381 555-1234`. Puramente cosmético. */
export function formatearTelefono(internacional: string | null): string {
  if (!internacional) return '—'
  if (internacional.startsWith('549') && internacional.length === 13) {
    const n = internacional.slice(3)
    const largoArea = AREAS_2.includes(n.slice(0, 2))
      ? 2
      : AREAS_3.includes(n.slice(0, 3))
        ? 3
        : 4
    const area = n.slice(0, largoArea)
    const resto = n.slice(largoArea)
    const corte = resto.length > 4 ? resto.length - 4 : 0
    return `+54 9 ${area} ${resto.slice(0, corte)}-${resto.slice(corte)}`
  }
  return `+${internacional}`
}

/**
 * El link que abre WhatsApp con el chat de ese número y el mensaje ya
 * escrito. NO manda nada: abre la conversación con el texto puesto para que
 * la persona lo lea, lo edite si quiere, y recién ahí toque enviar.
 */
export function linkWhatsapp(
  telefono: string | null,
  mensaje: string,
): string | null {
  const numero = normalizarTelefono(telefono ?? '')
  if (!numero) return null
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`
}
