"use client";

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase'

export default function AuthCallbackPage() {
  const router = useRouter()
  const supabase = useMemo(() => createBrowserClient(), [])

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Obtener el hash de la URL (para OAuth)
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get('access_token')

        if (accessToken) {
          // OAuth callback - Supabase ya maneja la sesión
          const { data: { session } } = await supabase.auth.getSession()

          if (session) {
            router.push('/')
          } else {
            router.push('/login?error=session')
          }
        } else {
          // PIN login ya tiene sesión por cookie - ir directo a home
          const { data: { session } } = await supabase.auth.getSession()
          if (session) {
            router.push('/')
          } else {
            router.push('/login')
          }
        }
      } catch (error) {
        console.error('[callback] Error:', error)
        router.push('/login?error=callback')
      }
    }

    handleCallback()
  }, [router, supabase])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Autenticando...</h2>
        <p className="text-gray-600">Por favor espera un momento</p>
      </div>
    </div>
  )
}
