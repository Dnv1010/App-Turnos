/**
 * Utilidades para filtrar turnos por rango de fecha en zona Colombia (UTC-5).
 *
 * Problema que resuelve: `Shift.date` (@db.Date) puede estar desincronizado por
 * timezone de Postgres (si la sesión está en UTC-5, midnight UTC se trunca al
 * día anterior). Solución: derivar el día Colombia del `clockInAt` (timestamp
 * UTC real), no del campo `date`.
 *
 * Estrategia: query SQL con rango expandido (-1 y +1 día) y filtrar luego en
 * memoria por `dateKeyColombia(clockInAt)`.
 */

/** Convierte Date a fecha Colombia (UTC-5) como string YYYY-MM-DD. */
export function dateKeyColombia(d: Date): string {
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return d.toISOString().split("T")[0];
  }
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.toISOString().split("T")[0];
}

/** YYYY-MM-DD + delta días (calendario). */
export function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().split("T")[0];
}

/** Minutos del día en Colombia (UTC-5). */
function getMinutesOfDayColombia(d: Date): number {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.getUTCHours() * 60 + colombia.getUTCMinutes();
}

/** Entrada en horario nocturno Colombia (antes de 04:00 o desde 19:00). */
export function isNocturnalEntradaColombia(horaEntrada: Date): boolean {
  const mins = getMinutesOfDayColombia(horaEntrada);
  const DIURNA_START = 4 * 60;
  const DIURNA_END = 19 * 60;
  return mins < DIURNA_START || mins >= DIURNA_END;
}

/**
 * Devuelve el `where` de Prisma para `date` que captura turnos del rango Colombia,
 * con margen de ±1 día para tolerar shifts cuyo `date` esté desincronizado por
 * timezone Postgres o que hayan cruzado medianoche.
 */
export function rangoDateExpandidoUtc(desde: string, hasta: string): { gte: Date; lte: Date } {
  const desdeExpanded = addDaysYmd(desde, -1);
  const hastaExpanded = addDaysYmd(hasta, 1);
  return {
    gte: new Date(desdeExpanded + "T00:00:00.000Z"),
    lte: new Date(hastaExpanded + "T23:59:59.999Z"),
  };
}

/**
 * Decide si un turno cae dentro del rango Colombia [desde, hasta] (YYYY-MM-DD inclusivo).
 *
 * El día Colombia se deriva del `clockInAt` (timestamp UTC real), NO del campo
 * `date` que puede estar desincronizado por timezone Postgres.
 */
export function turnoEnRangoFechaCalendario(
  t: { clockInAt: Date },
  desde: string,
  hasta: string
): boolean {
  const F = dateKeyColombia(t.clockInAt);
  return F >= desde && F <= hasta;
}
