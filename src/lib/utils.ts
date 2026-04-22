/** Instante actual (para fichaje). En frontend mostrar con toLocaleTimeString(..., { timeZone: "America/Bogota" }). */
export function nowColombia(): Date {
  return new Date();
}

/** Fecha/hora actual en zona Colombia (UTC-5). getUTCFullYear/getUTCMonth/getUTCDate del resultado = día en Colombia. */
export function fechaColombia(): Date {
  const now = new Date();
  const colombiaOffset = -5 * 60; // UTC-5 en minutos
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + colombiaOffset * 60000);
}

/** Día actual en Colombia (UTC-5), válido en cualquier zona horaria del servidor. Para construir fecha: Date.UTC(y, m, d, 12, 0, 0). */
export function getDatePartsColombia(): { y: number; m: number; d: number } {
  const d = new Date(new Date().getTime() - 5 * 60 * 60 * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}
