/**
 * Utilidades para filtrar turnos por rango de fecha en zona Colombia (UTC-5).
 *
 * Problema que resuelve: `Shift.date` se guarda como midnight UTC del día Colombia
 * del clockInAt. Un turno que empieza sábado 22:00 (Colombia) y termina domingo
 * tiene `date = sábado` aunque la mayor parte sea trabajo dominical. Un filtro
 * ingenuo `date >= domingo` pierde ese turno.
 *
 * Estrategia: expandir el rango -1 día en la query SQL y filtrar luego en memoria
 * incluyendo turnos del día anterior cuya entrada haya sido nocturna (cruzaron
 * medianoche). Mismo enfoque que usa /api/turnos.
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
 * incluyendo turnos cuyo `date` es 1 día antes y cruzaron medianoche.
 */
export function rangoDateExpandidoUtc(desde: string, hasta: string): { gte: Date; lte: Date } {
  const desdeExpanded = addDaysYmd(desde, -1);
  return {
    gte: new Date(desdeExpanded + "T00:00:00.000Z"),
    lte: new Date(hasta + "T23:59:59.999Z"),
  };
}

/**
 * Decide si un turno cae dentro del rango Colombia [desde, hasta] (YYYY-MM-DD inclusivo).
 * Incluye turnos cuyo `date` es 1 día anterior pero la entrada fue nocturna.
 */
export function turnoEnRangoFechaCalendario(
  t: { date: Date; clockInAt: Date },
  desde: string,
  hasta: string
): boolean {
  const F = dateKeyColombia(new Date(t.date));
  if (F >= desde && F <= hasta) return true;
  const siguiente = addDaysYmd(F, 1);
  return (
    siguiente >= desde &&
    siguiente <= hasta &&
    isNocturnalEntradaColombia(new Date(t.clockInAt))
  );
}
