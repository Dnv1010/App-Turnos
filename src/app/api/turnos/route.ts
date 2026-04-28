export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Zone } from "@prisma/client";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { getInicioSemana, getFinSemana, getDayOfWeekColombia } from "@/lib/bia/calc-engine";
import { calcularHorasTurno, resultadoToTurnoData } from "@/lib/calcularHoras";
import { sumWeeklyOrdHoursMonSat } from "@/lib/weeklyOrdHours";

/** Convierte Date a fecha Colombia (UTC-5) como string YYYY-MM-DD */
function dateKeyColombia(d: Date): string {
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return d.toISOString().split("T")[0];
  }
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
  const DIURNA_START = 4 * 60; // 4am Colombia
  const DIURNA_END = 19 * 60;
  return mins < DIURNA_START || mins >= DIURNA_END;
}

/** Incluye turnos con fecha = día anterior y entrada nocturna que "pertenecen" al día siguiente en el filtro. */
function turnoEnRangoFechaCalendario(
  t: { date: Date; clockInAt: Date },
  desde: string,
  hasta: string
): boolean {
  // CRÍTICO: Usar fecha Colombia, no UTC
  const F = dateKeyColombia(new Date(t.date));
  if (F >= desde && F <= hasta) return true;
  const siguiente = addDaysYmd(F, 1);
  return (
    siguiente >= desde &&
    siguiente <= hasta &&
    isNocturnalEntradaColombia(new Date(t.clockInAt))
  );
}


