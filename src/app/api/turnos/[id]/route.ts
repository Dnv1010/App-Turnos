import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { calcularTurno, calcularHorasSemanalesConMalla, getInicioSemana, getFinSemana } from "@/lib/bia/calc-engine";
import { getDay } from "date-fns";

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

async function checkCoordinadorZona(turnoUserId: string, session: { user: { zona?: string; role: string } }) {
  if (session.user.role !== "COORDINADOR") return true;
  const user = await prisma.user.findUnique({
    where: { id: turnoUserId },
    select: { zona: true, role: true },
  });
  return user?.role === "TECNICO" && user?.zona === session.user.zona;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const turno = await prisma.turno.findUnique({
    where: { id },
    include: { user: { select: { cedula: true, nombre: true, email: true, zona: true } } },
  });
  if (!turno) return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });

  const canAccess = session.user.role === "ADMIN" || session.user.role === "MANAGER" ||
    (session.user.role === "COORDINADOR" && await checkCoordinadorZona(turno.userId, session)) ||
    (session.user.role === "TECNICO" && turno.userId === session.user.userId);
  if (!canAccess) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  return NextResponse.json({ ok: true, turno });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const turno = await prisma.turno.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!turno) return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });

    const canEdit = session.user.role === "ADMIN" || session.user.role === "MANAGER" ||
      (session.user.role === "COORDINADOR" && await checkCoordinadorZona(turno.userId, session));
    if (!canEdit) return NextResponse.json({ error: "Solo coordinador o superior puede editar este turno" }, { status: 403 });

    if (turno.observaciones?.startsWith("Cancelado")) {
      return NextResponse.json({ error: "No se puede editar un turno cancelado" }, { status: 400 });
    }

    let body: { horaEntrada?: string; horaSalida?: string; observaciones?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }
    const { horaEntrada: horaEntradaISO, horaSalida: horaSalidaISO, observaciones: notes } = body ?? {};

    const newEntrada = horaEntradaISO ? new Date(horaEntradaISO) : turno.horaEntrada;
    const newSalida = horaSalidaISO ? new Date(horaSalidaISO) : turno.horaSalida;

    const fecha = new Date(Date.UTC(newEntrada.getFullYear(), newEntrada.getMonth(), newEntrada.getDate(), 12, 0, 0));

    if (!newSalida) {
      await prisma.turno.update({
        where: { id },
        data: {
          horaEntrada: newEntrada,
          fecha,
          observaciones: notes ? `${notes} [Editado ${new Date().toISOString()}]` : turno.observaciones,
        },
      });
      return NextResponse.json({ ok: true, msg: "Hora de inicio actualizada" });
    }

    const inicioSemana = getInicioSemana(fecha);
    const finSemana = getFinSemana(fecha);

    const [mallaSemana, festivosSemana] = await Promise.all([
      prisma.mallaTurno.findMany({
        where: { userId: turno.userId, fecha: { gte: inicioSemana, lte: finSemana } },
      }),
      prisma.festivo.findMany({ where: { fecha: { gte: inicioSemana, lte: finSemana } } }),
    ]);
    const mallaMap = new Map<string, string>();
    mallaSemana.forEach((m) => mallaMap.set(dateKey(m.fecha), m.valor));
    const holidaySet = new Set(festivosSemana.map((f) => dateKey(f.fecha)));

    const turnosSemana = await prisma.turno.findMany({
      where: {
        userId: turno.userId,
        fecha: { gte: inicioSemana, lte: finSemana },
        horaSalida: { not: null },
        id: { not: id },
        OR: [
          { observaciones: null },
          { observaciones: { not: { startsWith: "Cancelado" } } },
        ],
      },
    });
    const turnosData = turnosSemana.map((t) => ({
      fecha: t.fecha,
      horaEntrada: t.horaEntrada,
      horaSalida: t.horaSalida!,
      esFestivo: holidaySet.has(dateKey(t.fecha)),
      esDomingo: getDay(t.fecha) === 0,
    }));
    turnosData.push({
      fecha,
      horaEntrada: newEntrada,
      horaSalida: newSalida,
      esFestivo: holidaySet.has(dateKey(fecha)),
      esDomingo: getDay(fecha) === 0,
    });

    const mallaGetter = (f: Date) => mallaMap.get(dateKey(f)) ?? null;
    const resumenSemanal = calcularHorasSemanalesConMalla(turnosData, mallaGetter, holidaySet);
    const mallaVal = mallaMap.get(dateKey(fecha)) ?? null;
    const resultado = calcularTurno(
      {
        fecha,
        horaEntrada: newEntrada,
        horaSalida: newSalida,
        esFestivo: holidaySet.has(dateKey(fecha)),
        esDomingo: getDay(fecha) === 0,
      },
      resumenSemanal,
      mallaVal,
      holidaySet
    );

    await prisma.turno.update({
      where: { id },
      data: {
        fecha,
        horaEntrada: newEntrada,
        horaSalida: newSalida,
        observaciones: notes ? `${notes} [Editado ${new Date().toISOString()}]` : turno.observaciones,
        ...resultado,
      },
    });

    const totalHE = resultado.heDiurna + resultado.heNocturna + resultado.heDominical + resultado.heNoctDominical;
    return NextResponse.json({
      ok: true,
      msg: `Turno actualizado. Total: ${resultado.horasOrdinarias}h ord, HE: ${totalHE}h`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al editar";
    console.error("[PATCH /api/turnos/[id]]", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const turno = await prisma.turno.findUnique({ where: { id } });
  if (!turno) return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });

  const canDelete = session.user.role === "ADMIN" || session.user.role === "MANAGER" ||
    (session.user.role === "COORDINADOR" && await checkCoordinadorZona(turno.userId, session));
  if (!canDelete) return NextResponse.json({ error: "No autorizado para cancelar este turno" }, { status: 403 });

  await prisma.turno.update({
    where: { id },
    data: {
      observaciones: `Cancelado por coordinador ${new Date().toISOString()}`,
    },
  });
  return NextResponse.json({ ok: true, msg: "Turno cancelado" });
}
