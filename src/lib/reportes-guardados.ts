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

/** Días de malla con tipo=DISPONIBLE, técnico, no incluidos ya en un reporte guardado */
export function whereDisponibilidadesMallaParaReporte(
  fechaInicio: Date,
  fechaFin: Date,
  userIds: string[]
): Prisma.MallaTurnoWhereInput {
  return {
    userId: { in: userIds },
    fecha: { gte: fechaInicio, lte: fechaFin },
    // FIX: usar tipo:"DISPONIBLE" en lugar de valor contains "disponible"
    // El campo tipo es el que determina si es disponibilidad, no el valor
    tipo: "DISPONIBLE",
    reportes: { none: {} },
    user: {
      role: "TECNICO",
      isActive: true,
    },
  };
}

/** Disponibilidades de coordinadores (misma malla, tipo DISPONIBLE). */
export function whereDisponibilidadesCoordinadoresParaReporte(
  fechaInicio: Date,
  fechaFin: Date,
  coordUserIds: string[]
): Prisma.MallaTurnoWhereInput {
  return {
    userId: { in: coordUserIds },
    fecha: { gte: fechaInicio, lte: fechaFin },
    // FIX: usar tipo:"DISPONIBLE" en lugar de valor contains "disponible"
    tipo: "DISPONIBLE",
    reportes: { none: {} },
    user: {
      role: { in: ["COORDINADOR", "COORDINADOR_INTERIOR"] },
      isActive: true,
    },
  };
}

/**
 * Disponibilidades (malla) de técnicos y coordinadores para reportes / validación POST.
 * FIX: filtrar por tipo:"DISPONIBLE" en lugar de valor contains "disponible"
 */
export function whereDisponibilidadesMallaCombinadaParaReporte(
  fechaInicio: Date,
  fechaFin: Date,
  userIdsTecnicos: string[],
  coordUserIds: string[]
): Prisma.MallaTurnoWhereInput {
  // FIX: la base ahora usa tipo:"DISPONIBLE" — correcto y consistente con el schema
  const base = {
    fecha: { gte: fechaInicio, lte: fechaFin },
    tipo: "DISPONIBLE" as const,
    reportes: { none: {} },
  };

  const or: Prisma.MallaTurnoWhereInput[] = [];
  if (userIdsTecnicos.length > 0) {
    or.push({
      ...base,
      userId: { in: userIdsTecnicos },
      user: { role: "TECNICO", isActive: true },
    });
  }
  if (coordUserIds.length > 0) {
    or.push({
      ...base,
      userId: { in: coordUserIds },
      user: { role: { in: ["COORDINADOR", "COORDINADOR_INTERIOR"] }, isActive: true },
    });
  }

  if (or.length === 0) {
    return { userId: { in: [] }, ...base };
  }
  if (or.length === 1) {
    return or[0]!;
  }
  return { OR: or };
}

const turnoCoordHeRecargoOr: Prisma.TurnoCoordinadorWhereInput = {
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

export function whereTurnosCoordinadorDisponiblesParaReporte(
  fechaInicio: Date,
  fechaFin: Date,
  userIds: string[]
): Prisma.TurnoCoordinadorWhereInput {
  return {
    userId: { in: userIds },
    fecha: { gte: fechaInicio, lte: fechaFin },
    horaSalida: { not: null },
    reportes: { none: {} },
    AND: [turnoCoordHeRecargoOr],
  };
}