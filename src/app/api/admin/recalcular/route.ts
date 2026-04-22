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

  const turnos = await prisma.turno.findMany({
    where: { horaSalida: { not: null } },
    orderBy: { fecha: "asc" },
  });

  let actualizados = 0;
  let errores = 0;

  for (const turno of turnos) {
    try {
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
            id: { not: turno.id },
          },
          select: { fecha: true, horasOrdinarias: true },
        }),
      ]);

      const holidaySet = new Set(festivosSemana.map((f) => dateKey(f.fecha)));
      const esFestivo = holidaySet.has(dateKey(turno.fecha));
      const weeklyOrdHours = sumWeeklyOrdHoursMonSat(turnosSemana);

      type MallaRow = { tipo?: string | null; valor: string; horaInicio?: string | null; horaFin?: string | null };
      const row = mallaDiaRow as MallaRow | null;
      const mallaDia = row
        ? {
            tipo: esFestivo ? "FESTIVO" : (row.tipo ?? "TRABAJO"),
            valor: row.valor ?? null,
            horaInicio: row.horaInicio,
            horaFin: row.horaFin,
          }
        : esFestivo
          ? { tipo: "FESTIVO" as const, valor: null, horaInicio: null, horaFin: null }
          : getDay(turno.fecha) === 0
            ? { tipo: "DESCANSO" as const, valor: null, horaInicio: null, horaFin: null }
            : {
                tipo: "TRABAJO" as const,
                valor: "Trabajo",
                horaInicio: "08:00",
                horaFin: getDay(turno.fecha) === 6 ? "12:00" : "17:00",
              };

      const resultado = calcularHorasTurno(
        { horaEntrada: turno.horaEntrada, horaSalida: turno.horaSalida!, fecha: turno.fecha },
        mallaDia,
        holidaySet,
        weeklyOrdHours
      );
      const resultadoDb = resultadoToTurnoData(resultado);

      await prisma.turno.update({
        where: { id: turno.id },
        data: resultadoDb,
      });

      actualizados++;
    } catch (e) {
      console.error(`Error recalculando turno ${turno.id}:`, e);
      errores++;
    }
  }

  return NextResponse.json({ actualizados, errores, total: turnos.length });
}