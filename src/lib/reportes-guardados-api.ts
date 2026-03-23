import type { Session } from "next-auth";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ROLES_PERMITIDOS = new Set(["COORDINADOR", "MANAGER", "ADMIN"]);

export function assertSesionReportesGuardados(session: Session | null) {
  if (!session?.user) {
    return { ok: false as const, status: 401 as const, error: "No autorizado" };
  }
  if (!ROLES_PERMITIDOS.has(session.user.role)) {
    return { ok: false as const, status: 403 as const, error: "Sin permiso" };
  }
  return { ok: true as const, session };
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
  session: Session,
  zonaQuery: string | null
): Promise<string[]> {
  const whereUser: { isActive: boolean; role: "TECNICO"; zona?: "BOGOTA" | "COSTA" } = {
    isActive: true,
    role: "TECNICO",
  };
  if (session.user.role === "COORDINADOR") {
    whereUser.zona = session.user.zona as "BOGOTA" | "COSTA";
  } else if (zonaQuery && zonaQuery !== "ALL") {
    whereUser.zona = zonaQuery as "BOGOTA" | "COSTA";
  }
  const usuarios = await prisma.user.findMany({
    where: whereUser,
    select: { id: true },
  });
  return usuarios.map((u) => u.id);
}

/** Coordinadores y coordinador interior en el alcance del reporte (por zona). */
export async function getUserIdsCoordinadoresParaReporte(
  session: Session,
  zonaQuery: string | null
): Promise<string[]> {
  const whereUser: {
    isActive: boolean;
    role: { in: Role[] };
    zona?: "BOGOTA" | "COSTA";
  } = {
    isActive: true,
    role: { in: [Role.COORDINADOR, Role.COORDINADOR_INTERIOR] },
  };
  if (session.user.role === "COORDINADOR") {
    whereUser.zona = session.user.zona as "BOGOTA" | "COSTA";
  } else if (zonaQuery && zonaQuery !== "ALL") {
    whereUser.zona = zonaQuery as "BOGOTA" | "COSTA";
  }
  const usuarios = await prisma.user.findMany({
    where: whereUser,
    select: { id: true },
  });
  return usuarios.map((u) => u.id);
}

/** Zona persistida en Reporte: coordinador siempre la suya; manager/admin opcional. */
export function zonaPersistidaParaCrear(session: Session, zonaBody: string | null | undefined): string | null {
  if (session.user.role === "COORDINADOR") {
    return session.user.zona;
  }
  if (zonaBody && zonaBody !== "ALL") {
    return zonaBody;
  }
  return null;
}

export function whereListarReportes(session: Session, zonaQuery: string | null) {
  if (session.user.role === "COORDINADOR") {
    return { zona: session.user.zona };
  }
  if (zonaQuery && zonaQuery !== "ALL") {
    return { zona: zonaQuery };
  }
  return {};
}

export function puedeGestionarReporte(
  session: Session,
  reporte: { zona: string | null; creadoPor: string }
): boolean {
  if (session.user.role === "MANAGER" || session.user.role === "ADMIN") {
    return true;
  }
  if (session.user.role === "COORDINADOR") {
    return reporte.zona === session.user.zona;
  }
  return false;
}
