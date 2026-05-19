export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { prisma } from "@/lib/prisma";
import { getInicioSemana, getFinSemana, getDayOfWeekColombia, dateKeyColombia } from "@/lib/bia/calc-engine";
import { calcularHorasTurno, resultadoToTurnoData } from "@/lib/calcularHoras";
import { sumWeeklyOrdHoursMonSat } from "@/lib/weeklyOrdHours";

/** Día Colombia (YYYY-MM-DD) — para midnight UTC devuelve el día sin offset. */
function dateKey(d: Date): string {
  return dateKeyColombia(d);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/**
 * Recalcula turnos cerrados con la lógica vigente (incluido esTurnoAdicional).
 *
 * Optimizado para evitar timeout en Vercel:
 * - Acepta query params `desde` y `hasta` (YYYY-MM-DD) para procesar por chunks.
 *   Sin params: procesa TODO (puede timeoutear con dataset grande).
 * - Pre-carga festivos, malla y shifts upfront → evita N+1.
 * - Updates en paralelo en lotes de 25.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const profile = await getUserProfile(user.email!);
  if (!profile || profile.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const desdeParam = searchParams.get("desde");
  const hastaParam = searchParams.get("hasta");

  const where: { clockOutAt: { not: null }; date?: { gte: Date; lte: Date } } = {
    clockOutAt: { not: null },
  };
  if (desdeParam && hastaParam) {
    where.date = {
      gte: new Date(desdeParam + "T00:00:00.000Z"),
      lte: new Date(hastaParam + "T23:59:59.999Z"),
    };
  }

  // Turnos a recalcular (en el rango).
  const turnosUpdate = await prisma.shift.findMany({
    where,
    orderBy: [{ date: "asc" }, { clockInAt: "asc" }],
  });

  if (turnosUpdate.length === 0) {
    return NextResponse.json({
      actualizados: 0,
      errores: 0,
      total: 0,
      desde: desdeParam,
      hasta: hastaParam,
    });
  }

  // Rango extendido (±7 días) para tener acceso al resto de la semana.
  const minDate = addDays(turnosUpdate[0].date, -7);
  const maxDate = addDays(turnosUpdate[turnosUpdate.length - 1].date, 7);
  const userIds = Array.from(new Set(turnosUpdate.map((t) => t.userId)));

  // Pre-cargar TODO upfront en queries grandes (en lugar de N+1).
  const [festivosRange, mallasRange, shiftsContext] = await Promise.all([
    prisma.holiday.findMany({
      where: { date: { gte: minDate, lte: maxDate } },
      select: { date: true },
    }),
    prisma.shiftSchedule.findMany({
      where: {
        userId: { in: userIds },
        date: { gte: minDate, lte: maxDate },
      },
    }),
    prisma.shift.findMany({
      where: {
        userId: { in: userIds },
        date: { gte: minDate, lte: maxDate },
        clockOutAt: { not: null },
      },
      select: {
        id: true,
        userId: true,
        date: true,
        clockInAt: true,
        regularHours: true,
        shiftType: true,
        notes: true,
      },
    }),
  ]);

  // Index: festivos por dateKey
  const holidayKeys = new Set(festivosRange.map((f) => dateKey(f.date)));

  // Index: malla por userId|dateKey
  const mallaMap = new Map<
    string,
    {
      dayType: string | null;
      shiftCode: string;
      startTime: string | null;
      endTime: string | null;
    }
  >();
  for (const m of mallasRange) {
    mallaMap.set(`${m.userId}|${dateKey(m.date)}`, {
      dayType: m.dayType,
      shiftCode: m.shiftCode,
      startTime: m.startTime,
      endTime: m.endTime,
    });
  }

  // Index: shifts por userId|díaColombia (derivado del clockInAt UTC real, no
  // del campo date que puede estar desincronizado por timezone Postgres).
  const shiftsPorUserDay = new Map<
    string,
    Array<typeof shiftsContext[number]>
  >();
  const shiftsPorUserWeek = new Map<
    string,
    Array<{ id: string; date: Date; regularHours: number }>
  >();
  for (const s of shiftsContext) {
    const colombiaYmd = dateKeyColombia(s.clockInAt);
    const dayKey = `${s.userId}|${colombiaYmd}`;
    if (!shiftsPorUserDay.has(dayKey)) shiftsPorUserDay.set(dayKey, []);
    shiftsPorUserDay.get(dayKey)!.push(s);

    // Inicio de semana derivado del día Colombia, no del s.date.
    const [yy, mm, dd] = colombiaYmd.split("-").map(Number);
    const colombiaDateUtc = new Date(Date.UTC(yy, mm - 1, dd));
    const weekKey = `${s.userId}|${getInicioSemana(colombiaDateUtc).getTime()}`;
    if (!shiftsPorUserWeek.has(weekKey)) shiftsPorUserWeek.set(weekKey, []);
    shiftsPorUserWeek.get(weekKey)!.push({
      id: s.id,
      date: colombiaDateUtc,
      regularHours: s.regularHours,
    });
  }

  // Procesar en memoria, generar updates.
  type Update = {
    id: string;
    data: {
      regularHours: number;
      daytimeOvertimeHours: number;
      nighttimeOvertimeHours: number;
      sundayOvertimeHours: number;
      nightSundayOvertimeHours: number;
      nightSurchargeHours: number;
      sundaySurchargeHours: number;
      nightSundaySurchargeHours: number;
    };
  };
  const updates: Update[] = [];
  let errores = 0;

  for (const turno of turnosUpdate) {
    try {
      // Día Colombia derivado del clockInAt (UTC real). El turno.date puede
      // estar desincronizado por timezone Postgres.
      const tDateKey = dateKeyColombia(turno.clockInAt);
      const mallaDiaRow = mallaMap.get(`${turno.userId}|${tDateKey}`) ?? null;
      const esFestivo = holidayKeys.has(tDateKey);

      // weeklyOrdHours: turnos cerrados misma semana, OTRO id.
      // Inicio de semana derivado del día Colombia (clockInAt), no del campo date.
      const [yy, mm, dd] = tDateKey.split("-").map(Number);
      const turnoColombiaDateUtc = new Date(Date.UTC(yy, mm - 1, dd));
      const weekKey = `${turno.userId}|${getInicioSemana(turnoColombiaDateUtc).getTime()}`;
      const turnosSemana = (shiftsPorUserWeek.get(weekKey) ?? []).filter(
        (s) => s.id !== turno.id
      );
      const weeklyOrdHours = sumWeeklyOrdHoursMonSat(
        turnosSemana.map((t) => ({ fecha: t.date, horasOrdinarias: t.regularHours ?? 0 }))
      );

      // esTurnoAdicional: otro shift TECHNICAL mismo día con clockInAt anterior, no cancelado.
      const sameDayShifts = shiftsPorUserDay.get(`${turno.userId}|${tDateKey}`) ?? [];
      const esTurnoAdicional = sameDayShifts.some(
        (s) =>
          s.id !== turno.id &&
          s.shiftType === "TECHNICAL" &&
          s.clockInAt.getTime() < turno.clockInAt.getTime() &&
          !s.notes?.startsWith("Cancelado")
      );

      const row = mallaDiaRow
        ? {
            tipo: mallaDiaRow.dayType,
            valor: mallaDiaRow.shiftCode,
            horaInicio: mallaDiaRow.startTime,
            horaFin: mallaDiaRow.endTime,
          }
        : null;
      // Día de la semana Colombia derivado del clockInAt (UTC real).
      const dowColombia = getDayOfWeekColombia(turno.clockInAt);
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
        // fecha: día Colombia midnight UTC derivado del clockInAt (no usar turno.date).
        { horaEntrada: turno.clockInAt, horaSalida: turno.clockOutAt!, fecha: turnoColombiaDateUtc },
        mallaDia,
        holidayKeys,
        weeklyOrdHours,
        esTurnoAdicional
      );
      const r = resultadoToTurnoData(resultado);

      updates.push({
        id: turno.id,
        data: {
          regularHours: r.horasOrdinarias,
          daytimeOvertimeHours: r.heDiurna,
          nighttimeOvertimeHours: r.heNocturna,
          sundayOvertimeHours: r.heDominical,
          nightSundayOvertimeHours: r.heNoctDominical,
          nightSurchargeHours: r.recNocturno,
          sundaySurchargeHours: r.recDominical,
          nightSundaySurchargeHours: r.recNoctDominical,
        },
      });
    } catch (e) {
      console.error(`Error recalculando turno ${turno.id}:`, e);
      errores++;
    }
  }

  // Aplicar updates en chunks paralelos.
  const CHUNK = 25;
  let actualizados = 0;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const slice = updates.slice(i, i + CHUNK);
    const results = await Promise.allSettled(
      slice.map((u) => prisma.shift.update({ where: { id: u.id }, data: u.data }))
    );
    for (const r of results) {
      if (r.status === "fulfilled") actualizados++;
      else errores++;
    }
  }

  return NextResponse.json({
    actualizados,
    errores,
    total: turnosUpdate.length,
    desde: desdeParam,
    hasta: hastaParam,
  });
}
