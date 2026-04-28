export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { prisma } from "@/lib/prisma";
import { getInicioSemana, getFinSemana } from "@/lib/bia/calc-engine";
import { getDay } from "date-fns";
import { calcularHorasTurno, resultadoToTurnoData } from "@/lib/calcularHoras";
import { sumWeeklyOrdHoursMonSat } from "@/lib/weeklyOrdHours";

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function POST() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const profile = await getUserProfile(user.email!);
  if (!profile || profile.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const turnos = await prisma.shift.findMany({
    where: { clockOutAt: { not: null } },
    orderBy: { date: "asc" },
  });

  let actualizados = 0;
  let errores = 0;

  for (const turno of turnos) {
    try {
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
            id: { not: turno.id },
          },
          select: { date: true, regularHours: true },
        }),
      ]);

      const holidaySet = new Set(festivosSemana.map((f) => dateKey(f.date)));
      const esFestivo = holidaySet.has(dateKey(turno.date));
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
      const mallaDia = row
        ? {
            tipo: esFestivo ? "FESTIVO" : (row.tipo ?? "TRABAJO"),
            valor: row.valor ?? null,
            horaInicio: row.horaInicio,
            horaFin: row.horaFin,
          }
        : esFestivo
          ? { tipo: "FESTIVO" as const, valor: null, horaInicio: null, horaFin: null }
          : getDay(turno.date) === 0
            ? { tipo: "DESCANSO" as const, valor: null, horaInicio: null, horaFin: null }
            : {
                tipo: "TRABAJO" as const,
                valor: "Trabajo",
                horaInicio: "08:00",
                horaFin: getDay(turno.date) === 6 ? "12:00" : "17:00",
              };

      const resultado = calcularHorasTurno(
        { horaEntrada: turno.clockInAt, horaSalida: turno.clockOutAt!, fecha: turno.date },
        mallaDia,
        holidaySet,
        weeklyOrdHours
      );
      const resultadoDb = resultadoToTurnoData(resultado);

      await prisma.shift.update({
        where: { id: turno.id },
        data: {
          regularHours: resultadoDb.horasOrdinarias,
          daytimeOvertimeHours: resultadoDb.heDiurna,
          nighttimeOvertimeHours: resultadoDb.heNocturna,
          sundayOvertimeHours: resultadoDb.heDominical,
          nightSundayOvertimeHours: resultadoDb.heNoctDominical,
          nightSurchargeHours: resultadoDb.recNocturno,
          sundaySurchargeHours: resultadoDb.recDominical,
          nightSundaySurchargeHours: resultadoDb.recNoctDominical,
        },
      });

      actualizados++;
    } catch (e) {
      console.error(`Error recalculando turno ${turno.id}:`, e);
      errores++;
    }
  }

  return NextResponse.json({ actualizados, errores, total: turnos.length });
}