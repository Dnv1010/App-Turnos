import type { Prisma } from "@prisma/client";

/** Turnos con HE o recargos > 0, no cancelados */
export const turnoHeRecargoOr: Prisma.ShiftWhereInput = {
  OR: [
    { daytimeOvertimeHours: { gt: 0 } },
    { nighttimeOvertimeHours: { gt: 0 } },
    { sundayOvertimeHours: { gt: 0 } },
    { nightSundayOvertimeHours: { gt: 0 } },
    { nightSurchargeHours: { gt: 0 } },
    { sundaySurchargeHours: { gt: 0 } },
    { nightSundaySurchargeHours: { gt: 0 } },
  ],
};

export const turnoNoCanceladoOr: Prisma.ShiftWhereInput = {
  OR: [{ notes: null }, { notes: { not: { startsWith: "Cancelado" } } }],
};

export function whereTurnosDisponiblesParaReporte(
  fechaInicio: Date,
  fechaFin: Date,
  userIds: string[]
): Prisma.ShiftWhereInput {
  return {
    userId: { in: userIds },
    date: { gte: fechaInicio, lte: fechaFin },
    clockOutAt: { not: null },
    reports: { none: {} },
    AND: [turnoHeRecargoOr, turnoNoCanceladoOr],
  };
}

export function whereForaneosDisponiblesParaReporte(
  fechaInicio: Date,
  fechaFin: Date,
  userIds: string[]
): Prisma.TripRecordWhereInput {
  return {
    type: "FORANEO",
    approvalStatus: "APROBADA",
    userId: { in: userIds },
    createdAt: { gte: fechaInicio, lte: fechaFin },
    reports: { none: {} },
  };
}

/** Días de malla con tipo=DISPONIBLE, técnico, no incluidos ya en un reporte guardado */
export function whereDisponibilidadesMallaParaReporte(
  fechaInicio: Date,
  fechaFin: Date,
  userIds: string[]
): Prisma.ShiftScheduleWhereInput {
  return {
    userId: { in: userIds },
    date: { gte: fechaInicio, lte: fechaFin },
    // FIX: usar tipo:"DISPONIBLE" en lugar de valor contains "disponible"
    // El campo tipo es el que determina si es disponibilidad, no el valor
    dayType: "DISPONIBLE",
    reports: { none: {} },
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
): Prisma.ShiftScheduleWhereInput {
  return {
    userId: { in: coordUserIds },
    date: { gte: fechaInicio, lte: fechaFin },
    // FIX: usar tipo:"DISPONIBLE" en lugar de valor contains "disponible"
    dayType: "DISPONIBLE",
    reports: { none: {} },
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
): Prisma.ShiftScheduleWhereInput {
  // FIX: la base ahora usa tipo:"DISPONIBLE" — correcto y consistente con el schema
  const base = {
    date: { gte: fechaInicio, lte: fechaFin },
    dayType: "DISPONIBLE" as const,
    reports: { none: {} },
  };

  const or: Prisma.ShiftScheduleWhereInput[] = [];
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

const turnoCoordHeRecargoOr: Prisma.CoordinatorShiftWhereInput = {
  OR: [
    { daytimeOvertimeHours: { gt: 0 } },
    { nighttimeOvertimeHours: { gt: 0 } },
    { sundayOvertimeHours: { gt: 0 } },
    { nightSundayOvertimeHours: { gt: 0 } },
    { nightSurchargeHours: { gt: 0 } },
    { sundaySurchargeHours: { gt: 0 } },
    { nightSundaySurchargeHours: { gt: 0 } },
  ],
};

export function whereTurnosCoordinadorDisponiblesParaReporte(
  fechaInicio: Date,
  fechaFin: Date,
  userIds: string[]
): Prisma.CoordinatorShiftWhereInput {
  return {
    userId: { in: userIds },
    date: { gte: fechaInicio, lte: fechaFin },
    clockOutAt: { not: null },
    reports: { none: {} },
    AND: [turnoCoordHeRecargoOr],
  };
}
