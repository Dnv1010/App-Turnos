/** Formato de fechas/horas para exportación de reportes guardados (fecha turno @db.Date = calendario UTC). */

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

/** Fecha de turno/malla almacenada como @db.Date (medianoche UTC = día de calendario). */
export function getMesEspanol(fecha: Date): string {
  return MESES[fecha.getUTCMonth()];
}

export function getDiaEspanol(fecha: Date): string {
  const dow = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate())).getUTCDay();
  return DIAS[dow];
}

export function formatFechaDDMMYYYY(fecha: Date): string {
  const dd = String(fecha.getUTCDate()).padStart(2, "0");
  const mm = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = fecha.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
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
