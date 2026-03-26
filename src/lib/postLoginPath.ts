/** Ruta inicial tras login según rol (JWT ya actualizado). */
export function getPostLoginPath(role: string): string {
  switch (role) {
    case "TECNICO":
      return "/tecnico";
    case "COORDINADOR":
      return "/coordinador";
    case "COORDINADOR_INTERIOR":
      return "/coordinador-interior";
    case "SUPPLY":
      return "/supply";
    case "MANAGER":
    case "ADMIN":
      return "/manager";
    case "PENDIENTE":
      return "/login?pendiente=true";
    default:
      return "/tecnico";
  }
}
