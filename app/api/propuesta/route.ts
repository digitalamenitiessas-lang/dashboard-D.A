/**
 * Convierte el texto libre en una propuesta estructurada.
 *
 * Es la primera ruta de servidor del proyecto. Existe por una sola razón: la
 * clave de OpenRouter no puede vivir en el navegador, y todo el resto de la
 * app habla con Supabase directo desde el cliente.
 */

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { ErrorPropuesta, estructurar } from '@/lib/propuesta/openrouter'
import { PLANTILLAS, type Plantilla } from '@/lib/propuesta/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Una generación tarda entre diez y cuarenta segundos. El techo por defecto de
 * una función en Vercel es bastante menor que eso, así que sin esto el 504 es
 * sistemático y el mensaje que ve el usuario es el de Vercel, no el nuestro.
 */
export const maxDuration = 60

/** Arriba de esto es un pegote accidental, y cada carácter cuesta plata. */
const TOPE_CARACTERES = 8000
const MINIMO_CARACTERES = 40

const error = (status: number, codigo: string, mensaje: string) =>
  NextResponse.json({ codigo, error: mensaje }, { status })

export async function POST(req: Request) {
  // El matcher de `proxy.ts` ya cubre /api, así que una request sin sesión no
  // llega hasta acá. Se revalida igual por dos motivos: el matcher tiene
  // exclusiones por extensión, y un 307 a /login le llega a un `fetch()` como
  // un HTML que revienta el `res.json()` con un error incomprensible.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return error(401, 'sin_sesion', 'Se venció la sesión. Recargá la página.')
  }

  let cuerpo: {
    texto?: unknown
    plantilla?: unknown
    cliente?: unknown
    moneda?: unknown
  }
  try {
    cuerpo = await req.json()
  } catch {
    return error(400, 'entrada', 'No se entendió el pedido.')
  }

  const texto = typeof cuerpo.texto === 'string' ? cuerpo.texto.trim() : ''
  if (texto.length < MINIMO_CARACTERES) {
    return error(
      400,
      'entrada',
      'Contá un poco más: qué se va a hacer, para quién y por cuánto.',
    )
  }
  if (texto.length > TOPE_CARACTERES) {
    return error(
      413,
      'entrada',
      `El texto es muy largo (${texto.length} caracteres, el tope son ${TOPE_CARACTERES}). Dejá lo que se acordó y sacá el resto.`,
    )
  }

  const plantilla = cuerpo.plantilla as Plantilla
  if (!PLANTILLAS.includes(plantilla)) {
    return error(400, 'entrada', 'Falta elegir el tipo de documento.')
  }

  try {
    const { propuesta, uso, modelo } = await estructurar(texto, plantilla, {
      cliente: typeof cuerpo.cliente === 'string' ? cuerpo.cliente : undefined,
      moneda: typeof cuerpo.moneda === 'string' ? cuerpo.moneda : undefined,
    })

    // Queda en el log de la función, que es donde se mira cuánto costó de
    // verdad en vez de estimarlo.
    console.log(
      `[propuesta] ${modelo} · ${uso.entrada} in / ${uso.salida} out · plantilla ${plantilla}`,
    )

    return NextResponse.json({ propuesta, uso })
  } catch (e) {
    if (e instanceof ErrorPropuesta) {
      // El detalle va al log del servidor; el usuario ve una frase en
      // castellano. Un error de autenticación filtrado a pantalla dice más de
      // lo que conviene.
      console.error(`[propuesta] ${e.codigo}:`, e.detalle ?? e.message)
      const status =
        e.codigo === 'sin_clave' ? 500
        : e.codigo === 'limite' ? 429
        : e.codigo === 'sin_estructura' ? 422
        : 502
      return error(status, e.codigo, e.parausuario)
    }

    console.error('[propuesta] inesperado:', e)
    return error(500, 'inesperado', 'Algo falló al armar la propuesta.')
  }
}
