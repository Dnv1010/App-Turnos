/**
 * Mapeo de roles internos a nombres visibles en la UI.
 * Los roles internos NO cambian (Prisma enum), solo las etiquetas.
 */
export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    TECNICO: "Operador",
    COORDINADOR: "Líder de Zona",
    COORDINADOR_INTERIOR: "Líder de Zona",
    MANAGER: "Manager",
    ADMIN: "Administrador",
  };
  return labels[role] || role;
}

/**
 * Mapeo de zonas internas a nombres visibles.
 */
export function getZonaLabel(zona: string): string {
  const labels: Record<string, string> = {
    BOGOTA: "Bogotá",
    COSTA: "Costa",
    INTERIOR: "Interior",
  };
  return labels[zona] || zona;
}

/**
 * Para mostrar el rol completo con zona cuando es Líder.
 * Ejemplo: "Líder de Zona — Bogotá", "Líder de Zona — Interior"
 */
export function getRoleLabelConZona(role: string, zona?: string | null): string {
  const label = getRoleLabel(role);
  if ((role === "COORDINADOR" || role === "COORDINADOR_INTERIOR") && zona) {
    return `${label} — ${getZonaLabel(zona)}`;
  }
  return label;
}
