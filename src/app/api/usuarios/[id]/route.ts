export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import bcrypt from "bcryptjs";
import { JobTitle, Zone } from "@prisma/client";

const FILTROS_EQUIPO = ["TODOS", "TECNICO", "ALMACENISTA"] as const;

const selectUsuario = {
  id: true,
  documentNumber: true,
  fullName: true,
  email: true,
  role: true,
  zone: true,
  isActive: true,
  jobTitle: true,
  teamFilter: true,
} as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const profile = await getUserProfile(user.email!);
  if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const body = await req.json();
  const { fullName, email, pin, jobTitle, teamFilter, zone: bodyZone } = body;

  const isCoordSelf =
    profile.id === id &&
    (profile.role === "COORDINADOR" ||
      profile.role === "COORDINADOR_INTERIOR" ||
      profile.role === "SUPPLY");

  if (isCoordSelf) {
    if (fullName != null || email != null || pin != null || jobTitle != null) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (teamFilter == null || typeof teamFilter !== "string") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (!FILTROS_EQUIPO.includes(teamFilter as (typeof FILTROS_EQUIPO)[number])) {
      return NextResponse.json({ error: "teamFilter inválido" }, { status: 400 });
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { teamFilter },
      select: selectUsuario,
    });
    return NextResponse.json(updated);
  }

  if (profile.role === "COORDINADOR") {
    if (target.role !== "TECNICO" || target.zone !== profile.zone) {
      return NextResponse.json({ error: "Solo puedes editar operadores de tu zona" }, { status: 403 });
    }
  } else if (profile.role === "SUPPLY") {
    if (target.role !== "TECNICO" || target.jobTitle !== "ALMACENISTA") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  } else if (profile.role !== "ADMIN" && profile.role !== "MANAGER") {
    return NextResponse.json({ error: "Sin permisos para editar usuarios" }, { status: 403 });
  }

  const data: {
    fullName?: string;
    email?: string;
    password?: string;
    jobTitle?: JobTitle;
    teamFilter?: string;
    zone?: Zone;
  } = {};
  if (fullName != null) data.fullName = fullName;
  if (email != null) {
    const lower = (email as string).toLowerCase();
    const existing = await prisma.user.findFirst({ where: { email: lower, NOT: { id } } });
    if (existing) return NextResponse.json({ error: "El correo ya está en uso" }, { status: 400 });
    data.email = lower;
  }
  if (pin != null && String(pin).trim() !== "")
    data.password = await bcrypt.hash(String(pin).trim(), 10);
  if (jobTitle != null) {
    if (typeof jobTitle !== "string" || !Object.values(JobTitle).includes(jobTitle as JobTitle)) {
      return NextResponse.json({ error: "jobTitle inválido" }, { status: 400 });
    }
    if (profile.role === "SUPPLY" && (jobTitle as JobTitle) !== JobTitle.ALMACENISTA) {
      return NextResponse.json({ error: "Solo puedes mantener jobTitle Almacenista" }, { status: 400 });
    }
    data.jobTitle = jobTitle as JobTitle;
  }
  if (teamFilter != null) {
    if (typeof teamFilter !== "string" || !FILTROS_EQUIPO.includes(teamFilter as (typeof FILTROS_EQUIPO)[number])) {
      return NextResponse.json({ error: "teamFilter inválido" }, { status: 400 });
    }
    data.teamFilter = teamFilter;
  }
  if (bodyZone != null && profile.role === "SUPPLY") {
    if (typeof bodyZone !== "string" || !Object.values(Zone).includes(bodyZone as Zone)) {
      return NextResponse.json({ error: "zone inválida" }, { status: 400 });
    }
    data.zone = bodyZone as Zone;
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: selectUsuario,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const profile = await getUserProfile(user.email!);
  if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  if (["COORDINADOR", "MANAGER", "ADMIN"].includes(target.role)) {
    return NextResponse.json({ error: "No se puede desactivar coordinadores, managers ni administradores" }, { status: 400 });
  }

  if (profile.role === "COORDINADOR") {
    if (target.zone !== profile.zone) {
      return NextResponse.json({ error: "Solo puedes desactivar operadores de tu zona" }, { status: 403 });
    }
  } else if (profile.role === "SUPPLY") {
    if (target.jobTitle !== "ALMACENISTA") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  } else if (profile.role !== "ADMIN") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  await prisma.user.update({
    where: { id },
    data: { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
