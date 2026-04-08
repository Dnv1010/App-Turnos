import { Role, type Zona, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ROLES_PERMITIDOS = new Set(["COORDINADOR", "MANAGER", "ADMIN"]);

export function assertSesionReportesGuardados(profile: User | null) {
  if (!profile) {
    return { ok: false as const, status: 401 as const, error: "No autorizado" };
  }
  if (!ROLES_PERMITIDOS.has(profile.role)) {
    return { ok: false as const, status: 403 as const, error: "Sin permiso" };
  }
  return { ok: true as const, profile };
}

export function parseRangoFechasUtc(desde: string, hasta: string) {
  const [yi, mi, di] = desde.split("-").map(Number);
  const [yf, mf, df] = hasta.split("-").map(Number);
  if (!yi || !mi || !di || !yf || !mf || !df) return null;
  const fechaInicio = new Date(Date.UTC(yi, mi - 1, di, 0, 0, 0));
  const fechaFin = new Date(Date.UTC(yf, mf - 1, df, 23, 59, 59));
  return { fechaInicio, fechaFin };
}

/** Técnicos activos según rol y filtro de zona (query). */
export async function getUserIdsTecnicosParaReporte(
  profile: User,
  zonaQuery: string | null
): Promise<string[]> {
  const whereUser: { isActive: boolean; role: "TECNICO"; zona?: Zona } = {
    isActive: true,
    role: "TECNICO",
  };
  if (profile.role === "COORDINADOR") {
    whereUser.zona = profile.zona as Zona;
  } else if (zonaQuery && zonaQuery !== "ALL") {
    whereUser.zona = zonaQuery as Zona;
  }
  const usuarios = await prisma.user.findMany({
    where: whereUser,
    select: { id: true },
  });
  return usuarios.map((u) => u.id);
}

/** Coordinadores y coordinador interior en el alcance del reporte (por zona). */
export async function getUserIdsCoordinadoresParaReporte(
  profile: User,
  zonaQuery: string | null
): Promise<string[]> {
  const whereUser: {
    isActive: boolean;
    role: { in: Role[] };
    zona?: Zona;
  } = {
    isActive: true,
    role: { in: [Role.COORDINADOR, Role.COORDINADOR_INTERIOR] },
  };
  if (profile.role === "COORDINADOR") {
    whereUser.zona = profile.zona as Zona;
  } else if (zonaQuery && zonaQuery !== "ALL") {
    whereUser.zona = zonaQuery as Zona;
  }
  const usuarios = await prisma.user.findMany({
    where: whereUser,
    select: { id: true },
  });
  return usuarios.map((u) => u.id);
}

/** Zona persistida en Reporte: coordinador siempre la suya; manager/admin opcional. */
export function zonaPersistidaParaCrear(profile: User, zonaBody: string | null | undefined): string | null {
  if (profile.role === "COORDINADOR") {
    return profile.zona;
  }
  if (zonaBody && zonaBody !== "ALL") {
    return zonaBody;
  }
  return null;
}

export function whereListarReportes(profile: User, zonaQuery: string | null) {
  if (profile.role === "COORDINADOR") {
    return { zona: profile.zona };
  }
  if (zonaQuery && zonaQuery !== "ALL") {
    return { zona: zonaQuery };
  }
  return {};
}

export function puedeGestionarReporte(
  profile: User,
  reporte: { zona: string | null; creadoPor: string }
): boolean {
  if (profile.role === "MANAGER" || profile.role === "ADMIN") {
    return true;
  }
  if (profile.role === "COORDINADOR") {
    return reporte.zona === profile.zona;
  }
  return false;
}
