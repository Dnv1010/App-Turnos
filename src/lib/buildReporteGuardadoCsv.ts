const TARIFA_KM_FORANEO = 1100;

function escapeCsvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

type TurnoRow = {
  fecha: Date;
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
  createdAt: Date;
  kmInicial: number | null;
  kmFinal: number | null;
  user: { nombre: string; cedula: string | null };
};

const HEADERS = [
  "Nombre",
  "Cédula",
  "Fecha",
  "Tipo",
  "Detalle",
  "Monto",
  "HE Diurna",
  "HE Nocturna",
  "HE Dom/Fest Diurna",
  "HE Dom/Fest Nocturna",
  "Recargo Nocturno",
  "Recargo Dom/Fest Diurno",
  "Recargo Dom/Fest Nocturno",
  "Km",
  "Total a pagar foráneo (COP)",
] as const;

/**
 * CSV unificado: filas Turno y Foráneo con columnas de HE/recargos (solo turnos) y km/monto (solo foráneos).
 */
export function buildReporteGuardadoCsvString(turnos: TurnoRow[], fotosForaneos: FotoForaneoRow[]): string {
  const lines: string[][] = [HEADERS as unknown as string[]];

  for (const t of turnos) {
    const he =
      (t.heDiurna ?? 0) +
      (t.heNocturna ?? 0) +
      (t.heDominical ?? 0) +
      (t.heNoctDominical ?? 0);
    const rec =
      (t.recNocturno ?? 0) + (t.recDominical ?? 0) + (t.recNoctDominical ?? 0);
    const detalle = `Ordinarias ${Math.max(0, t.horasOrdinarias ?? 0)}h; HE ${Math.round(he * 100) / 100}h; Recargos ${Math.round(rec * 100) / 100}h`;
    lines.push([
      t.user.nombre,
      t.user.cedula ?? "",
      dateKey(t.fecha),
      "Turno",
      detalle,
      "",
      String(t.heDiurna ?? 0),
      String(t.heNocturna ?? 0),
      String(t.heDominical ?? 0),
      String(t.heNoctDominical ?? 0),
      String(t.recNocturno ?? 0),
      String(t.recDominical ?? 0),
      String(t.recNoctDominical ?? 0),
      "",
      "",
    ]);
  }

  for (const f of fotosForaneos) {
    const km =
      f.kmInicial != null && f.kmFinal != null && f.kmFinal > f.kmInicial
        ? Math.round((f.kmFinal - f.kmInicial) * 100) / 100
        : 0;
    const monto = Math.round(km * TARIFA_KM_FORANEO);
    const detalle = km > 0 ? `Foráneo aprobado — ${km} km` : "Foráneo aprobado";
    lines.push([
      f.user.nombre,
      f.user.cedula ?? "",
      dateKey(f.createdAt),
      "Foráneo",
      detalle,
      String(monto),
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      String(km),
      String(monto),
    ]);
  }

  return lines.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
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
