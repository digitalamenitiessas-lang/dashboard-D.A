import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Karla } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

// Brand typeface. Variable weight axis (200–800), so ExtraBold is available
// for display text without loading a second file.
const karla = Karla({
  subsets: ['latin'],
  variable: '--font-karla',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Digital Amenities · Centro de Control',
  description:
    'Dashboard interno de gestión de proyectos, clientes, cobros e infraestructura de Digital Amenities.',
  generator: 'v0.app',
  // Instalable en el celular. En iPhone no es un lujo: las notificaciones
  // push sólo existen con la app agregada a la pantalla de inicio.
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Digital A.',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0a0a0c',
  userScalable: true,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="es"
      className={`dark ${karla.variable} bg-background`}
    >
      <body className="font-sans antialiased">
        {children}
        <Toaster position="top-right" />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
