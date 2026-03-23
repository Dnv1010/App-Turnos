/** Ruta inicial tras login según rol (JWT ya actualizado). */
export function getPostLoginPath(role: string): string {
  switch (role) {
    case "TECNICO":
      return "/tecnico";
    case "COORDINADOR":
      return "/coordinador";
    case "COORDINADOR_INTERIOR":
      return "/coordinador-interior";
    case "MANAGER":
    case "ADMIN":
      return "/manager";
    default:
      return "/tecnico";
  }
}