const DIAS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
/** Para fechas @db.Date (midnight UTC = día de calendario). */
function getDiaSemana(fecha: Date): string {
  return DIAS_ES[fecha.getUTCDay()];
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const profile = await getUserProfile(user.email!);
  if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const userIdParam = searchParams.get("userId");
  const desde = searchParams.get("desde") ?? searchParams.get("inicio");
  const hasta = searchParams.get("hasta") ?? searchParams.get("fin");
  const zonaParam = searchParams.get("zona");

  const where: Record<string, unknown> = {};

  if (profile.role === "TECNICO") {
    where.userId = profile.id;
  } else if (profile.role === "COORDINADOR" || profile.role === "SUPPLY") {
    const useAllZonas = zonaParam === "ALL";
    const zona =
      (useAllZonas ? undefined : (zonaParam || profile.zone)) as Zone | undefined;
    const usersZona = await prisma.user.findMany({
      where: {
        ...(zona ? { zone: zona } : {}),
        role: "TECNICO",
        isActive: true,
      },
      select: { id: true },
    });
    where.userId = { in: usersZona.map((u) => u.id) };
  } else if (userIdParam) {
    where.userId = userIdParam;
  } else {
    where.userId = profile.id;
  }

  if (desde && hasta) {
    // Expandir rango para capturar turnos nocturnos del día anterior
    const desdeExpanded = addDaysYmd(desde, -1);
    where.date = {
      gte: new Date(desdeExpanded + "T00:00:00.000Z"),
      lte: new Date(hasta + "T23:59:59.999Z"),
    };
  }

  let turnos = await prisma.shift.findMany({
    where,
    orderBy: [{ date: "desc" }, { clockInAt: "desc" }],
    include: { user: { select: { fullName: true, zone: true, jobTitle: true } } },
  });

  // Filtrar por rango usando fecha Colombia
  if (desde && hasta) {
    turnos = turnos.filter((t) => turnoEnRangoFechaCalendario(t, desde, hasta));
  }

  // Excluir turnos cancelados
  turnos = turnos.filter((t) => !t.notes?.startsWith("Cancelado"));

  return NextResponse.json(turnos);
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const profile = await getUserProfile(user.email!);
  if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  if (profile.role !== "TECNICO") {
    return NextResponse.json({ error: "Solo los operadores pueden iniciar turnos" }, { status: 403 });
  }

  const body = await req.json();
  const { userId, lat, lng, startPhotoUrl } = body;
  const uid = userId || profile.id;

  const turnoAbierto = await prisma.shift.findFirst({
    where: { userId: uid, clockOutAt: null },
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
  const mallaHoy = await prisma.shiftSchedule.findUnique({
    where: { userId_date: { userId: uid, date: fecha } },
  });

  if (mallaHoy) {
    console.log("[POST /turnos] Malla encontrada:", mallaHoy.shiftCode, "tipo:", mallaHoy.dayType);
    const valorMalla = (mallaHoy.shiftCode ?? "").toLowerCase().trim();
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
      const estadoMostrar = mallaHoy.shiftCode || "No laboral";

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

  const turno = await prisma.shift.create({
    data: {
      userId: uid,
      date: fecha,
      weekday: getDiaSemana(fecha),
      clockInAt: horaEntrada,
      clockInLat: lat,
      clockInLng: lng,
      startPhotoUrl: startPhotoUrl || null,
    },
  });

  return NextResponse.json(turno, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const profile = await getUserProfile(user.email!);
    if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (profile.role !== "TECNICO") {
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

    const turno = await prisma.shift.findUnique({ where: { id: turnoId } });
    if (!turno) return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
    if (turno.userId !== profile.id) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    if (turno.clockOutAt) return NextResponse.json({ error: "Turno ya cerrado" }, { status: 400 });

    const horaSalida = new Date();

    const inicioSemana = getInicioSemana(turno.date);
    const finSemana = getFinSemana(turno.date);

    const [mallaDiaRow, festivosSemana, turnosSemana] = await Promise.all([
      prisma.shiftSchedule.findUnique({
        where: { userId_date: { userId: turno.userId, date: turno.date } },
      }),
      prisma.holiday.findMany({
        where: { date: { gte: inicioSemana, lte: finSemana } },
      }),
      prisma.shift.findMany({
        where: {
          userId: turno.userId,
          date: { gte: inicioSemana, lte: finSemana },
          clockOutAt: { not: null },
          id: { not: turnoId },
        },
        select: { date: true, regularHours: true },
      }),
    ]);

    // CRÍTICO: Usar dateKeyColombia para festivos
    const holidaySet = new Set(festivosSemana.map((f) => dateKeyColombia(f.date)));
    const esFestivo = holidaySet.has(dateKeyColombia(turno.date));
    const weeklyOrdHours = sumWeeklyOrdHoursMonSat(
      turnosSemana.map((t) => ({ fecha: t.date, horasOrdinarias: t.regularHours ?? 0 }))
    );

    type MallaRow = { tipo?: string | null; valor: string; horaInicio?: string | null; horaFin?: string | null };
    const row = mallaDiaRow
      ? ({
          tipo: mallaDiaRow.dayType,
          valor: mallaDiaRow.shiftCode,
          horaInicio: mallaDiaRow.startTime,
          horaFin: mallaDiaRow.endTime,
        } as MallaRow)
      : null;

    // Usar día de la semana en Colombia
    const dowColombia = getDayOfWeekColombia(turno.date);

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
      { horaEntrada: turno.clockInAt, horaSalida, fecha: turno.date },
      mallaDia,
      holidaySet,
      weeklyOrdHours
    );
    const resultadoDb = resultadoToTurnoData(resultado);

    const turnoActualizado = await prisma.shift.update({
      where: { id: turnoId },
      data: {
        clockOutAt: horaSalida,
        clockOutLat: lat,
        clockOutLng: lng,
        endPhotoUrl: endPhotoUrl || null,
        weekday: getDiaSemana(turno.date),
        regularHours: resultadoDb.horasOrdinarias,
        daytimeOvertimeHours: resultadoDb.heDiurna,
        nighttimeOvertimeHours: resultadoDb.heNocturna,
        sundayOvertimeHours: resultadoDb.heDominical,
        nightSundayOvertimeHours: resultadoDb.heNoctDominical,
        nightSurchargeHours: resultadoDb.recNocturno,
        sundaySurchargeHours: resultadoDb.recDominical,
        nightSundaySurchargeHours: resultadoDb.recNoctDominical,
      },
      include: { user: { select: { fullName: true, documentNumber: true } } },
    });

    return NextResponse.json(turnoActualizado);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al cerrar turno";
    console.error("[PATCH /api/turnos]", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
