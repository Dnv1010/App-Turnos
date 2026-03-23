import type { Prisma } from "@prisma/client";

/** Turnos con HE o recargos > 0, no cancelados */
export const turnoHeRecargoOr: Prisma.TurnoWhereInput = {
  OR: [
    { heDiurna: { gt: 0 } },
    { heNocturna: { gt: 0 } },
    { heDominical: { gt: 0 } },
    { heNoctDominical: { gt: 0 } },
    { recNocturno: { gt: 0 } },
    { recDominical: { gt: 0 } },
    { recNoctDominical: { gt: 0 } },
  ],
};

export const turnoNoCanceladoOr: Prisma.TurnoWhereInput = {
  OR: [{ observaciones: null }, { observaciones: { not: { startsWith: "Cancelado" } } }],
};

export function whereTurnosDisponiblesParaReporte(
  fechaInicio: Date,
  fechaFin: Date,
  userIds: string[]
): Prisma.TurnoWhereInput {
  return {
    userId: { in: userIds },
    fecha: { gte: fechaInicio, lte: fechaFin },
    horaSalida: { not: null },
    reportes: { none: {} },
    AND: [turnoHeRecargoOr, turnoNoCanceladoOr],
  };
}

export function whereForaneosDisponiblesParaReporte(
  fechaInicio: Date,
  fechaFin: Date,
  userIds: string[]
): Prisma.FotoRegistroWhereInput {
  return {
    tipo: "FORANEO",
    estadoAprobacion: "APROBADA",
    userId: { in: userIds },
    createdAt: { gte: fechaInicio, lte: fechaFin },
    reportes: { none: {} },
  };
}
