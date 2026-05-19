/**
 * Formato de fechas/horas para exportación de reportes guardados.
 *
 * IMPORTANTE: pasar el `clockInAt` (timestamp UTC real del fichaje), NO el
 * campo `shift.date` (@db.Date), que puede estar desincronizado por timezone
 * de Postgres. Estas funciones derivan el día Colombia desde el momento real.
 */
import { dateKeyColombia } from "@/lib/turnoRangoColombia";

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Derivar [year, month1Based, day] del día Colombia del momento (clockInAt). */
function ymdColombia(momento: Date): [number, number, number] {
  const ymd = dateKeyColombia(momento); // "2026-05-17"
  const [y, m, d] = ymd.split("-").map(Number);
  return [y, m, d];
}

export function getMesEspanol(momento: Date): string {
  const [, m] = ymdColombia(momento);
  return MESES[m - 1];
}

export function getDiaEspanol(momento: Date): string {
  const [y, m, d] = ymdColombia(momento);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return DIAS[dow];
}

export function formatFechaDDMMYYYY(momento: Date): string {
  const [y, m, d] = ymdColombia(momento);
  const dd = String(d).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return `${dd}/${mm}/${y}`;
}

/** Hora en zona America/Bogota (entrada/salida de turno). */
export function formatHoraColombia(fecha: Date): string {
  const s = fecha.toLocaleTimeString("en-GB", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return s.length >= 5 ? s.slice(0, 5) : s;
}

/** Fecha calendario en Colombia (p. ej. createdAt de un registro). */
export function formatFechaColombiaDDMMYYYY(fecha: Date): string {
  const iso = fecha.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const [y, m, dd] = iso.split("-");
  return `${dd}/${m}/${y}`;
}
