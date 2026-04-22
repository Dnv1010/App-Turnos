import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

// Cliente admin lazy — se inicializa solo cuando se usa (no en build time)
type SupabaseAdminClient = ReturnType<typeof createClient>;
let _supabaseAdmin: SupabaseAdminClient | null = null;
function getSupabaseAdmin(): SupabaseAdminClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return _supabaseAdmin;
}
export const supabaseAdmin = new Proxy({} as SupabaseAdminClient, {
  get(_, prop) {
    const client = getSupabaseAdmin();
    const val = (client as unknown as Record<string, unknown>)[prop as string];
    return typeof val === "function" ? (val as Function).bind(client) : val;
  },
});

export async function createServerSupabase() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // Puede fallar en middleware - ignorar
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // Puede fallar en middleware - ignorar
          }
        },
      },
    }
  )
}
