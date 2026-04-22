import { createBrowserClient } from '@supabase/ssr'

// Cliente para browser - usa cookies (mismo storage que el servidor)
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Alias para compatibilidad
export { createBrowserSupabaseClient as createBrowserClient }
