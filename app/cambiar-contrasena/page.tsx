import { redirect } from 'next/navigation'
import { ChangePasswordForm } from '@/components/auth/change-password-form'
import { createClient } from '@/lib/supabase/server'
import { needsPasswordChange } from '@/lib/auth'

/**
 * Vive fuera del grupo `(app)` a propósito, igual que /login: sin barra
 * lateral ni campana. Quien todavía no eligió contraseña no debería ver el
 * menú de una app en la que aún no puede entrar.
 *
 * El usuario se lee acá, en el servidor, y no en el cliente: leerlo en el
 * cliente haría que la pantalla apareciera primero en su versión voluntaria
 * —con el botón «Volver» a la vista— y recién después se corrigiera a la
 * obligatoria. Ese parpadeo es justo el botón que no tiene que existir.
 */
export default async function CambiarContrasenaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // El proxy ya lo gatea, pero rechequear mantiene honesta la página si el
  // matcher alguna vez cambia.
  if (!user) redirect('/login')

  return (
    <ChangePasswordForm
      email={user.email ?? ''}
      forzado={needsPasswordChange(user)}
    />
  )
}
