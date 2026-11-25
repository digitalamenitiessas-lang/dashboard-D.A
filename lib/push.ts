'use client'

/**
 * Alta y baja de un celular en las notificaciones push.
 *
 * Cada dispositivo que acepta queda como una fila en `push_subscriptions`
 * a nombre de quien tenía la sesión abierta. Los avisos para todos (cobros,
 * caja, mantenimiento) van a todos los dispositivos; los personales
 * (recordatorios de tareas), sólo a los de esa persona.
 *
 * En iPhone esto sólo funciona con la app agregada a la pantalla de
 * inicio. No es una limitación nuestra: Safari no expone la API de push
 * a una pestaña común. Por eso `pushSupport()` distingue "no se puede"
 * de "todavía falta instalarla", que son dos mensajes muy distintos
 * para el que está mirando la pantalla.
 */

import { createClient } from './supabase/client'

export type PushSupport =
  | { ok: true }
  | { ok: false; reason: 'instalar-en-inicio' | 'no-soportado' | 'sin-clave' }

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

/** ¿Está corriendo como app instalada y no como pestaña del navegador? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // El de iOS, que no implementa display-mode.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ se hace pasar por Mac; el touch lo delata.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return { ok: false, reason: 'no-soportado' }
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: 'sin-clave' }

  const hasApi =
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  if (!hasApi) {
    // En iOS la API aparece recién con la app instalada, así que la
    // ausencia acá casi siempre significa "falta agregarla al inicio".
    return { ok: false, reason: isIos() && !isStandalone() ? 'instalar-en-inicio' : 'no-soportado' }
  }

  return { ok: true }
}

/** El formato que pide PushManager: base64url -> Uint8Array. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function keyToBase64(key: ArrayBuffer | null): string {
  if (!key) return ''
  return btoa(String.fromCharCode(...new Uint8Array(key)))
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch (e) {
    console.error('[push] no se pudo registrar el service worker:', e)
    return null
  }
}

/** ¿Este dispositivo ya está suscripto? */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration('/')
  if (!reg) return null
  return reg.pushManager.getSubscription()
}

export interface ActivateResult {
  ok: boolean
  /** Para mostrarle al usuario por qué no se pudo. */
  message?: string
}

/**
 * Pide permiso, se suscribe y guarda la suscripción en la base.
 *
 * El `upsert` va por `endpoint`, que es la identidad real del
 * dispositivo: si el mismo celular vuelve a activar, se actualiza la
 * fila en vez de acumular duplicados y recibir el aviso dos veces.
 */
export async function activatePush(label = ''): Promise<ActivateResult> {
  const support = pushSupport()
  if (!support.ok) {
    const messages: Record<string, string> = {
      'instalar-en-inicio':
        'En iPhone hay que agregar la app a la pantalla de inicio primero: Compartir → Agregar a inicio.',
      'no-soportado': 'Este navegador no soporta notificaciones push.',
      'sin-clave': 'Falta configurar NEXT_PUBLIC_VAPID_PUBLIC_KEY.',
    }
    return { ok: false, message: messages[support.reason] }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return {
      ok: false,
      message:
        permission === 'denied'
          ? 'Bloqueaste las notificaciones para este sitio. Hay que habilitarlas desde los ajustes del navegador.'
          : 'No se dio permiso para notificar.',
    }
  }

  const reg = (await navigator.serviceWorker.getRegistration('/')) ?? (await registerServiceWorker())
  if (!reg) return { ok: false, message: 'No se pudo registrar el service worker.' }
  await navigator.serviceWorker.ready

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  const error = await guardarSuscripcion(sub, { label })
  if (error) {
    console.error('[push] no se pudo guardar la suscripción:', error)
    return { ok: false, message: error }
  }

  return { ok: true }
}

/**
 * Guarda (o actualiza) la fila del dispositivo, con su dueño.
 *
 * El dueño importa desde el paso 28: los recordatorios de tareas van sólo
 * a los celulares de la persona responsable. Sin `user_id`, el celular
 * sigue recibiendo los avisos para todos pero nunca uno personal.
 *
 * `label` se manda sólo si viene: el upsert actualiza únicamente las
 * columnas que recibe, así que vincular no le borra la etiqueta a nadie.
 */
async function guardarSuscripcion(
  sub: PushSubscription,
  extra: { label?: string } = {},
): Promise<string | null> {
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  const json = sub.toJSON()
  const fila = {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? keyToBase64(sub.getKey('p256dh')),
    auth: json.keys?.auth ?? keyToBase64(sub.getKey('auth')),
    user_agent: navigator.userAgent.slice(0, 300),
    last_seen_at: new Date().toISOString(),
    ...(extra.label !== undefined ? { label: extra.label } : {}),
  }
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ ...fila, user_id: data.user?.id ?? null }, { onConflict: 'endpoint' })

  // Una base sin el paso 28 no tiene la columna `user_id`. El celular se
  // guarda igual, sin dueño, en vez de dejar a alguien sin avisos: así
  // desplegar la app antes de correr el SQL no rompe nada.
  if (error && /user_id/.test(error.message)) {
    const reintento = await supabase
      .from('push_subscriptions')
      .upsert(fila, { onConflict: 'endpoint' })
    return reintento.error ? reintento.error.message : null
  }
  return error ? error.message : null
}

/**
 * Si este dispositivo ya tenía los avisos activados, lo deja a nombre de
 * quien tiene la sesión abierta. Se llama al abrir la app: así los
 * celulares suscriptos antes del paso 28 se vinculan solos, y un celular
 * que cambia de mano pasa a recibir los avisos de su nuevo dueño.
 *
 * Silencioso a propósito: si falla, el celular sigue recibiendo los
 * avisos para todos, y no hay nada que el usuario pueda hacer al respecto.
 */
export async function vincularDispositivo(): Promise<void> {
  try {
    const sub = await currentSubscription()
    if (!sub) return
    const error = await guardarSuscripcion(sub)
    if (error) console.warn('[push] no se pudo vincular el dispositivo:', error)
  } catch (e) {
    console.warn('[push] no se pudo vincular el dispositivo:', e)
  }
}

/** Baja: se cancela en el navegador y se borra la fila. */
export async function deactivatePush(): Promise<ActivateResult> {
  const sub = await currentSubscription()
  if (!sub) return { ok: true }

  const endpoint = sub.endpoint
  await sub.unsubscribe()

  const supabase = createClient()
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)

  if (error) {
    console.error('[push] no se pudo borrar la suscripción:', error)
    return { ok: false, message: error.message }
  }
  return { ok: true }
}
