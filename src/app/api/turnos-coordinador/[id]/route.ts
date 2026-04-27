export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { prisma } from "@/lib/prisma";
import { computeHorasAlCerrarTurnoCoordinador } from "@/lib/turnoCoordinadorCompute";

const ROLES_FICHAJE = new Set<string>(["COORDINADOR", "COORDINADOR_INTERIOR"]);
const ROLES_ADMIN = new Set<string>(["MANAGER", "ADMIN"]);

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: Ctx) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const profile = await getUserProfile(user.email!);
  if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const { id } = await context.params;

  let body: {
    lat?: number;
    lng?: number;
    horaEntrada?: string;
    horaSalida?: string | null;
    codigoOrden?: string;
    nota?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const turno = await prisma.turnoCoordinador.findUnique({
    where: { id },
    include: { user: { select: { nombre: true, cedula: true, id: true } } },
  });

  if (!turno) return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });

  const role = profile.role;
  const isOwner = turno.userId === profile.id;
  const isFichaje = ROLES_FICHAJE.has(role) && isOwner;
  const isAdmin = ROLES_ADMIN.has(role);

  if (!isFichaje && !isAdmin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // ——— Cierre por el propio coordinador (solo GPS, salida = ahora) ———
  if (isFichaje && !isAdmin) {
    if (turno.horaSalida) {
      return NextResponse.json({ error: "El turno ya está cerrado" }, { status: 400 });
    }
    const horaSalida = new Date();
    const horasData = await computeHorasAlCerrarTurnoCoordinador(turno.horaEntrada, horaSalida);

    const actualizado = await prisma.turnoCoordinador.update({
      where: { id },
      data: {
        horaSalida,
        latSalida: body.lat ?? null,
        lngSalida: body.lng ?? null,
        ...horasData,
      },
      include: {
        user: { select: { nombre: true, cedula: true, zona: true, role: true } },
      },
    });

    return NextResponse.json({ turno: actualizado });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // ——— Edición MANAGER / ADMIN ———
  const entrada = body.horaEntrada ? new Date(body.horaEntrada) : turno.horaEntrada;
  let salida: Date | null =
    body.horaSalida === undefined
      ? turno.horaSalida
      : body.horaSalida
        ? new Date(body.horaSalida)
        : null;

  const codigoOrden =
    typeof body.codigoOrden === "string" && body.codigoOrden.trim()
      ? body.codigoOrden.trim()
      : turno.codigoOrden;

  const nota = body.nota !== undefined ? (body.nota === null ? null : String(body.nota)) : turno.nota;

  let horasBlock: Record<string, number> = {
    horasOrdinarias: 0,
    heDiurna: 0,
    heNocturna: 0,
    heDominical: 0,
    heNoctDominical: 0,
    recNocturno: 0,
    recDominical: 0,
    recNoctDominical: 0,
  };
  if (salida) {
    horasBlock = await computeHorasAlCerrarTurnoCoordinador(entrada, salida);
  }

  const actualizado = await prisma.turnoCoordinador.update({
    where: { id },
    data: {
      horaEntrada: entrada,
      horaSalida: salida,
      codigoOrden,
      nota,
      ...horasBlock,
    },
    include: {
      user: { select: { nombre: true, cedula: true, zona: true, role: true } },
    },
  });

  return NextResponse.json({ turno: actualizado });
}

export async function DELETE(_req: NextRequest, context: Ctx) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const profile = await getUserProfile(user.email!);
  if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  if (!ROLES_ADMIN.has(profile.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await context.params;

  const turno = await prisma.turnoCoordinador.findUnique({
    where: { id },
    include: { user: { select: { cedula: true, nombre: true } } },
  });

  if (!turno) return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });

  await prisma.turnoCoordinador.delete({ where: { id } });

  return NextResponse.json({ ok: true, mensaje: "Turno eliminado" });
}
