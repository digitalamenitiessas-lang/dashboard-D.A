/**
 * Edge Function `enviar-push` — la única pieza que puede mandar un push.
 *
 * Firmar VAPID y cifrar el payload necesita la clave privada, y una clave
 * privada no puede vivir en el navegador. Por eso esto corre acá y no en
 * la app: Postgres encola en `notifications`, pg_cron le pega a esta
 * función cada minuto, y ella vacía la cola.
 *
 * No decide nada: no arma textos ni consulta el negocio. Lee la cola,
 * manda, marca. Toda la lógica de qué avisar está en el SQL, que es
 * donde se puede revisar sin deployar nada.
 *
 * Deploy:
 *   supabase functions deploy enviar-push --no-verify-jwt
 *
 * Va con --no-verify-jwt a propósito: quien la llama es pg_cron desde la
 * base, que no tiene un JWT de usuario. La autorización propia es el
 * PUSH_TOKEN de abajo.
 *
 * Secretos que necesita:
 *   supabase secrets set VAPID_PUBLIC_KEY=...
 *   supabase secrets set VAPID_PRIVATE_KEY=...
 *   supabase secrets set VAPID_SUBJECT=mailto:lbonilla@smt.gob.ar
 *   supabase secrets set PUSH_TOKEN=...
 */

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com'
const PUSH_TOKEN = Deno.env.get('PUSH_TOKEN') ?? ''

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Cuántos avisos se despachan por corrida. La cola sobrante espera al
 *  minuto siguiente: mejor eso que una función que se corta por timeout
 *  a la mitad y deja todo sin marcar. */
const LOTE = 20

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

interface Suscripcion {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

Deno.serve(async (req) => {
  // --- Autorización propia -------------------------------------------
  // Comparación de largo fijo para no filtrar el token por tiempo.
  const auth = req.headers.get('Authorization') ?? ''
  const enviado = auth.replace(/^Bearer\s+/i, '')
  if (!PUSH_TOKEN || enviado.length !== PUSH_TOKEN.length || enviado !== PUSH_TOKEN) {
    return new Response('no autorizado', { status: 401 })
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return Response.json(
      { error: 'Faltan las claves VAPID en los secretos de la función.' },
      { status: 500 },
    )
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  })

  // --- Qué hay para mandar -------------------------------------------
  const { data: pendientes, error: errCola } = await db
    .from('notifications')
    .select('id, title, body, url, attempts')
    .is('sent_at', null)
    .lt('attempts', 5)
    .order('created_at', { ascending: true })
    .limit(LOTE)

  if (errCola) return Response.json({ error: errCola.message }, { status: 500 })
  if (!pendientes?.length) return Response.json({ mandados: 0, celulares: 0 })

  const { data: subs, error: errSubs } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')

  if (errSubs) return Response.json({ error: errSubs.message }, { status: 500 })

  // Sin celulares suscriptos no hay nada que hacer, pero la cola se marca
  // igual: si no, el día que alguien se suscriba le entran de golpe todos
  // los avisos acumulados desde el principio de los tiempos.
  if (!subs?.length) {
    await db
      .from('notifications')
      .update({ sent_at: new Date().toISOString(), last_error: 'sin celulares suscriptos' })
      .in('id', pendientes.map((n) => n.id))
    return Response.json({ mandados: 0, celulares: 0, nota: 'no hay suscripciones' })
  }

  // --- Mandar ---------------------------------------------------------
  const caducadas = new Set<string>()
  let entregas = 0

  for (const aviso of pendientes) {
    const payload = JSON.stringify({
      title: aviso.title,
      body: aviso.body,
      url: aviso.url,
    })

    const resultados = await Promise.allSettled(
      (subs as Suscripcion[]).map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 * 24 },
        ),
      ),
    )

    let errores: string[] = []

    resultados.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        entregas++
        return
      }
      const status = (r.reason as { statusCode?: number })?.statusCode
      // 404/410 = el navegador dio de baja ese endpoint (app desinstalada,
      // permisos revocados). No es un error a reintentar: es una fila que
      // hay que borrar, o vamos a fallar contra ella para siempre.
      if (status === 404 || status === 410) {
        caducadas.add((subs as Suscripcion[])[i].id)
      } else {
        errores.push(`${status ?? '?'}: ${(r.reason as Error)?.message ?? 'error'}`)
      }
    })

    // Se marca como mandado si llegó al menos a un celular. Si no llegó a
    // ninguno por error real, se suma un intento y se reintenta al minuto.
    const llego = resultados.some((r) => r.status === 'fulfilled')
    if (llego || errores.length === 0) {
      await db
        .from('notifications')
        .update({
          sent_at: new Date().toISOString(),
          last_error: errores.length ? errores.join(' | ').slice(0, 500) : null,
        })
        .eq('id', aviso.id)
    } else {
      await db
        .from('notifications')
        .update({
          attempts: (aviso.attempts ?? 0) + 1,
          last_error: errores.join(' | ').slice(0, 500),
        })
        .eq('id', aviso.id)
    }
  }

  if (caducadas.size > 0) {
    await db.from('push_subscriptions').delete().in('id', [...caducadas])
  }

  return Response.json({
    avisos: pendientes.length,
    celulares: subs.length,
    entregas,
    dadasDeBaja: caducadas.size,
  })
})
