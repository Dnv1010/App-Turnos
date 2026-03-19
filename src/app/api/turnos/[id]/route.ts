import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInicioSemana, getFinSemana } from "@/lib/bia/calc-engine";
import { getDay } from "date-fns";
import { calcularHorasTurno, resultadoToTurnoData } from "@/lib/calcularHoras";
import { updateRowByMatch } from "@/lib/google-sheets";

/** Convierte Date a fecha Colombia (UTC-5) como string YYYY-MM-DD */
function dateKeyColombia(d: Date): string {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.toISOString().split("T")[0];
}

/** Hora Colombia como HH:MM */
function timeColombia(d: Date): string {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  const hh = String(colombia.getUTCHours()).padStart(2, "0");
  const mm = String(colombia.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** 
 * Parsea ISO string asegurando que si NO tiene timezone, se interprete como Colombia (UTC-5)
 * Si tiene timezone (Z o +/-), lo respeta.
 */
function parseAsColombiaTime(isoString: string): Date {
  // Si ya tiene timezone indicator, parsear normal
  if (isoString.includes("Z") || /[+-]\d{2}:\d{2}$/.test(isoString)) {
    return new Date(isoString);
  }
  // Si no tiene timezone, agregar -05:00 (Colombia)
  return new Date(isoString + "-05:00");
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

    // CRÍTICO: Parsear horas asumiendo Colombia si no tienen timezone
    const newEntrada = horaEntradaISO ? parseAsColombiaTime(horaEntradaISO) : turno.horaEntrada;
    const newSalida = horaSalidaISO ? parseAsColombiaTime(horaSalidaISO) : turno.horaSalida;

    // Calcular fecha en Colombia (UTC-5)
    const fechaStr = dateKeyColombia(newEntrada);
    const [y, m, d] = fechaStr.split("-").map(Number);
    const fecha = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

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

    const [mallaDiaRow, festivosSemana, turnosSemana] = await Promise.all([
      prisma.mallaTurno.findUnique({
        where: { userId_fecha: { userId: turno.userId, fecha } },
      }),
      prisma.festivo.findMany({
        where: { fecha: { gte: inicioSemana, lte: finSemana } },
      }),
      prisma.turno.findMany({
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
        select: { horasOrdinarias: true },
      }),
    ]);

    // CRÍTICO: Usar dateKeyColombia para festivos
    const holidaySet = new Set(festivosSemana.map((f) => dateKeyColombia(f.fecha)));
    const esFestivo = holidaySet.has(fechaStr);
    const weeklyOrdHours = turnosSemana.reduce((s, t) => s + Math.max(0, t.horasOrdinarias ?? 0), 0);

    type MallaRow = { tipo?: string | null; valor: string; horaInicio?: string | null; horaFin?: string | null };
    const row = mallaDiaRow as MallaRow | null;
    
    // Día de la semana en Colombia
    const colombiaDate = new Date(newEntrada.getTime() - 5 * 60 * 60 * 1000);
    const dowColombia = colombiaDate.getUTCDay();
    
    const mallaDia = row
      ? {
          tipo: esFestivo ? "FESTIVO" : (row.tipo ?? "TRABAJO"),
          valor: row.valor ?? null,
          horaInicio: row.horaInicio,
          horaFin: row.horaFin,
        }
      : esFestivo
        ? { tipo: "FESTIVO" as const, valor: null, horaInicio: null, horaFin: null }
        : dowColombia === 0
          ? { tipo: "DESCANSO" as const, valor: null, horaInicio: null, horaFin: null }
          : {
              tipo: "TRABAJO" as const,
              valor: "Trabajo",
              horaInicio: "08:00",
              horaFin: dowColombia === 6 ? "12:00" : "17:00",
            };

    const resultado = calcularHorasTurno(
      { horaEntrada: newEntrada, horaSalida: newSalida, fecha },
      mallaDia,
      holidaySet,
      weeklyOrdHours
    );
    const resultadoDb = resultadoToTurnoData(resultado);

    await prisma.turno.update({
      where: { id },
      data: {
        fecha,
        horaEntrada: newEntrada,
        horaSalida: newSalida,
        observaciones: notes ? `${notes} [Editado ${new Date().toISOString()}]` : turno.observaciones,
        ...resultadoDb,
      },
    });

    const totalHoras = Math.round(((newSalida.getTime() - newEntrada.getTime()) / (1000 * 60 * 60)) * 100) / 100;
    updateRowByMatch("Turnos", [
      { columnIndex: 0, value: turno.user.nombre },
      { columnIndex: 2, value: dateKeyColombia(turno.fecha) },
    ], [
      turno.user.nombre,
      turno.user.cedula ?? "",
      fechaStr,
      timeColombia(newEntrada),
      timeColombia(newSalida),
      totalHoras,
      Math.max(0, resultadoDb.horasOrdinarias ?? 0),
      resultadoDb.heDiurna ?? 0,
      resultadoDb.heNocturna ?? 0,
      resultadoDb.heDominical ?? 0,
      resultadoDb.heNoctDominical ?? 0,
      resultadoDb.recNocturno ?? 0,
      resultadoDb.recDominical ?? 0,
      resultadoDb.recNoctDominical ?? 0,
    ]).catch(console.error);

    return NextResponse.json({
      ok: true,
      msg: `Turno actualizado. Ord: ${resultadoDb.horasOrdinarias}h, HE: ${resultadoDb.heDiurna + resultadoDb.heNocturna}h`,
      turno: { ...resultadoDb, fecha: fechaStr },
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