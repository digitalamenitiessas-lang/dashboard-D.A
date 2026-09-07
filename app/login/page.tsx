'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { BrandMark } from '@/components/layout/brand-mark'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'Email o contraseña incorrectos.'
          : error.message,
      )
      setLoading(false)
      return
    }

    // Full reload so the middleware picks up the fresh session cookie.
    router.replace('/')
    router.refresh()
  }

  // Los cuatro insets van separados: con px/py el hueco de la izquierda
  // se aplicaba también a la derecha, así que al girar el teléfono para
  // el otro lado el aire quedaba del lado que no tiene muesca.
  return (
    <main className="flex min-h-svh items-center justify-center pt-[calc(2.5rem+env(safe-area-inset-top))] pr-[calc(1rem+env(safe-area-inset-right))] pb-[calc(2.5rem+env(safe-area-inset-bottom))] pl-[calc(1rem+env(safe-area-inset-left))]">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <BrandMark className="h-7 text-foreground" />
          </span>
          <h1 className="mt-4 font-display text-xl font-extrabold tracking-tight">
            Digital Amenities
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Centro de Control
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass rounded-2xl p-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="login-email">Email</FieldLabel>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vos@digitalamenities.com"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="login-password">Contraseña</FieldLabel>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
          </FieldGroup>

          {error ? (
            <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            className="mt-6 w-full"
            disabled={loading || !email || !password}
          >
            {loading ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              <LogIn data-icon="inline-start" />
            )}
            {loading ? 'Ingresando...' : 'Ingresar'}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground text-pretty">
          Acceso restringido al equipo de Digital Amenities.
        </p>
      </div>
    </main>
  )
}
