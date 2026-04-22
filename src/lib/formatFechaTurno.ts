import { format } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Formatea la fecha de un turno sin desfase UTC (la fecha lógica viene como YYYY-MM-DD o ISO).
 */
export function formatFechaTurnoDdMmmYyyy(fecha: string | Date): string {
  const raw = typeof fecha === "string" ? fecha : fecha.toISOString();
  const fechaStr = raw.split("T")[0];
  const [y, m, d] = fechaStr.split("-").map(Number);
  return format(new Date(y, m - 1, d), "dd MMM yyyy", { locale: es });
}
