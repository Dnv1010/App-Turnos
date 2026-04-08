import { supabaseAdmin } from './supabase'
import { prisma } from './prisma'
import bcrypt from 'bcryptjs'
import type { User } from '@prisma/client'

/**
 * Autentica usuario con PIN verificando contra tabla User de Prisma
 * y crea sesión en Supabase Auth usando service role
 *
 * @param email - Email del usuario
 * @param pin - PIN de 6 dígitos
 * @returns Usuario si autenticación exitosa, null si falla
 */
export async function authenticateWithPin(
  email: string,
  pin: string
): Promise<{ user: User; token: string } | null> {
  try {
    // 1. Buscar usuario en tabla User (Prisma)
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    })

    if (!user || !user.isActive || user.role === 'PENDIENTE') {
      return null
    }

    // 2. Verificar PIN con bcrypt
    if (!user.password) {
      console.warn('[auth-supabase] Usuario sin contraseña:', user.email)
      return null
    }

    const valid = await bcrypt.compare(pin, user.password)
    if (!valid) {
      return null
    }

    // 3. Crear o actualizar usuario en Supabase Auth
    const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: user.email,
      email_confirm: true,
      user_metadata: {
        userId: user.id,
        nombre: user.nombre,
        role: user.role,
        zona: user.zona,
        cargo: user.cargo,
      }
    })

    if (createError) {
      // Si ya existe, actualizar metadata
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
      const existingUser = existingUsers?.users.find(u => u.email === user.email)

      if (existingUser) {
        await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
          user_metadata: {
            userId: user.id,
            nombre: user.nombre,
            role: user.role,
            zona: user.zona,
            cargo: user.cargo,
          }
        })
      } else {
        console.error('[auth-supabase] Error creando usuario en Supabase:', createError)
        return null
      }
    }

    // 4. Generar token de sesión
    const userId = authUser?.user?.id || existingUser?.id
    if (!userId) {
      return null
    }

    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
    })

    if (sessionError) {
      console.error('[auth-supabase] Error generando sesión:', sessionError)
      return null
    }

    return {
      user,
      token: sessionData.properties.hashed_token || ''
    }
  } catch (err) {
    console.error('[auth-supabase] Error en authenticateWithPin:', err)
    return null
  }
}

/**
 * Obtiene perfil de usuario desde tabla User de Prisma
 * basado en el email del usuario autenticado en Supabase
 *
 * @param email - Email del usuario autenticado en Supabase
 * @returns Perfil del usuario con role, zona, etc.
 */
export async function getUserProfile(email: string): Promise<User | null> {
  try {
    const profile = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    })

    if (!profile || !profile.isActive) {
      return null
    }

    return profile
  } catch (err) {
    console.error('[auth-supabase] Error obteniendo perfil:', err)
    return null
  }
}

/**
 * Crea usuario pendiente para Google SSO
 * Mismo flujo que NextAuth signIn callback
 */
export async function createPendingGoogleUser(userData: {
  name?: string | null;
  email?: string | null;
}): Promise<User | null> {
  const emailNorm = userData.email!.toLowerCase();
  const local = emailNorm.split("@")[0]?.replace(/[^\w.-]/g, "") || "usuario";
  const nombre = (userData.name?.trim() || local) as string;

  try {
    const user = await prisma.user.create({
      data: {
        cedula: local.length > 80 ? local.slice(0, 80) : local,
        nombre,
        email: emailNorm,
        password: "",
        role: "PENDIENTE",
        isActive: false,
      },
    });

    return user;
  } catch (error) {
    console.error('[auth-supabase] Error creando usuario pendiente:', error);
    return null;
  }
}
