export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { supabaseAdmin } from '@/lib/supabase-server'
import { createServerSupabase } from '@/lib/supabase-server'
import bcrypt from 'bcryptjs'

/**
 * POST /api/auth/login
 * Autentica usuario con email + PIN, crea sesión en Supabase Auth.
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

    // 1. Verificar credenciales contra BD Prisma
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    })

    if (!user || !user.isActive || user.role === 'PENDIENTE') {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    if (!user.password) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    const valid = await bcrypt.compare(pin, user.password)
    if (!valid) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
    }

    // 2. Asegurar que el usuario existe en Supabase Auth
    const emailLower = email.toLowerCase()
    const userMeta = {
      userId: user.id,
      fullName: user.fullName,
      role: user.role,
      zone: user.zone,
      jobTitle: user.jobTitle,
    }

    // Intentar crear; si ya existe, actualizar metadata por ID
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: emailLower,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: userMeta,
    })

    if (createError) {
      // El usuario ya existe — buscarlo solo si realmente falló por duplicado
      if (!createError.message.toLowerCase().includes('already')) {
        console.error('[login] Error creando usuario en Supabase Auth:', createError)
        return NextResponse.json({ error: 'Error al crear sesión' }, { status: 500 })
      }
      // Buscar por email usando filter (una sola página, rápido)
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
      const existing = listData?.users?.find(u => u.email === emailLower)
      if (existing) {
        await supabaseAdmin.auth.admin.updateUserById(existing.id, { user_metadata: userMeta })
      }
    }

    // 3. Generar OTP y crear sesión (no depende de sincronizar contraseñas)
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: emailLower,
    })

    if (linkError || !linkData) {
      console.error('[login] Error generando OTP:', linkError)
      return NextResponse.json({ error: 'Error al iniciar sesión' }, { status: 500 })
    }

    const supabase = await createServerSupabase()
    const { data, error: signInError } = await supabase.auth.verifyOtp({
      email: emailLower,
      token: linkData.properties.email_otp,
      type: 'magiclink',
    })

    if (signInError) {
      console.error('[login] Error verificando OTP:', signInError)
      return NextResponse.json({ error: 'Error al iniciar sesión' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      user,
      session: data.session
    })

  } catch (error) {
    console.error('[login] Error:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
