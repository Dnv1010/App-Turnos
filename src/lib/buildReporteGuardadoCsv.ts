import {
  formatFechaColombiaDDMMYYYY,
  formatFechaDDMMYYYY,
  formatHoraColombia,
  getDiaEspanol,
  getMesEspanol,
} from "@/lib/reporteExportColombia";

const TARIFA_KM_FORANEO = 1100;
const VALOR_DISPONIBILIDAD = 80000;

function escapeCsvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function totalHorasTrabajadasTurno(t: {
  horasOrdinarias: number;
  heDiurna: number;
  heNocturna: number;
  heDominical: number;
  heNoctDominical: number;
  recNocturno: number;
  recDominical: number;
  recNoctDominical: number;
}): number {
  const sum =
    Math.max(0, t.horasOrdinarias ?? 0) +
    (t.heDiurna ?? 0) +
    (t.heNocturna ?? 0) +
    (t.heDominical ?? 0) +
    (t.heNoctDominical ?? 0) +
    (t.recNocturno ?? 0) +
    (t.recDominical ?? 0) +
    (t.recNoctDominical ?? 0);
  return Math.round(sum * 100) / 100;
}

export type TurnoCsvRow = {
  fecha: Date;
  horaEntrada: Date;
  horaSalida: Date | null;
  horasOrdinarias: number;
  heDiurna: number;
  heNocturna: number;
  heDominical: number;
  heNoctDominical: number;
  recNocturno: number;
  recDominical: number;
  recNoctDominical: number;
  user: { nombre: string; cedula: string | null };
};

export type FotoForaneoCsvRow = {
  createdAt: Date;
  kmInicial: number | null;
  kmFinal: number | null;
  user: { nombre: string; cedula: string | null };
};

export type MallaDispCsvRow = {
  fecha: Date;
  valor: string;
  user: { nombre: string; cedula: string | null };
};

export type TurnoCoordinadorCsvRow = TurnoCsvRow & {
  codigoOrden: string;
  user: TurnoCsvRow["user"] & { role: string };
};

const TURNOS_HEADERS = [
  "Cédula",
  "Nombre",
  "Mes",
  "Día",
  "Fecha",
  "Hora inicio turno",
  "Hora fin turno",
  "Total horas trabajadas",
  "Horas extras diurnas",
  "Horas extras nocturnas",
  "Horas extra dominicales o festivas diurnas",
  "Horas extra dominicales o festivas nocturnas",
  "Recargo nocturno",
  "Recargo dominical o festivo diurno",
  "Recargo dominical o festivo nocturno",
];

const TURNOS_COORD_HEADERS = [
  "Cédula",
  "Nombre",
  "Rol",
  "Código/Orden",
  "Mes",
  "Día",
  "Fecha",
  "Hora inicio turno",
  "Hora fin turno",
  "Total horas trabajadas",
  "Horas extras diurnas",
  "Horas extras nocturnas",
  "Horas extra dominicales o festivas diurnas",
  "Horas extra dominicales o festivas nocturnas",
  "Recargo nocturno",
  "Recargo dominical o festivo diurno",
  "Recargo dominical o festivo nocturno",
];

/**
 * CSV por secciones: TURNOS, TURNOS COORDINADORES, FORÁNEOS, DISPONIBILIDADES.
 */
export function buildReporteGuardadoCsvString(
  turnos: TurnoCsvRow[],
  turnosCoordinador: TurnoCoordinadorCsvRow[],
  fotosForaneos: FotoForaneoCsvRow[],
  disponibilidades: MallaDispCsvRow[]
): string {
  const parts: string[] = [];

  parts.push("TURNOS");
  parts.push(TURNOS_HEADERS.map(escapeCsvCell).join(","));
  for (const t of turnos) {
    parts.push(
      [
        t.user.cedula ?? "",
        t.user.nombre ?? "",
        getMesEspanol(t.fecha),
        getDiaEspanol(t.fecha),
        formatFechaDDMMYYYY(t.fecha),
        formatHoraColombia(t.horaEntrada),
        t.horaSalida ? formatHoraColombia(t.horaSalida) : "",
        totalHorasTrabajadasTurno(t),
        t.heDiurna ?? 0,
        t.heNocturna ?? 0,
        t.heDominical ?? 0,
        t.heNoctDominical ?? 0,
        t.recNocturno ?? 0,
        t.recDominical ?? 0,
        t.recNoctDominical ?? 0,
      ]
        .map(escapeCsvCell)
        .join(",")
    );
  }

  parts.push("");
  parts.push("TURNOS COORDINADORES");
  parts.push(TURNOS_COORD_HEADERS.map(escapeCsvCell).join(","));
  for (const t of turnosCoordinador) {
    parts.push(
      [
        t.user.cedula ?? "",
        t.user.nombre ?? "",
        t.user.role,
        t.codigoOrden,
        getMesEspanol(t.fecha),
        getDiaEspanol(t.fecha),
        formatFechaDDMMYYYY(t.fecha),
        formatHoraColombia(t.horaEntrada),
        t.horaSalida ? formatHoraColombia(t.horaSalida) : "",
        totalHorasTrabajadasTurno(t),
        t.heDiurna ?? 0,
        t.heNocturna ?? 0,
        t.heDominical ?? 0,
        t.heNoctDominical ?? 0,
        t.recNocturno ?? 0,
        t.recDominical ?? 0,
        t.recNoctDominical ?? 0,
      ]
        .map(escapeCsvCell)
        .join(",")
    );
  }

  parts.push("");
  parts.push("FORÁNEOS");
  parts.push(["Cédula", "Nombre", "Fecha registro", "Km", "Monto (COP)"].map(escapeCsvCell).join(","));
  for (const f of fotosForaneos) {
    const km =
      f.kmInicial != null && f.kmFinal != null && f.kmFinal > f.kmInicial
        ? Math.round((f.kmFinal - f.kmInicial) * 100) / 100
        : 0;
    const monto = Math.round(km * TARIFA_KM_FORANEO);
    parts.push(
      [f.user.cedula ?? "", f.user.nombre ?? "", formatFechaColombiaDDMMYYYY(f.createdAt), km, monto]
        .map(escapeCsvCell)
        .join(",")
    );
  }

  parts.push("");
  parts.push("DISPONIBILIDADES");
  parts.push(["Cédula", "Nombre", "Fecha", "Disponibilidad", "Valor"].map(escapeCsvCell).join(","));
  for (const d of disponibilidades) {
    parts.push(
      [
        d.user.cedula ?? "",
        d.user.nombre ?? "",
        formatFechaDDMMYYYY(d.fecha),
        d.valor || "Disponible",
        VALOR_DISPONIBILIDAD,
      ]
        .map(escapeCsvCell)
        .join(",")
    );
  }
  const totalDisp = disponibilidades.length * VALOR_DISPONIBILIDAD;
  parts.push(["", "", "", `TOTAL: ${disponibilidades.length} días`, totalDisp].map(escapeCsvCell).join(","));

  return parts.join("\r\n");
}

export function slugNombreReporteArchivo(nombre: string, id: string): string {
  const s = nombre
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  return s || `reporte-${id.slice(0, 8)}`;
}
