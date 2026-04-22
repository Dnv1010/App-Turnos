import * as XLSX from "xlsx";
import {
  formatFechaDDMMYYYY,
  formatHoraColombia,
  getDiaEspanol,
  getMesEspanol,
} from "@/lib/reporteExportColombia";
import { valorDisponibilidadMallaPorRol } from "@/lib/reporteDisponibilidadValor";
import { getRoleLabel } from "@/lib/roleLabels";

const TARIFA_KM_FORANEO = 1100;

type TurnoRow = {
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

type FotoForaneoRow = {
  userId: string;
  kmInicial: number | null;
  kmFinal: number | null;
  user: { nombre: string; cedula: string | null };
};

type MallaDispRow = {
  fecha: Date;
  valor: string;
  user: { nombre: string; cedula: string | null; role: string };
};

export type TurnoCoordinadorExportRow = {
  fecha: Date;
  horaEntrada: Date;
  horaSalida: Date | null;
  codigoOrden: string;
  horasOrdinarias: number;
  heDiurna: number;
  heNocturna: number;
  heDominical: number;
  heNoctDominical: number;
  recNocturno: number;
  recDominical: number;
  recNoctDominical: number;
  user: { nombre: string; cedula: string | null; role: string };
};

/**
 * FIX Bug 1: Total horas trabajadas = ordinarias + HE solamente.
 * Los recargos (nocturno, dominical) NO son horas adicionales —
 * son un porcentaje sobre horas ya contadas en ordinarias.
 * Sumarlos duplicaría esas horas en el total.
 */
function totalHorasTrabajadasTurno(t: TurnoRow): number {
  const sum =
    Math.max(0, t.horasOrdinarias ?? 0) +
    (t.heDiurna ?? 0) +
    (t.heNocturna ?? 0) +
    (t.heDominical ?? 0) +
    (t.heNoctDominical ?? 0);
  // recNocturno, recDominical, recNoctDominical NO se suman:
  // son recargos sobre horas ordinarias ya contadas arriba
  return Math.round(sum * 100) / 100;
}

function totalHorasTrabajadasCoord(t: TurnoCoordinadorExportRow): number {
  // Coordinador: horasOrdinarias siempre 0, todo son HE
  const sum =
    (t.heDiurna ?? 0) +
    (t.heNocturna ?? 0) +
    (t.heDominical ?? 0) +
    (t.heNoctDominical ?? 0);
  return Math.round(sum * 100) / 100;
}

function rowTurnoCoordExcel(t: TurnoCoordinadorExportRow) {
  return {
    "Cédula": t.user.cedula ?? "",
    Nombre: t.user.nombre ?? "",
    Rol: getRoleLabel(t.user.role),
    "Código/Orden": t.codigoOrden,
    Mes: getMesEspanol(t.fecha),
    Día: getDiaEspanol(t.fecha),
    Fecha: formatFechaDDMMYYYY(t.fecha),
    "Hora inicio turno": formatHoraColombia(t.horaEntrada),
    "Hora fin turno": t.horaSalida ? formatHoraColombia(t.horaSalida) : "",
    "Total horas trabajadas": totalHorasTrabajadasCoord(t),
    "Horas extras diurnas": t.heDiurna ?? 0,
    "Horas extras nocturnas": t.heNocturna ?? 0,
    "HE dominicales o festivas diurnas": t.heDominical ?? 0,
    "HE dominicales o festivas nocturnas": t.heNoctDominical ?? 0,
    "Recargo nocturno": t.recNocturno ?? 0,
    "Recargo dominical o festivo diurno": t.recDominical ?? 0,
    "Recargo dominical o festivo nocturno": t.recNoctDominical ?? 0,
  };
}

/**
 * Excel reporte guardado: Resumen, Turnos, Turnos Coordinadores, Foráneos, Disponibilidades.
 */
export function buildReporteGuardadoExcelBuffer(
  turnos: TurnoRow[],
  turnosCoordinador: TurnoCoordinadorExportRow[],
  fotosForaneos: FotoForaneoRow[],
  disponibilidades: MallaDispRow[],
  filenameBase: string
): { buffer: Buffer; filename: string } {
  const dataTurnos = turnos.map((t) => ({
    "Cédula": t.user.cedula ?? "",
    Nombre: t.user.nombre ?? "",
    Mes: getMesEspanol(t.fecha),
    Día: getDiaEspanol(t.fecha),
    Fecha: formatFechaDDMMYYYY(t.fecha),
    "Hora inicio turno": formatHoraColombia(t.horaEntrada),
    "Hora fin turno": t.horaSalida ? formatHoraColombia(t.horaSalida) : "",
    // FIX: total = ordinarias + HE, sin recargos
    "Total horas trabajadas": totalHorasTrabajadasTurno(t),
    "Horas extras diurnas": t.heDiurna ?? 0,
    "Horas extras nocturnas": t.heNocturna ?? 0,
    "HE dominicales o festivas diurnas": t.heDominical ?? 0,
    "HE dominicales o festivas nocturnas": t.heNoctDominical ?? 0,
    "Recargo nocturno": t.recNocturno ?? 0,
    "Recargo dominical o festivo diurno": t.recDominical ?? 0,
    "Recargo dominical o festivo nocturno": t.recNoctDominical ?? 0,
  }));

  const dataTurnosCoord = turnosCoordinador.map((t) => rowTurnoCoordExcel(t));

  const foraneosPorTecnico: Record<
    string,
    {
      Nombre: string;
      Cedula: string | null;
      "Cantidad Foraneos": number;
      "Total Km": number;
      "Total a Pagar": number;
    }
  > = {};

  fotosForaneos.forEach((f) => {
    const key = f.userId;
    const km =
      f.kmInicial != null && f.kmFinal != null && f.kmFinal > f.kmInicial
        ? f.kmFinal - f.kmInicial
        : 0;
    if (!foraneosPorTecnico[key]) {
      foraneosPorTecnico[key] = {
        Nombre: f.user.nombre,
        Cedula: f.user.cedula,
        "Cantidad Foraneos": 0,
        "Total Km": 0,
        "Total a Pagar": 0,
      };
    }
    foraneosPorTecnico[key]["Cantidad Foraneos"] += 1;
    foraneosPorTecnico[key]["Total Km"] += km;
    foraneosPorTecnico[key]["Total a Pagar"] += Math.round(km * TARIFA_KM_FORANEO);
  });

  const dataForaneos = Object.values(foraneosPorTecnico).map((r) => ({
    ...r,
    "Total Km": Math.round(r["Total Km"] * 100) / 100,
  }));

  const resumenPorTecnico: Record<
    string,
    {
      Nombre: string;
      Cedula: string | null;
      "Total Turnos": number;
      "Total HE": number;
      "Total Recargos": number;
    }
  > = {};

  turnos.forEach((t) => {
    const key = `${t.user.nombre}|${t.user.cedula ?? ""}`;
    if (!resumenPorTecnico[key]) {
      resumenPorTecnico[key] = {
        Nombre: t.user.nombre,
        Cedula: t.user.cedula,
        "Total Turnos": 0,
        "Total HE": 0,
        "Total Recargos": 0,
      };
    }
    resumenPorTecnico[key]["Total Turnos"] += 1;
    resumenPorTecnico[key]["Total HE"] +=
      (t.heDiurna ?? 0) + (t.heNocturna ?? 0) + (t.heDominical ?? 0) + (t.heNoctDominical ?? 0);
    resumenPorTecnico[key]["Total Recargos"] +=
      (t.recNocturno ?? 0) + (t.recDominical ?? 0) + (t.recNoctDominical ?? 0);
  });

  const dataResumen = Object.values(resumenPorTecnico).map((r) => ({
    ...r,
    "Total HE": Math.round(r["Total HE"] * 100) / 100,
    "Total Recargos": Math.round(r["Total Recargos"] * 100) / 100,
  }));

  const dataDisponibilidades = disponibilidades.map((d) => {
    const valor = valorDisponibilidadMallaPorRol(d.user.role);
    return {
      "Cédula": d.user.cedula ?? "",
      Nombre: d.user.nombre ?? "",
      Rol: getRoleLabel(d.user.role),
      Fecha: formatFechaDDMMYYYY(d.fecha),
      Disponibilidad: d.valor || "Disponible",
      Valor: valor,
    };
  });

  const nDisp = dataDisponibilidades.length;
  if (nDisp > 0) {
    const sumValor = disponibilidades.reduce(
      (s, d) => s + valorDisponibilidadMallaPorRol(d.user.role),
      0
    );
    dataDisponibilidades.push({
      "Cédula": "",
      Nombre: "TOTAL",
      Rol: "",
      Fecha: "",
      Disponibilidad: `${nDisp} días`,
      Valor: sumValor,
    });
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataResumen), "Resumen");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataTurnos), "Turnos");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataTurnosCoord), "Turnos Coordinadores");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataForaneos), "Foraneos");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataDisponibilidades), "Disponibilidades");
  const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  return {
    buffer,
    filename: `reporte_guardado_${filenameBase}.xlsx`,
  };
}

/** @deprecated Usar buildReporteGuardadoExcelBuffer con disponibilidades vacías si aplica */
export function buildReporteTurnosForaneosExcelBuffer(
  turnos: TurnoRow[],
  fotosForaneos: FotoForaneoRow[],
  filenameBase: string
): { buffer: Buffer; filename: string } {
  return buildReporteGuardadoExcelBuffer(turnos, [], fotosForaneos, [], filenameBase);
}