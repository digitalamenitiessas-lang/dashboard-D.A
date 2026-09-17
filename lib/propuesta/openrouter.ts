/**
 * La llamada al modelo, por OpenRouter.
 *
 * `server-only` no es decorativo: si alguien importa este módulo desde un
 * componente del navegador —para «reusar el tipo», que es como pasa siempre—
 * el build falla en vez de mandar la clave o el módulo al bundle. La variable
 * no lleva prefijo NEXT_PUBLIC_, así que Next no la expondría igual, pero el
 * error en tiempo de build es mejor que confiar en que nadie se confunda.
 *
 * No se usa ningún SDK. OpenRouter habla HTTP y JSON y `fetch` alcanza: un
 * paquete más sería una dependencia que actualizar y un lockfile que mantener
 * para ahorrar veinte líneas.
 */

import 'server-only'
import { z } from 'zod'

import { PropuestaSchema, type Plantilla, type Propuesta } from './schema'
import { SISTEMA, mensajeUsuario } from './prompt'

const URL_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions'

/**
 * El modelo se elige por variable de entorno y no se hardcodea: si uno sale
 * caro, se porta mal con la salida estructurada o directamente desaparece del
 * catálogo, se cambia sin tocar código ni redeployar.
 */
const MODELO = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-5'

export type CodigoError =
  | 'sin_clave'
  | 'sin_estructura'
  | 'limite'
  | 'proveedor'

export class ErrorPropuesta extends Error {
  constructor(
    readonly codigo: CodigoError,
    /** Lo que se le muestra a quien está usando la pantalla. */
    readonly parausuario: string,
    /** Lo que va al log del servidor. Nunca se muestra. */
    readonly detalle?: unknown,
  ) {
    super(parausuario)
    this.name = 'ErrorPropuesta'
  }
}

export interface Uso {
  entrada: number
  salida: number
}

export async function estructurar(
  texto: string,
  plantilla: Plantilla,
  pistas: { cliente?: string; moneda?: string },
): Promise<{ propuesta: Propuesta; uso: Uso; modelo: string }> {
  const clave = process.env.OPENROUTER_API_KEY
  if (!clave) {
    throw new ErrorPropuesta(
      'sin_clave',
      'Falta configurar la clave de OpenRouter. Avisale a quien administra el sistema.',
    )
  }

  const respuesta = await fetch(URL_OPENROUTER, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${clave}`,
      'Content-Type': 'application/json',
      // OpenRouter los usa para atribuir el consumo en su panel. No viajan a
      // ningún otro lado.
      'HTTP-Referer': 'https://admin.digitalamenities.com.ar',
      'X-Title': 'Digital Amenities · Centro de Control',
    },
    body: JSON.stringify({
      model: MODELO,
      messages: [
        { role: 'system', content: SISTEMA },
        { role: 'user', content: mensajeUsuario(texto, plantilla, pistas) },
      ],
      max_tokens: 8000,
      // Es redacción con reglas duras, no creatividad: conviene que se pegue
      // al texto que le dieron.
      temperature: 0.3,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'propuesta',
          strict: true,
          schema: z.toJSONSchema(PropuestaSchema, { target: 'draft-2020-12' }),
        },
      },
    }),
  })

  if (!respuesta.ok) {
    const cuerpo = await respuesta.text().catch(() => '')
    if (respuesta.status === 401 || respuesta.status === 403) {
      throw new ErrorPropuesta(
        'sin_clave',
        'OpenRouter rechazó la clave. Hay que revisarla o recargar saldo.',
        cuerpo,
      )
    }
    if (respuesta.status === 429) {
      throw new ErrorPropuesta(
        'limite',
        'OpenRouter está limitando las consultas. Probá de nuevo en un minuto.',
        cuerpo,
      )
    }
    throw new ErrorPropuesta(
      'proveedor',
      'El servicio de IA no respondió bien. Probá de nuevo en un rato.',
      `${respuesta.status} ${cuerpo}`,
    )
  }

  const json = (await respuesta.json()) as {
    choices?: { message?: { content?: string } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number }
    error?: unknown
  }

  const contenido = json.choices?.[0]?.message?.content
  if (!contenido) {
    throw new ErrorPropuesta(
      'sin_estructura',
      'La IA no devolvió nada. Probá escribiendo qué se acordó con un poco más de detalle.',
      json.error ?? json,
    )
  }

  // Se revalida acá, y no se confía en `strict`. OpenRouter avisa que el
  // cumplimiento depende del proveedor que termine sirviendo el modelo:
  // algunos garantizan el esquema y otros lo traducen al suyo. Mejor un error
  // claro que un objeto a medias que reviente la pantalla tres pasos después.
  let crudo: unknown
  try {
    crudo = JSON.parse(contenido)
  } catch (e) {
    throw new ErrorPropuesta(
      'sin_estructura',
      'La IA devolvió algo que no se pudo leer. Probá de nuevo.',
      { e, contenido: contenido.slice(0, 500) },
    )
  }

  const validado = PropuestaSchema.safeParse(crudo)
  if (!validado.success) {
    throw new ErrorPropuesta(
      'sin_estructura',
      'La IA no pudo armar la propuesta con ese texto. Probá contando qué se acordó con un poco más de detalle.',
      validado.error.issues.slice(0, 5),
    )
  }

  return {
    propuesta: validado.data,
    uso: {
      entrada: json.usage?.prompt_tokens ?? 0,
      salida: json.usage?.completion_tokens ?? 0,
    },
    modelo: MODELO,
  }
}
