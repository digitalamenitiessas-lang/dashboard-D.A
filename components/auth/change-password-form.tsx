'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, KeyRound, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { BrandMark } from '@/components/layout/brand-mark'
import { createClient } from '@/lib/supabase/client'
import { PASSWORD_MIN, passwordChangedMetadata } from '@/lib/auth'

/**
 * Los errores de Supabase que una persona va a ver de verdad acá, en
 * castellano. El resto pasa crudo: inventarle una explicación a algo que no
 * conocemos es peor que mostrar el texto original.
 *
 * El orden de las ramas importa. GoTrue usa la frase «at least» en DOS
 * mensajes distintos —«Password should be at least N characters» y «Password
 * should contain at least one character of each: abc…, ABC…, 0123…»— así que
 * la de requisitos de caracteres tiene que mirarse ANTES. Con el orden al
 * revés, alguien con «Password Requirements» activado en el panel escribía
 * una contraseña larguísima, leía «es muy corta», la hacía más larga, volvía
 * a fallar, y quedaba trabado en la pantalla forzada sin forma de salir.
 */
function enCriollo(error: unknown): string {
  const crudo =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''
  const m = crudo.toLowerCase()

  // Sin red o Supabase caído. Es el fallo más común de todos y llega como
  // `AuthRetryableFetchError`, cuyo mensaje es «Failed to fetch» en Chrome y
  // «Load failed» en Safari — y en un 5xx puede venir directamente vacío.
  const nombre = (error as { name?: string })?.name ?? ''
  if (
    !crudo ||
    nombre === 'AuthRetryableFetchError' ||
    m.includes('failed to fetch') ||
    m.includes('load failed') ||
    m.includes('networkerror') ||
    m.includes('network request failed')
  ) {
    return 'No se pudo conectar. Fijate la señal y probá de nuevo — no se cambió nada.'
  }

  if (m.includes('should be different')) {
    return 'Esa es la contraseña que ya tenés. Elegí una distinta.'
  }
  // Antes que la de longitud, por lo dicho arriba.
  if (m.includes('contain at least one character')) {
    return 'Esta cuenta pide una mezcla de mayúsculas, minúsculas y números. Agregá lo que falte.'
  }
  if (m.includes('at least') || m.includes('too short')) {
    return `La contraseña es muy corta: tiene que tener al menos ${PASSWORD_MIN} caracteres.`
  }
  // El mensaje real de HaveIBeenPwned no dice «pwned» en ningún lado: las
  // palabras `pwned`/`leaked` viven en el array `reasons` de
  // `AuthWeakPasswordError`, no en el texto. Se matchea por el texto real.
  if (
    m.includes('weak and easy to guess') ||
    m.includes('easy to guess') ||
    (error as { name?: string })?.name === 'AuthWeakPasswordError'
  ) {
    return 'Esa contraseña es demasiado fácil de adivinar o apareció en filtraciones de otros sitios. Elegí otra.'
  }
  if (m.includes('session') || m.includes('jwt') || m.includes('token')) {
    return 'Se venció la sesión. Volvé a entrar y probá de nuevo.'
  }
  return crudo
}

/**
 * Una sola pantalla para los dos casos, y por eso `forzado`:
 *
 * - Primer ingreso: la persona entró con la contraseña provisoria que le
 *   pasaron por mensaje. No hay botón de volver ni link a ningún lado —
 *   el proxy la trae de vuelta acá desde cualquier otra URL — pero sí puede
 *   cerrar sesión, porque quedarse encerrado sin salida es peor que la
 *   contraseña provisoria.
 * - Después: es la pantalla de «cambiar mi contraseña» del menú del usuario,
 *   con su botón de volver.
 */
