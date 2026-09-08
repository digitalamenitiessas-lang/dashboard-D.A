import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { StoreProvider } from '@/lib/store'
import { createClient } from '@/lib/supabase/server'
import { RUTA_CAMBIAR_PASSWORD, needsPasswordChange } from '@/lib/auth'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // The middleware already gates this, but re-checking keeps the layout
  // honest if the matcher ever changes.
  if (!user) redirect('/login')

  // Y acá el rechequeo deja de ser sólo higiene: el matcher del proxy excluye
  // toda ruta terminada en .png/.svg/.jpg/etc para no gatear imágenes, y esa
  // exclusión también atrapa al segmento dinámico de /proyectos/[id]. Una URL
  // como /proyectos/algo.png no pasa por el portero, así que sin esta línea
  // alguien que todavía usa la contraseña provisoria llegaba a ver el shell
  // de la app entera.
  if (needsPasswordChange(user)) redirect(RUTA_CAMBIAR_PASSWORD)

  return (
    <StoreProvider>
      <AppShell userEmail={user.email ?? ''}>{children}</AppShell>
    </StoreProvider>
  )
}
