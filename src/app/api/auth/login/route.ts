import { NextRequest, NextResponse } from 'next/server'
import { authenticateWithPin } from '@/lib/auth-supabase'
import { createServerSupabase } from '@/lib/supabase-server'

/**
 * POST /api/auth/login
 * Autentica usuario con email + PIN
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, pin } = body

    if (!email || !pin) {
      return NextResponse.json(
        { error: 'Email y PIN son requeridos' },
        { status: 400 }
      )
    }

    // Autenticar con PIN contra tabla User
    const result = await authenticateWithPin(email, pin)

    if (!result) {
      return NextResponse.json(
        { error: 'Credenciales inválidas' },
        { status: 401 }
      )
    }

    // Crear sesión en Supabase
    const supabase = await createServerSupabase()

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password: pin
    })

    if (error) {
      // Si el usuario no existe en Supabase Auth, crearlo
      const { error: signUpError } = await supabase.auth.admin.createUser({
        email: email.toLowerCase(),
        password: pin,
        email_confirm: true,
        user_metadata: {
          userId: result.user.id,
          nombre: result.user.nombre,
          role: result.user.role,
          zona: result.user.zona,
          cargo: result.user.cargo,
        }
      })

      if (signUpError) {
        console.error('[login] Error creando usuario en Supabase:', signUpError)
        return NextResponse.json(
          { error: 'Error al crear sesión' },
          { status: 500 }
        )
      }

      // Intentar login de nuevo
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(),
        password: pin
      })

      if (loginError) {
        return NextResponse.json(
          { error: 'Error al iniciar sesión' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        user: result.user,
        session: loginData.session
      })
    }

    return NextResponse.json({
      success: true,
      user: result.user,
      session: data.session
    })
  } catch (error) {
    console.error('[login] Error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
