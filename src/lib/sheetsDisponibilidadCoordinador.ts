import { appendRow, deleteRowByValues } from "@/lib/google-sheets";

const VALOR_COP = 110_000;

/** Fila: Cédula | Nombre | Fecha | Disponibilidad | Valor (coherent con reportes). */
export function appendDisponibilidadCoordinadorSheet(
  cedula: string,
  nombre: string,
  fechaStr: string
): Promise<void> {
  return appendRow("Disponibilidades", [
    cedula,
    nombre,
    fechaStr,
    "Disponible",
    VALOR_COP,
  ]).catch(console.error);
}

export function deleteDisponibilidadCoordinadorSheet(
  cedula: string,
  fechaStr: string
): Promise<void> {
  return deleteRowByValues("Disponibilidades", [
    { index: 0, value: cedula },
    { index: 2, value: fechaStr },
  ]).catch(console.error);
}
