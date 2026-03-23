export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeHorasAlCerrarTurnoCoordinador } from "@/lib/turnoCoordinadorCompute";
import {
  appendTurnoCoordinadorSheetRow,
  deleteTurnoCoordinadorSheetRow,
  replaceTurnoCoordinadorSheetRow,
} from "@/lib/sheetsTurnoCoordinador";
import { dateKeyColombia } from "@/lib/bia/calc-engine";

const ROLES_FICHAJE = new Set<string>(["COORDINADOR", "COORDINADOR_INTERIOR"]);
const ROLES_ADMIN = new Set<string>(["MANAGER", "ADMIN"]);

function timeColombia(d: Date): string {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  const hh = String(colombia.getUTCHours()).padStart(2, "0");
  const mm = String(colombia.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function sheetPayloadFromTurno(t: {
  fecha: Date;
  horaEntrada: Date;
  horaSalida: Date | null;
  horasOrdinarias: number;
  heDiurna: number;
  heNocturna: number;
  heDominical: number;
  heNoctDominical: number;
  recNocturno: number;
  recDominical: number;
  recNoctDominical: number;
  user: { nombre: string; cedula: string | null };
}) {
  if (!t.horaSalida) return null;
  return {
    nombre: t.user.nombre,
    cedula: t.user.cedula,
    fecha: t.fecha,
    horaEntrada: t.horaEntrada,
    horaSalida: t.horaSalida,
    horasOrdinarias: t.horasOrdinarias,
    heDiurna: t.heDiurna,
    heNocturna: t.heNocturna,
    heDominical: t.heDominical,
    heNoctDominical: t.heNoctDominical,
    recNocturno: t.recNocturno,
    recDominical: t.recDominical,
    recNoctDominical: t.recNoctDominical,
  };
}

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

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

  const role = session.user.role;
  const isOwner = turno.userId === session.user.userId;
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

    const sp = sheetPayloadFromTurno(actualizado);
    if (sp) void appendTurnoCoordinadorSheetRow(sp);

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

  const hadSalida = !!turno.horaSalida;
  const prevSheet =
    hadSalida && turno.user.cedula
      ? { cedula: turno.user.cedula, fecha: turno.fecha, horaEntrada: turno.horaEntrada }
      : null;

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

  if (actualizado.horaSalida) {
    const sp = sheetPayloadFromTurno(actualizado);
    if (sp) void replaceTurnoCoordinadorSheetRow(prevSheet, sp);
  } else if (prevSheet?.cedula) {
    void deleteTurnoCoordinadorSheetRow(
      prevSheet.cedula,
      dateKeyColombia(prevSheet.fecha),
      timeColombia(prevSheet.horaEntrada)
    );
  }

  return NextResponse.json({ turno: actualizado });
}

export async function DELETE(_req: NextRequest, context: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!ROLES_ADMIN.has(session.user.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await context.params;

  const turno = await prisma.turnoCoordinador.findUnique({
    where: { id },
    include: { user: { select: { cedula: true, nombre: true } } },
  });

  if (!turno) return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });

  if (turno.horaSalida && turno.user.cedula) {
    await deleteTurnoCoordinadorSheetRow(
      turno.user.cedula,
      dateKeyColombia(turno.fecha),
      timeColombia(turno.horaEntrada)
    );
  }

  await prisma.turnoCoordinador.delete({ where: { id } });

  return NextResponse.json({ ok: true, mensaje: "Turno eliminado" });
}
