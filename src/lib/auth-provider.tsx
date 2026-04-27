"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createBrowserClient } from './supabase'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'
import type { User as PrismaUser } from '@prisma/client'

interface AuthContextType {
  user: SupabaseUser | null
  session: Session | null
  profile: PrismaUser | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<PrismaUser | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createBrowserClient(), [])
  const loadedEmailRef = useRef<string | null>(null)

  useEffect(() => {
    // Obtener sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user?.email) {
        fetchProfile(session.user.email)
      } else {
        setLoading(false)
      }
    })

    // Escuchar cambios de autenticación
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Mantener siempre session/user actualizados — token refrescado debe quedar en el contexto
      setSession(newSession)
      setUser(newSession?.user ?? null)

      const newEmail = newSession?.user?.email ?? null

      // Sin sesión → logout
      if (!newEmail) {
        loadedEmailRef.current = null
        setProfile(null)
        setLoading(false)
        return
      }

      // Si ya cargamos el perfil de este mismo email, no recargar
      // (cubre TOKEN_REFRESHED, SIGNED_IN re-disparado al volver a la pestaña, INITIAL_SESSION, etc.)
      if (loadedEmailRef.current === newEmail) return

      // Usuario nuevo o cambio real de cuenta → recargar perfil
      setLoading(true)
      fetchProfile(newEmail)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(email: string) {
    try {
      const res = await fetch(`/api/usuarios?email=${encodeURIComponent(email)}`)
      if (res.ok) {
        const data = await res.json()
        const usersList = Array.isArray(data) ? data : (data.tecnicos ?? [])
        const found = usersList.find(
          (u: { email: string }) => u.email === email.toLowerCase()
        )
        if (found) {
          setProfile(found)
          loadedEmailRef.current = email
        }
      }
    } catch (error) {
      console.error('[AuthProvider] Error fetching profile:', error)
    } finally {
      setLoading(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setProfile(null)
    loadedEmailRef.current = null
  }

  const value = {
    user,
    session,
    profile,
    loading,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
