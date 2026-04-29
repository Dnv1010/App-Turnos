export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { Role, Zone, JobTitle } from "@prisma/client";
import type { User } from "@prisma/client";
import bcrypt from "bcryptjs";

async function verificarAdmin(): Promise<User | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await getUserProfile(user.email!);
  if (!profile || profile.role !== "ADMIN") return null;
  return profile;
}

const ROLES: Role[] = ["ADMIN", "MANAGER", "COORDINADOR", "COORDINADOR_INTERIOR", "TECNICO", "SUPPLY"];
const ZONAS: Zone[] = ["BOGOTA", "COSTA", "INTERIOR"];
const FILTROS_EQUIPO = ["TODOS", "TECNICO", "ALMACENISTA"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verificarAdmin();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }

  const { fullName, email, documentNumber, pin, role, zone, isActive, jobTitle, teamFilter } = body;

  const data: {
    fullName?: string;
    email?: string;
    documentNumber?: string;
    password?: string;
    role?: Role;
    zone?: Zone;
    isActive?: boolean;
    jobTitle?: JobTitle;
    teamFilter?: string;
  } = {};

  if (typeof fullName === "string" && fullName.trim()) data.fullName = fullName.trim();
  if (typeof email === "string" && email.trim()) data.email = email.trim().toLowerCase();
  if (typeof documentNumber === "string" && documentNumber.trim()) data.documentNumber = documentNumber.trim();
  if (typeof pin === "string" && pin.trim() !== "") {
    const pinStr = pin.trim();
    if (pinStr.length !== 4) {
      return NextResponse.json({ error: "El PIN debe tener 4 dígitos" }, { status: 400 });
    }
    data.password = await bcrypt.hash(pinStr, 10);
  }
  if (typeof role === "string" && ROLES.includes(role as Role)) data.role = role as Role;
  if (typeof zone === "string" && ZONAS.includes(zone as Zone)) data.zone = zone as Zone;
  if (typeof isActive === "boolean") data.isActive = isActive;
  if (typeof jobTitle === "string" && Object.values(JobTitle).includes(jobTitle as JobTitle)) data.jobTitle = jobTitle as JobTitle;
  if (typeof teamFilter === "string" && FILTROS_EQUIPO.includes(teamFilter as (typeof FILTROS_EQUIPO)[number])) {
    data.teamFilter = teamFilter;
  }

  try {
    const usuario = await prisma.user.update({ where: { id }, data });
    return NextResponse.json({
      ok: true,
      user: usuario,
    });
  } catch (e) {
    console.error("[admin usuarios PATCH]", e);
    return NextResponse.json({ error: "Error al actualizar usuario" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verificarAdmin();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  try {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    if (target.role === "PENDIENTE") {
      // Eliminar completamente usuarios pendientes
      await prisma.user.delete({ where: { id } });
    } else {
      // Solo desactivar usuarios con rol asignado
      await prisma.user.update({
        where: { id },
        data: { isActive: false },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin usuarios DELETE]", e);
    return NextResponse.json({ error: "Error al eliminar usuario" }, { status: 500 });
  }
}
