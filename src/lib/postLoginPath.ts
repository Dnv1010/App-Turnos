/** Ruta inicial tras login según rol (JWT ya actualizado). */
export function getPostLoginPath(role: string): string {
  switch (role) {
    case "TECNICO": return "/";
    case "COORDINADOR": return "/";
    case "COORDINADOR_INTERIOR": return "/";
    case "SUPPLY": return "/";
    case "MANAGER": return "/"; case "MANAGER2": case "ADMIN": return "/";
    case "PENDIENTE":
      return "/login?pendiente=true";
    default: return "/";
  }
}
