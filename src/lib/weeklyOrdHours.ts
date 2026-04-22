/**
 * Regla 44h BIA: las horas ordinarias acumuladas para domingo/festivo
 * son solo Lun–Sáb (los domingos no suman).
 */

/** Día de la semana en Colombia (0=Dom, 1=Lun, …, 6=Sáb) */
function getDayOfWeekColombia(d: Date): number {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.getUTCDay();
}

/**
 * Suma `horasOrdinarias` de turnos cerrados en la semana, excluyendo domingos.
 * @param excludeTurnId — no sumar el turno en curso (p. ej. al cerrar/editar).
 */
export function sumWeeklyOrdHoursMonSat(
  turnos: Array<{ id?: string; fecha: Date; horasOrdinarias?: number | null }>,
  excludeTurnId?: string
): number {
  let sum = 0;
  for (const t of turnos) {
    if (excludeTurnId && t.id === excludeTurnId) continue;
    if (getDayOfWeekColombia(t.fecha) === 0) continue;
    sum += Math.max(0, t.horasOrdinarias ?? 0);
  }
  return sum;
}
