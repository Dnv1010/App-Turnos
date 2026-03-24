export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Zona } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInicioSemana, getFinSemana } from "@/lib/bia/calc-engine";
import { getDay } from "date-fns";
import { calcularHorasTurno, resultadoToTurnoData } from "@/lib/calcularHoras";
import { sumWeeklyOrdHoursMonSat } from "@/lib/weeklyOrdHours";
import { appendRow } from "@/lib/google-sheets";

/** Convierte Date a fecha Colombia (UTC-5) como string YYYY-MM-DD */
function dateKeyColombia(d: Date): string {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.toISOString().split("T")[0];
}

/** YYYY-MM-DD + delta días (calendario). */
function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().split("T")[0];
}

/** Minutos del día en Colombia (UTC-5) */
function getMinutesOfDayColombia(d: Date): number {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.getUTCHours() * 60 + colombia.getUTCMinutes();
}

/** Entrada en horario nocturno Colombia (fuera de 06:00–19:00) */
function isNocturnalEntradaColombia(horaEntrada: Date): boolean {
  const mins = getMinutesOfDayColombia(horaEntrada);
  const DIURNA_START = 6 * 60;
  const DIURNA_END = 19 * 60;
  return mins < DIURNA_START || mins >= DIURNA_END;
}

/** Incluye turnos con fecha = día anterior y entrada nocturna que "pertenecen" al día siguiente en el filtro. */
function turnoEnRangoFechaCalendario(
  t: { fecha: Date; horaEntrada: Date },
  desde: string,
  hasta: string
): boolean {
  // CRÍTICO: Usar fecha Colombia, no UTC
  const F = dateKeyColombia(new Date(t.fecha));
  if (F >= desde && F <= hasta) return true;
  const siguiente = addDaysYmd(F, 1);
  return (
    siguiente >= desde &&
    siguiente <= hasta &&
    isNocturnalEntradaColombia(new Date(t.horaEntrada))
  );
}

