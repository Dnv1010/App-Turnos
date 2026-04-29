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
    clockInAt?: string;
    clockOutAt?: string | null;
    orderCode?: string;
    note?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const turno = await prisma.coordinatorShift.findUnique({
    where: { id },
    include: { user: { select: { fullName: true, documentNumber: true, id: true } } },
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
    if (turno.clockOutAt) {
      return NextResponse.json({ error: "El turno ya está cerrado" }, { status: 400 });
    }
    const horaSalida = new Date();
    const horasData = await computeHorasAlCerrarTurnoCoordinador(turno.clockInAt, horaSalida);

    const actualizado = await prisma.coordinatorShift.update({
      where: { id },
      data: {
        clockOutAt: horaSalida,
        clockOutLat: body.lat ?? null,
        clockOutLng: body.lng ?? null,
        regularHours: horasData.horasOrdinarias,
        daytimeOvertimeHours: horasData.heDiurna,
        nighttimeOvertimeHours: horasData.heNocturna,
        sundayOvertimeHours: horasData.heDominical,
        nightSundayOvertimeHours: horasData.heNoctDominical,
        nightSurchargeHours: horasData.recNocturno,
        sundaySurchargeHours: horasData.recDominical,
        nightSundaySurchargeHours: horasData.recNoctDominical,
      },
      include: {
        user: { select: { fullName: true, documentNumber: true, zone: true, role: true } },
      },
    });

    return NextResponse.json({ turno: actualizado });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // ——— Edición MANAGER / ADMIN ———
  const entrada = body.clockInAt ? new Date(body.clockInAt) : turno.clockInAt;
  const salida: Date | null =
    body.clockOutAt === undefined
      ? turno.clockOutAt
      : body.clockOutAt
        ? new Date(body.clockOutAt)
        : null;

  const orderCode =
    typeof body.orderCode === "string" && body.orderCode.trim()
      ? body.orderCode.trim()
      : turno.orderCode;

  const note = body.note !== undefined ? (body.note === null ? null : String(body.note)) : turno.note;

  let horasBlock: {
    horasOrdinarias: number;
    heDiurna: number;
    heNocturna: number;
    heDominical: number;
    heNoctDominical: number;
    recNocturno: number;
    recDominical: number;
    recNoctDominical: number;
  } = {
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

  const actualizado = await prisma.coordinatorShift.update({
    where: { id },
    data: {
      clockInAt: entrada,
      clockOutAt: salida,
      orderCode,
      note,
      regularHours: horasBlock.horasOrdinarias,
      daytimeOvertimeHours: horasBlock.heDiurna,
      nighttimeOvertimeHours: horasBlock.heNocturna,
      sundayOvertimeHours: horasBlock.heDominical,
      nightSundayOvertimeHours: horasBlock.heNoctDominical,
      nightSurchargeHours: horasBlock.recNocturno,
      sundaySurchargeHours: horasBlock.recDominical,
      nightSundaySurchargeHours: horasBlock.recNoctDominical,
    },
    include: {
      user: { select: { fullName: true, documentNumber: true, zone: true, role: true } },
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

  const turno = await prisma.coordinatorShift.findUnique({
    where: { id },
    include: { user: { select: { documentNumber: true, fullName: true } } },
  });

  if (!turno) return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });

  await prisma.coordinatorShift.delete({ where: { id } });

  return NextResponse.json({ ok: true, mensaje: "Turno eliminado" });
}
