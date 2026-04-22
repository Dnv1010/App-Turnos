import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Rutas protegidas por sesión
  const protectedPaths = [
    '/tecnico',
    '/coordinador',
    '/coordinador-interior',
    '/admin',
    '/manager',
    '/supply',
  ]

  const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path))

  if (isProtectedPath && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Verificación de rol: cada ruta solo es accesible por su rol correspondiente
  if (user) {
    const role: string = user.user_metadata?.role ?? ''

    const roleRouteMap: Record<string, string[]> = {
      TECNICO: ['/tecnico'],
      COORDINADOR: ['/coordinador'],
      COORDINADOR_INTERIOR: ['/coordinador', '/coordinador-interior'],
      MANAGER: ['/manager'],
      ADMIN: ['/admin', '/tecnico', '/coordinador', '/coordinador-interior', '/manager', '/supply'],
      SUPPLY: ['/supply'],
    }

    const allowedPrefixes = roleRouteMap[role] ?? []
    const isRoleRestricted = isProtectedPath && allowedPrefixes.length > 0
    const hasAccess = allowedPrefixes.some(prefix => pathname.startsWith(prefix))

    if (isRoleRestricted && !hasAccess) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
