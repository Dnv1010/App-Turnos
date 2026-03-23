/**
 * Cálculo de horas para turnos de coordinador (sin regla 44h ni ordinarias en el fichaje).
 * No modifica la lógica de técnicos en calcularHoras.ts / calc-engine.
 */
import {
  dateKeyColombia,
  getDayOfWeekColombia,
  getMinutesOfDayColombia,
} from "@/lib/calcularHoras";

export type ResultadoHorasCoordinador = {
  horasOrdinarias: number;
  heDiurna: number;
  heNocturna: number;
  heDominical: number;
  heNoctDominical: number;
  recNocturno: number;
  recDominical: number;
  recNoctDominical: number;
};

/**
 * Cada minuto del intervalo: domingo o festivo en Colombia → HE dominical/festiva;
 * día hábil → HE diurna o nocturna. Sin horas ordinarias ni recargos.
 */
export function calcularHorasTurnoCoordinador(
  horaEntrada: Date,
  horaSalida: Date,
  holidaySet: Set<string>
): ResultadoHorasCoordinador {
  const totalMin = Math.max(0, Math.round((horaSalida.getTime() - horaEntrada.getTime()) / 60000));

  let heDiurna = 0;
  let heNocturna = 0;
  let heFestDiurna = 0;
  let heFestNocturna = 0;

  for (let m = 0; m < totalMin; m++) {
    const t = new Date(horaEntrada.getTime() + m * 60000);
    const mod = getMinutesOfDayColombia(t);
    const isDiurna = mod >= 6 * 60 && mod < 19 * 60;
    const dow = getDayOfWeekColombia(t);
    const esFestivo = dow === 0 || holidaySet.has(dateKeyColombia(t));

    if (esFestivo) {
      if (isDiurna) heFestDiurna++;
      else heFestNocturna++;
    } else {
      if (isDiurna) heDiurna++;
      else heNocturna++;
    }
  }

  return {
    horasOrdinarias: 0,
    heDiurna: Math.round((heDiurna / 60) * 100) / 100,
    heNocturna: Math.round((heNocturna / 60) * 100) / 100,
    heDominical: Math.round((heFestDiurna / 60) * 100) / 100,
    heNoctDominical: Math.round((heFestNocturna / 60) * 100) / 100,
    recNocturno: 0,
    recDominical: 0,
    recNoctDominical: 0,
  };
}
