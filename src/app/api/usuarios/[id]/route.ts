export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import bcrypt from "bcryptjs";
import { Cargo, Zona } from "@prisma/client";

const FILTROS_EQUIPO = ["TODOS", "TECNICO", "ALMACENISTA"] as const;

const selectUsuario = {
  id: true,
  cedula: true,
  nombre: true,
  email: true,
  role: true,
  zona: true,
  isActive: true,
  cargo: true,
  filtroEquipo: true,
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
  const { nombre, email, pin, cargo, filtroEquipo, zona: bodyZona } = body;

  const isCoordSelf =
    profile.id === id &&
    (profile.role === "COORDINADOR" ||
      profile.role === "COORDINADOR_INTERIOR" ||
      profile.role === "SUPPLY");

  if (isCoordSelf) {
    if (nombre != null || email != null || pin != null || cargo != null) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (filtroEquipo == null || typeof filtroEquipo !== "string") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (!FILTROS_EQUIPO.includes(filtroEquipo as (typeof FILTROS_EQUIPO)[number])) {
      return NextResponse.json({ error: "filtroEquipo inválido" }, { status: 400 });
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { filtroEquipo },
      select: selectUsuario,
    });
    return NextResponse.json(updated);
  }

  if (profile.role === "COORDINADOR") {
    if (target.role !== "TECNICO" || target.zona !== profile.zona) {
      return NextResponse.json({ error: "Solo puedes editar operadores de tu zona" }, { status: 403 });
    }
  } else if (profile.role === "SUPPLY") {
    if (target.role !== "TECNICO" || target.cargo !== "ALMACENISTA") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  } else if (profile.role !== "ADMIN" && profile.role !== "MANAGER") {
    return NextResponse.json({ error: "Sin permisos para editar usuarios" }, { status: 403 });
  }

  const data: {
    nombre?: string;
    email?: string;
    password?: string;
    cargo?: Cargo;
    filtroEquipo?: string;
    zona?: Zona;
  } = {};
  if (nombre != null) data.nombre = nombre;
  if (email != null) {
    const lower = (email as string).toLowerCase();
    const existing = await prisma.user.findFirst({ where: { email: lower, NOT: { id } } });
    if (existing) return NextResponse.json({ error: "El correo ya está en uso" }, { status: 400 });
    data.email = lower;
  }
  if (pin != null && String(pin).trim() !== "")
    data.password = await bcrypt.hash(String(pin).trim(), 10);
  if (cargo != null) {
    if (typeof cargo !== "string" || !Object.values(Cargo).includes(cargo as Cargo)) {
      return NextResponse.json({ error: "cargo inválido" }, { status: 400 });
    }
    if (profile.role === "SUPPLY" && (cargo as Cargo) !== Cargo.ALMACENISTA) {
      return NextResponse.json({ error: "Solo puedes mantener cargo Almacenista" }, { status: 400 });
    }
    data.cargo = cargo as Cargo;
  }
  if (filtroEquipo != null) {
    if (typeof filtroEquipo !== "string" || !FILTROS_EQUIPO.includes(filtroEquipo as (typeof FILTROS_EQUIPO)[number])) {
      return NextResponse.json({ error: "filtroEquipo inválido" }, { status: 400 });
    }
    data.filtroEquipo = filtroEquipo;
  }
  if (bodyZona != null && profile.role === "SUPPLY") {
    if (typeof bodyZona !== "string" || !Object.values(Zona).includes(bodyZona as Zona)) {
      return NextResponse.json({ error: "zona inválida" }, { status: 400 });
    }
    data.zona = bodyZona as Zona;
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
    if (target.zona !== profile.zona) {
      return NextResponse.json({ error: "Solo puedes desactivar operadores de tu zona" }, { status: 403 });
    }
  } else if (profile.role === "SUPPLY") {
    if (target.cargo !== "ALMACENISTA") {
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
