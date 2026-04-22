import { prisma } from "@/lib/prisma";
import { calcularHorasTurnoCoordinador } from "@/lib/calcularHorasCoordinador";
import { dateKeyColombia } from "@/lib/bia/calc-engine";

/**
 * Carga festivos que puedan afectar el tramo y calcula horas de coordinador (sin regla 44h).
 */
export async function computeHorasAlCerrarTurnoCoordinador(
  horaEntrada: Date,
  horaSalida: Date
) {
  const minMs = Math.min(horaEntrada.getTime(), horaSalida.getTime());
  const maxMs = Math.max(horaEntrada.getTime(), horaSalida.getTime());
  const padMs = 5 * 24 * 60 * 60 * 1000;

  const festivos = await prisma.festivo.findMany({
    where: {
      fecha: {
        gte: new Date(minMs - padMs),
        lte: new Date(maxMs + padMs),
      },
    },
  });

  const holidaySet = new Set(festivos.map((f) => dateKeyColombia(f.fecha)));
  return calcularHorasTurnoCoordinador(horaEntrada, horaSalida, holidaySet);
}
