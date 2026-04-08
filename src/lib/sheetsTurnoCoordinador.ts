import { appendRow, deleteRowByValues } from "@/lib/google-sheets";
import { dateKeyColombia } from "@/lib/bia/calc-engine";

/** Misma forma que cierre de turno técnico en `appendRow("Turnos", ...)`. */
function timeColombia(d: Date): string {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  const hh = String(colombia.getUTCHours()).padStart(2, "0");
  const mm = String(colombia.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export type TurnoCoordSheetPayload = {
  nombre: string;
  cedula: string | null;
  fecha: Date;
  horaEntrada: Date;
  horaSalida: Date;
  horasOrdinarias: number;
  heDiurna: number;
  heNocturna: number;
  heDominical: number;
  heNoctDominical: number;
  recNocturno: number;
  recDominical: number;
  recNoctDominical: number;
};

export function appendTurnoCoordinadorSheetRow(p: TurnoCoordSheetPayload): Promise<void> {
  const totalHoras =
    Math.round(((p.horaSalida.getTime() - p.horaEntrada.getTime()) / (1000 * 60 * 60)) * 100) / 100;

  return appendRow("Turnos", [
    p.nombre,
    p.cedula ?? "",
    dateKeyColombia(p.fecha),
    timeColombia(p.horaEntrada),
    timeColombia(p.horaSalida),
    totalHoras,
    Math.max(0, p.horasOrdinarias ?? 0),
    p.heDiurna ?? 0,
    p.heNocturna ?? 0,
    p.heDominical ?? 0,
    p.heNoctDominical ?? 0,
    p.recNocturno ?? 0,
    p.recDominical ?? 0,
    p.recNoctDominical ?? 0,
  ]).catch(console.error);
}

/** Elimina fila en hoja Turnos: Cédula (B), Fecha (C), Entrada (D) — índices 1,2,3. */
export function deleteTurnoCoordinadorSheetRow(
  cedula: string,
  fechaKey: string,
  horaEntradaStr: string
): Promise<void> {
  return deleteRowByValues("Turnos", [
    { index: 1, value: cedula },
    { index: 2, value: fechaKey },
    { index: 3, value: horaEntradaStr },
  ]).catch(console.error);
}

export async function replaceTurnoCoordinadorSheetRow(
  prev: { cedula: string | null; fecha: Date; horaEntrada: Date } | null,
  next: TurnoCoordSheetPayload
): Promise<void> {
  if (prev?.cedula) {
    await deleteTurnoCoordinadorSheetRow(
      prev.cedula,
      dateKeyColombia(prev.fecha),
      timeColombia(prev.horaEntrada)
    );
  }
  await appendTurnoCoordinadorSheetRow(next);
}
