/**
 * Jornada estándar desde hora de entrada (Colombia UTC-5):
 * - Lun–Vie y domingo: 9 h (8 h trabajo + 1 h almuerzo implícito)
 * - Sábado: 4 h
 *
 * La alerta es 15 min antes del fin de esa ventana.
 */

const MS_HOUR = 60 * 60 * 1000;
const MS_MIN = 60 * 1000;

/** Día de la semana en Colombia: 0 = domingo … 6 = sábado */
export function getDowColombia(d: Date): number {
  const col = new Date(d.getTime() - 5 * MS_HOUR);
  return col.getUTCDay();
}

/** Duración total de jornada en ms desde el momento de fichaje de entrada */
export function jornadaTotalMsDesdeEntrada(horaEntrada: Date): number {
  const dow = getDowColombia(horaEntrada);
  if (dow === 6) return 4 * MS_HOUR;
  return 9 * MS_HOUR;
}

/** Momento exacto en que debe mostrarse la alerta (15 min antes del fin de jornada) */
export function getAlertaJornadaAt(horaEntrada: Date): Date {
  return new Date(horaEntrada.getTime() + jornadaTotalMsDesdeEntrada(horaEntrada) - 15 * MS_MIN);
}

/** Etiqueta legible: "9 h" o "4 h (sábado)" */
export function etiquetaJornadaEsperada(horaEntrada: Date): string {
  return getDowColombia(horaEntrada) === 6 ? "4 horas (sábado)" : "9 horas (8 h trabajo + 1 h almuerzo)";
}

/** Primer token del nombre (push / toast / modal de 15 min). */
export function primerNombreOperador(nombre: string): string {
  const p = nombre.trim().split(/\s+/)[0];
  return p || nombre.trim() || "compañero";
}

/** Cuerpo del mensaje de aviso 15 min (operador): mismo texto en cron push, SW y app. */
export function mensajeCuerpoOperador15min(primer: string): string {
  return `¡Gran trabajo el de hoy, ${primer}! 🚀 Faltan solo 15 minutos para finalizar la jornada. Es el momento perfecto para ir cerrando tareas, guardar herramientas y prepararse para un merecido descanso. ¡Gracias por su esfuerzo!`;
}
