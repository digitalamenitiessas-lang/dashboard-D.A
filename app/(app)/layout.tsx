import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { StoreProvider } from '@/lib/store'
import { createClient } from '@/lib/supabase/server'

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

  return (
    <StoreProvider>
      <AppShell userEmail={user.email ?? ''}>{children}</AppShell>
    </StoreProvider>
  )
}
