/** Valor diario por disponibilidad en malla (reportes / Sheets). */
export const VALOR_DISPONIBILIDAD_TECNICO = 80_000;
export const VALOR_DISPONIBILIDAD_COORDINADOR = 110_000;

export function valorDisponibilidadMallaPorRol(role: string): number {
  if (role === "TECNICO") return VALOR_DISPONIBILIDAD_TECNICO;
  return VALOR_DISPONIBILIDAD_COORDINADOR;
}
