import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { RUTA_CAMBIAR_PASSWORD, needsPasswordChange } from '@/lib/auth'

/**
 * Refreshes the Supabase session on every request and gates the app:
 * anyone without a session is sent to /login.
 *
 * Y una segunda puerta: quien todavía usa la contraseña provisoria que le
 * pusieron a mano no pasa de la pantalla donde elige la suya. El corte va
 * ACÁ y no en un componente porque es lo único que lo hace de verdad
 * obligatorio: un cartel en el layout se saltea escribiendo la URL de
 * cualquier pantalla, el proxy corre antes de que exista pantalla alguna.
 *
 * Next 16 renamed this convention from `middleware` to `proxy`.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // Do not run code between createServerClient and getUser(): it refreshes
  // the auth token and skipping it logs users out at random.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isLoginRoute = pathname.startsWith('/login')
  const isPasswordRoute = pathname.startsWith(RUTA_CAMBIAR_PASSWORD)

  const irA = (destino: string) => {
    const url = request.nextUrl.clone()
    url.pathname = destino
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (!user) {
    return isLoginRoute ? response : irA('/login')
  }

  // Antes que cualquier otra cosa, incluso antes de sacarlo de /login: si
  // todavía no eligió contraseña propia, no hay ninguna otra pantalla a la
  // que pueda ir.
  if (needsPasswordChange(user)) {
    return isPasswordRoute ? response : irA(RUTA_CAMBIAR_PASSWORD)
  }

  // Al día con la contraseña, /cambiar-contrasena sigue siendo accesible a
  // propósito: es también la pantalla para cambiarla cuando uno quiere,
  // desde el menú del usuario.
  if (isLoginRoute) return irA('/')

  return response
}

export const config = {
  matcher: [
    /*
     * Every path except static assets and images.
     *
     * `sw.js` y `manifest.webmanifest` van excluidos explícitamente: no
     * terminan en ninguna de las extensiones de arriba, así que caían bajo
     * el portero y una request sin sesión se llevaba un redirect a /login en
     * vez del archivo. Con sesión funciona, y por eso pasaba desapercibido —
     * pero «Agregar a inicio» desde la pantalla de login no conseguía el
     * manifiesto, y en Android, que a diferencia de iOS sí lo necesita para
     * instalar, la instalación fallaba sin ningún error legible. Es
     * exactamente lo que hace cada persona nueva el primer día.
     *
     * Ninguno de los dos filtra nada: el manifiesto es público por
     * definición y el service worker no cachea (ver public/sw.js), sólo
     * recibe push y abre la pantalla al tocar el aviso.
     */
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
