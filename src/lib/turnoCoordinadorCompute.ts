import { prisma } from "@/lib/prisma";
import { calcularHorasTurno, resultadoToTurnoData } from "@/lib/calcularHoras";
import { sumWeeklyOrdHoursMonSat } from "@/lib/weeklyOrdHours";
import { startOfWeek, endOfWeek } from "date-fns";
import { dateKeyColombia } from "@/lib/bia/calc-engine";

function getDayOfWeekColombia(d: Date): number {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.getUTCDay();
}

/**
 * Calcula horas al cerrar un TurnoCoordinador (misma lógica que cierre de turno técnico).
 */
export async function computeHorasAlCerrarTurnoCoordinador(
  userId: string,
  fecha: Date,
  horaEntrada: Date,
  horaSalida: Date
) {
  const weekStart = startOfWeek(fecha, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(fecha, { weekStartsOn: 1 });

  const [mallaDiaRow, festivosSemana, turnosSemana, turnosCoordSemana] = await Promise.all([
    prisma.mallaTurno.findUnique({
      where: { userId_fecha: { userId, fecha } },
    }),
    prisma.festivo.findMany({
      where: { fecha: { gte: weekStart, lte: weekEnd } },
    }),
    prisma.turno.findMany({
      where: {
        userId,
        fecha: { gte: weekStart, lte: weekEnd },
        horaSalida: { not: null },
      },
      select: { id: true, fecha: true, horasOrdinarias: true },
    }),
    prisma.turnoCoordinador.findMany({
      where: {
        userId,
        fecha: { gte: weekStart, lte: weekEnd },
        horaSalida: { not: null },
      },
      select: { id: true, fecha: true, horasOrdinarias: true },
    }),
  ]);

  const holidaySet = new Set(festivosSemana.map((f) => dateKeyColombia(f.fecha)));
  const esFestivo = holidaySet.has(dateKeyColombia(fecha));

  const combinedOrd = [
    ...turnosSemana.map((t) => ({ id: t.id, fecha: t.fecha, horasOrdinarias: t.horasOrdinarias })),
    ...turnosCoordSemana.map((t) => ({ id: t.id, fecha: t.fecha, horasOrdinarias: t.horasOrdinarias })),
  ];
  const weeklyOrdHours = sumWeeklyOrdHoursMonSat(combinedOrd);

  type MallaRow = { tipo?: string | null; valor: string; horaInicio?: string | null; horaFin?: string | null };
  const row = mallaDiaRow as MallaRow | null;
  const dowColombia = getDayOfWeekColombia(fecha);

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
    { horaEntrada, horaSalida, fecha },
    mallaDia,
    holidaySet,
    weeklyOrdHours
  );
  return resultadoToTurnoData(resultado);
}