/** Hora Colombia como HH:MM */
function timeColombia(d: Date): string {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  const hh = String(colombia.getUTCHours()).padStart(2, "0");
  const mm = String(colombia.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Día de la semana en Colombia */
function getDayOfWeekColombia(d: Date): number {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.getUTCDay();
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userIdParam = searchParams.get("userId");
  const desde = searchParams.get("desde") ?? searchParams.get("inicio");
  const hasta = searchParams.get("hasta") ?? searchParams.get("fin");
  const zonaParam = searchParams.get("zona");

  let where: Record<string, unknown> = {};

  if (session.user.role === "TECNICO") {
    where.userId = session.user.userId;
  } else if (session.user.role === "COORDINADOR") {
    const zona = (zonaParam || session.user.zona) as Zona;
    const usersZona = await prisma.user.findMany({
      where: { zona, role: "TECNICO", isActive: true },
      select: { id: true },
    });
    where.userId = { in: usersZona.map((u) => u.id) };
  } else if (userIdParam) {
    where.userId = userIdParam;
  } else {
    where.userId = session.user.userId;
  }

  if (desde && hasta) {
    // Expandir rango para capturar turnos nocturnos del día anterior
    const desdeExpanded = addDaysYmd(desde, -1);
    where.fecha = {
      gte: new Date(desdeExpanded + "T00:00:00.000Z"),
      lte: new Date(hasta + "T23:59:59.999Z"),
    };
  }

  let turnos = await prisma.turno.findMany({
    where,
    orderBy: [{ fecha: "desc" }, { horaEntrada: "desc" }],
    include: { user: { select: { nombre: true, zona: true } } },
  });

  // Filtrar por rango usando fecha Colombia
  if (desde && hasta) {
    turnos = turnos.filter((t) => turnoEnRangoFechaCalendario(t, desde, hasta));
  }

  // Excluir turnos cancelados
  turnos = turnos.filter((t) => !t.observaciones?.startsWith("Cancelado"));

  return NextResponse.json(turnos);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "TECNICO") {
    return NextResponse.json({ error: "Solo los operadores pueden iniciar turnos" }, { status: 403 });
  }

  const body = await req.json();
  const { userId, lat, lng, startPhotoUrl } = body;
  const uid = userId || session.user.userId;

  const turnoAbierto = await prisma.turno.findFirst({
    where: { userId: uid, horaSalida: null },
  });

  if (turnoAbierto) {
    return NextResponse.json({ error: "Ya hay un turno abierto", turno: turnoAbierto }, { status: 400 });
  }

  // Hora actual en UTC
  const horaEntrada = new Date();
  // Calcular fecha en Colombia (UTC-5)
  const ahoraColombia = new Date(horaEntrada.getTime() - 5 * 60 * 60 * 1000);
  const fecha = new Date(Date.UTC(
    ahoraColombia.getUTCFullYear(),
    ahoraColombia.getUTCMonth(),
    ahoraColombia.getUTCDate()
  ));

  // Verificar malla del día — bloquear si es estado no laboral
  console.log("[POST /turnos] Buscando malla para userId:", uid, "fecha:", fecha.toISOString());
  const mallaHoy = await prisma.mallaTurno.findUnique({
    where: { userId_fecha: { userId: uid, fecha } },
  });

  if (mallaHoy) {
    console.log("[POST /turnos] Malla encontrada:", mallaHoy.valor, "tipo:", mallaHoy.tipo);
    const valorMalla = (mallaHoy.valor ?? "").toLowerCase().trim();
    const estadosBloqueantes = [
      "descanso",
      "vacacion",
      "vacaciones",
      "dia de la familia",
      "día de la familia",
      "incapacitado",
      "incapacidad",
      "semana santa",
      "keynote",
    ];

    const estaBloqueado = estadosBloqueantes.some((estado) => valorMalla.includes(estado));
    console.log("[POST /turnos] estaBloqueado:", estaBloqueado, "valorMalla:", valorMalla);

    if (estaBloqueado) {
      const fechaStr = fecha.toISOString().split("T")[0].split("-").reverse().join("/");
      const estadoMostrar = mallaHoy.valor || "No laboral";

      return NextResponse.json(
        {
          error: `El día ${fechaStr} estás en "${estadoMostrar}" según la malla de turnos. No puedes abrir turno. Comunícale la novedad a tu coordinador.`,
          bloqueadoPorMalla: true,
          estadoMalla: estadoMostrar,
          fechaMalla: fechaStr,
        },
        { status: 403 }
      );
    }
  }

  const turno = await prisma.turno.create({
    data: {
      userId: uid,
      fecha,
      horaEntrada,
      latEntrada: lat,
      lngEntrada: lng,
      startPhotoUrl: startPhotoUrl || null,
    },
  });

  return NextResponse.json(turno, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (session.user.role !== "TECNICO") {
      return NextResponse.json({ error: "Solo los operadores pueden cerrar turnos" }, { status: 403 });
    }

    let body: { turnoId?: string; lat?: number; lng?: number; endPhotoUrl?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }
    const { turnoId, lat, lng, endPhotoUrl } = body;
    if (!turnoId) return NextResponse.json({ error: "turnoId requerido" }, { status: 400 });

    const turno = await prisma.turno.findUnique({ where: { id: turnoId } });
    if (!turno) return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
    if (turno.userId !== session.user.userId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    if (turno.horaSalida) return NextResponse.json({ error: "Turno ya cerrado" }, { status: 400 });

    const horaSalida = new Date();

    const inicioSemana = getInicioSemana(turno.fecha);
    const finSemana = getFinSemana(turno.fecha);

    const [mallaDiaRow, festivosSemana, turnosSemana] = await Promise.all([
      prisma.mallaTurno.findUnique({
        where: { userId_fecha: { userId: turno.userId, fecha: turno.fecha } },
      }),
      prisma.festivo.findMany({
        where: { fecha: { gte: inicioSemana, lte: finSemana } },
      }),
      prisma.turno.findMany({
        where: {
          userId: turno.userId,
          fecha: { gte: inicioSemana, lte: finSemana },
          horaSalida: { not: null },
          id: { not: turnoId },
        },
        select: { fecha: true, horasOrdinarias: true },
      }),
    ]);

    // CRÍTICO: Usar dateKeyColombia para festivos
    const holidaySet = new Set(festivosSemana.map((f) => dateKeyColombia(f.fecha)));
    const esFestivo = holidaySet.has(dateKeyColombia(turno.fecha));
    const weeklyOrdHours = sumWeeklyOrdHoursMonSat(turnosSemana);

    type MallaRow = { tipo?: string | null; valor: string; horaInicio?: string | null; horaFin?: string | null };
    const row = mallaDiaRow as MallaRow | null;
    
    // Usar día de la semana en Colombia
    const dowColombia = getDayOfWeekColombia(turno.fecha);
    
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
      { horaEntrada: turno.horaEntrada, horaSalida, fecha: turno.fecha },
      mallaDia,
      holidaySet,
      weeklyOrdHours
    );
    const resultadoDb = resultadoToTurnoData(resultado);

    const turnoActualizado = await prisma.turno.update({
      where: { id: turnoId },
      data: {
        horaSalida,
        latSalida: lat,
        lngSalida: lng,
        endPhotoUrl: endPhotoUrl || null,
        ...resultadoDb,
      },
      include: { user: { select: { nombre: true, cedula: true } } },
    });

    const totalHoras =
      Math.round(
        ((turnoActualizado.horaSalida!.getTime() - turnoActualizado.horaEntrada.getTime()) /
          (1000 * 60 * 60)) * 100
      ) / 100;

    appendRow("Turnos", [
      turnoActualizado.user?.nombre ?? "",
      turnoActualizado.user?.cedula ?? "",
      dateKeyColombia(turnoActualizado.fecha),
      timeColombia(turnoActualizado.horaEntrada),
      timeColombia(turnoActualizado.horaSalida!),
      totalHoras,
      Math.max(0, turnoActualizado.horasOrdinarias ?? 0),
      turnoActualizado.heDiurna ?? 0,
      turnoActualizado.heNocturna ?? 0,
      turnoActualizado.heDominical ?? 0,
      turnoActualizado.heNoctDominical ?? 0,
      turnoActualizado.recNocturno ?? 0,
      turnoActualizado.recDominical ?? 0,
      turnoActualizado.recNoctDominical ?? 0,
    ]).catch(console.error);

    return NextResponse.json(turnoActualizado);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al cerrar turno";
    console.error("[PATCH /api/turnos]", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}