export function ChangePasswordForm({
  email,
  forzado,
}: {
  email: string
  forzado: boolean
}) {
  const router = useRouter()
  const [password, setPassword] = React.useState('')
  const [repeat, setRepeat] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  const corta = password.length > 0 && password.length < PASSWORD_MIN
  const noCoincide = repeat.length > 0 && password !== repeat
  const listo = password.length >= PASSWORD_MIN && password === repeat

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!listo || loading) return
    setError(null)
    setLoading(true)

    // El try/catch no es decorativo: `updateUser` devuelve el error por
    // valor sólo cuando es un `AuthError`; cualquier otra cosa la relanza, y
    // `createClient()` tira sincrónicamente si faltan las variables de
    // entorno en el bundle. Sin esto, `setLoading(false)` no corría nunca y
    // el botón quedaba en «Guardando...» para siempre — en el modo forzado,
    // sin más salida que recargar a mano.
    try {
      const supabase = createClient()
      // La contraseña y la marca viajan en la MISMA llamada a propósito: en
      // dos pasos, un fallo entre medio dejaría la contraseña ya cambiada y
      // al usuario todavía marcado como pendiente, y la pantalla se lo
      // volvería a pedir para siempre con una contraseña que ya es la buena.
      const { error } = await supabase.auth.updateUser({
        password,
        data: passwordChangedMetadata(),
      })

      if (error) {
        setError(enCriollo(error))
        setLoading(false)
        return
      }
    } catch (e) {
      setError(enCriollo(e))
      setLoading(false)
      return
    }

    // En el modo forzado el cambio de pantalla ya es el acuse de recibo. En
    // el voluntario no: volver al dashboard se ve igual que haber tocado
    // «Volver», y la única forma de saber si se guardó sería cerrar sesión y
    // probar.
    if (!forzado) {
      toast.success('Contraseña actualizada', {
        description: 'La próxima vez que entres, usá la nueva.',
      })
    }

    // `refresh` además de `replace`: el proxy vuelve a leer el usuario y ahí
    // es donde se entera de que la marca ya está puesta.
    router.replace('/')
    router.refresh()
  }

  async function cerrarSesion() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  // Los cuatro insets van separados: con px/py el hueco de la izquierda se
  // aplicaba también a la derecha, así que al girar el teléfono para el otro
  // lado el aire quedaba del lado que no tiene muesca.
  return (
    <main className="flex min-h-svh items-center justify-center pt-[calc(2.5rem+env(safe-area-inset-top))] pr-[calc(1rem+env(safe-area-inset-right))] pb-[calc(2.5rem+env(safe-area-inset-bottom))] pl-[calc(1rem+env(safe-area-inset-left))]">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <BrandMark className="h-7 text-foreground" />
          </span>
          <h1 className="mt-4 font-display text-xl font-extrabold tracking-tight text-balance">
            {forzado ? 'Elegí tu contraseña' : 'Cambiar contraseña'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            {forzado
              ? 'Estás usando la contraseña provisoria con la que te dieron de alta. Elegí una tuya para seguir.'
              : email}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass rounded-2xl p-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cp-password">Contraseña nueva</FieldLabel>
              <Input
                id="cp-password"
                type="password"
                autoComplete="new-password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                aria-describedby="cp-ayuda"
              />
              <p
                id="cp-ayuda"
                className={
                  corta
                    ? 'text-xs text-amber-300'
                    : 'text-xs text-muted-foreground'
                }
              >
                Al menos {PASSWORD_MIN} caracteres.
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor="cp-repeat">Repetila</FieldLabel>
              <Input
                id="cp-repeat"
                type="password"
                autoComplete="new-password"
                required
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                placeholder="••••••••"
                aria-invalid={noCoincide || undefined}
                aria-describedby={noCoincide ? 'cp-repeat-error' : undefined}
              />
              {/* Asociado al input y con `role="alert"`: si no, con VoiceOver
                  el formulario simplemente no se envía y no se anuncia nada,
                  porque el botón está deshabilitado y el aviso queda suelto
                  en el árbol. */}
              {noCoincide ? (
                <p
                  id="cp-repeat-error"
                  role="alert"
                  className="text-xs text-amber-300"
                >
                  Las dos no coinciden.
                </p>
              ) : null}
            </Field>
          </FieldGroup>

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-300 text-pretty"
            >
              {error}
            </p>
          ) : null}

          <Button type="submit" className="mt-6 w-full" disabled={loading || !listo}>
            {loading ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              <KeyRound data-icon="inline-start" />
            )}
            {loading ? 'Guardando...' : 'Guardar y entrar'}
          </Button>

          {forzado ? null : (
            <Button
              variant="ghost"
              className="mt-2 w-full"
              nativeButton={false}
              render={<Link href="/" />}
            >
              <ArrowLeft data-icon="inline-start" />
              Volver
            </Button>
          )}
        </form>

        {forzado ? (
          <div className="mt-6 flex flex-col items-center gap-2 text-center">
            <p className="text-xs text-muted-foreground text-pretty">
              Entraste como {email}.
            </p>
            {/* La única salida que no es cambiar la contraseña. Sin esto,
                alguien que entró con la cuenta equivocada queda encerrado. */}
            <Button variant="ghost" size="sm" onClick={() => void cerrarSesion()}>
              Cerrar sesión
            </Button>
          </div>
        ) : null}
      </div>
    </main>
  )
}
