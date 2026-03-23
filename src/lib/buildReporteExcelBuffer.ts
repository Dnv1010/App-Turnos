import * as XLSX from "xlsx";

const TARIFA_KM_FORANEO = 1100;

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

function timeColombia(d: Date): string {
  return new Date(d).toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

/**
 * Excel con hojas Turnos y Foráneos (misma estructura que reportes/excel para esas hojas).
 */
export function buildReporteTurnosForaneosExcelBuffer(
  turnos: TurnoRow[],
  fotosForaneos: FotoForaneoRow[],
  filenameBase: string
): { buffer: Buffer; filename: string } {
  const dataTurnos = turnos.map((t) => {
    const totalHoras = t.horaSalida
      ? Math.round(((t.horaSalida.getTime() - t.horaEntrada.getTime()) / (1000 * 60 * 60)) * 100) / 100
      : 0;
    return {
      Nombre: t.user.nombre,
      Cedula: t.user.cedula,
      Fecha: dateKey(t.fecha),
      Entrada: timeColombia(t.horaEntrada),
      Salida: t.horaSalida ? timeColombia(t.horaSalida) : "",
      "Total Horas": totalHoras,
      "Horas Ordinarias": Math.max(0, t.horasOrdinarias ?? 0),
      "HE Diurna": t.heDiurna ?? 0,
      "HE Nocturna": t.heNocturna ?? 0,
      "HE Dom/Fest Diurna": t.heDominical ?? 0,
      "HE Dom/Fest Nocturna": t.heNoctDominical ?? 0,
      "Recargo Nocturno": t.recNocturno ?? 0,
      "Recargo Dom/Fest Diurno": t.recDominical ?? 0,
      "Recargo Dom/Fest Nocturno": t.recNoctDominical ?? 0,
    };
  });

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
      f.kmInicial != null && f.kmFinal != null && f.kmFinal > f.kmInicial ? f.kmFinal - f.kmInicial : 0;
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

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataResumen), "Resumen");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataTurnos), "Turnos");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataForaneos), "Foraneos");
  const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  return {
    buffer,
    filename: `reporte_guardado_${filenameBase}.xlsx`,
  };
}
