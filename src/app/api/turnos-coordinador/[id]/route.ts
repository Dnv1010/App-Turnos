export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeHorasAlCerrarTurnoCoordinador } from "@/lib/turnoCoordinadorCompute";

const ROLES_FICHAJE = new Set<string>(["COORDINADOR", "COORDINADOR_INTERIOR"]);

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!ROLES_FICHAJE.has(session.user.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await context.params;

  let body: { lat?: number; lng?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const turno = await prisma.turnoCoordinador.findUnique({
    where: { id },
    include: { user: { select: { id: true } } },
  });

  if (!turno) return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
  if (turno.userId !== session.user.userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  if (turno.horaSalida) {
    return NextResponse.json({ error: "El turno ya está cerrado" }, { status: 400 });
  }

  const horaSalida = new Date();
  const horasData = await computeHorasAlCerrarTurnoCoordinador(
    turno.userId,
    turno.fecha,
    turno.horaEntrada,
    horaSalida
  );

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
