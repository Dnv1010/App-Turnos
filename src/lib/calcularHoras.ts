/**
 * Motor de cálculo de horas alineado con AppScript.
 * Diurna 06:00-19:00, nocturna resto. Regla 44h semanales para recargo vs HE dom/festivo.
 */

const DIURNA_START = 6 * 60; // 06:00
const DIURNA_END = 19 * 60; // 19:00
const HE_THRESHOLD = 0.5; // mínimo 0.5h para contar HE y recargos

export interface Turno {
  horaEntrada: Date;
  horaSalida: Date;
  fecha?: Date;
}

export interface MallaDia {
  tipo: string;
  valor?: string | null;
  horaInicio?: string | null;
  horaFin?: string | null;
}

function getMinutesOfDayColombia(d: Date): number {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.getUTCHours() * 60 + colombia.getUTCMinutes();
}

function getDayOfWeekColombia(d: Date): number {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.getUTCDay();
}

export function getOrdinaryMinutes(dow: number, mallaVal: string | null | undefined): number {
  if (dow === 0) return 0;
  const v = (mallaVal ?? "").toLowerCase().trim();
  if (
    v.includes("vacacion") ||
    v.includes("dia de la familia") ||
    v.includes("semana santa") ||
    v.includes("keynote") ||
    v.includes("descanso")
  ) return 0;
  if (v === "disponible") return 0;
  if (v.includes("medio") && v.includes("cumple")) {
    if (dow === 6) return 0;
    return 240;
  }
  if (dow === 6) return 240;
  return 540;
}

export function calcularMinutosEntre(horaInicio: string, horaFin: string): number {
  const [hh1, mm1] = horaInicio.split(":").map(Number);
  const [hh2, mm2] = horaFin.split(":").map(Number);
  let start = (hh1 ?? 0) * 60 + (mm1 ?? 0);
  let end = (hh2 ?? 0) * 60 + (mm2 ?? 0);
  if (end <= start) end += 24 * 60;
  return end - start;
}

interface CalcMinutesResult {
  heDiurna: number;
  heNocturna: number;
  heFestDiurna: number;
  heFestNocturna: number;
  recNocturno: number;
  recFestDiurno: number;
  recFestNocturno: number;
}

function calcMinutes(
  start: Date,
  totalMin: number,
  ordMin: number,
  isFestivo: boolean,
  applyDomRecargo: boolean
): CalcMinutesResult {
  let heDiurna = 0;
  let heNocturna = 0;
  let heFestDiurna = 0;
  let heFestNocturna = 0;
  let recNocturno = 0;
  let recFestDiurno = 0;
  let recFestNocturno = 0;

  for (let m = 0; m < totalMin; m++) {
    const t = new Date(start.getTime() + m * 60000);
    const mod = getMinutesOfDayColombia(t);
    const isDiurna = mod >= DIURNA_START && mod < DIURNA_END;
    const isNocturna = !isDiurna;
    const withinOrd = ordMin > 0 ? m < ordMin : false;

    if (withinOrd) {
      if (isNocturna && !isFestivo) recNocturno++;
      if (applyDomRecargo) {
        if (isDiurna) recFestDiurno++;
        else recFestNocturno++;
      }
    } else {
      if (isFestivo) {
        if (isDiurna) heFestDiurna++;
        else heFestNocturna++;
      } else {
        if (isDiurna) heDiurna++;
        else heNocturna++;
      }
    }
  }

  // Mínimo 0.5h para contar HE
  const totalHEMin = heDiurna + heNocturna + heFestDiurna + heFestNocturna;
  if (totalHEMin < HE_THRESHOLD * 60) {
    heDiurna = 0;
    heNocturna = 0;
    heFestDiurna = 0;
    heFestNocturna = 0;
  }

  // Mínimo 0.5h para contar recargos
  const totalRecMin = recNocturno + recFestDiurno + recFestNocturno;
  if (totalRecMin < HE_THRESHOLD * 60) {
    recNocturno = 0;
    recFestDiurno = 0;
    recFestNocturno = 0;
  }

  return {
    heDiurna,
    heNocturna,
    heFestDiurna,
    heFestNocturna,
    recNocturno,
    recFestDiurno,
    recFestNocturno,
  };
}

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

export interface ResultadoCalcularHoras {
  horasOrdinarias: number;
  horasExtraDiurna: number;
  horasExtraNocturna: number;
  horasExtraFestivaDiurna: number;
  horasExtraFestivaNocturna: number;
  horasRecargoNocturno: number;
  horasRecargoDomFestDiurno: number;
  horasRecargoDomFestNocturno: number;
}

export function calcularHorasTurno(
  turno: Turno,
  mallaDia: MallaDia | null,
  holidaySet: Set<string>,
  weeklyOrdHours: number
): ResultadoCalcularHoras {
  const entrada = new Date(turno.horaEntrada);
  const salida = new Date(turno.horaSalida);
  const fechaTurno = turno.fecha ? new Date(turno.fecha) : entrada;
  const totalMin = Math.max(0, (salida.getTime() - entrada.getTime()) / 60000);
  const dow = getDayOfWeekColombia(fechaTurno);
  const esFestivo = holidaySet.has(dateKey(fechaTurno));
  const mallaVal = mallaDia?.valor ?? null;
  const ordMin = getOrdinaryMinutes(dow, mallaVal);

  const applyDomRecargo = (dow === 0 || esFestivo) && weeklyOrdHours < 44;

  const r = calcMinutes(entrada, totalMin, ordMin, esFestivo, applyDomRecargo);

  const minutosOrdinarios = Math.min(ordMin, totalMin);

  return {
    horasOrdinarias: Math.round((minutosOrdinarios / 60) * 100) / 100,
    horasExtraDiurna: Math.round((r.heDiurna / 60) * 100) / 100,
    horasExtraNocturna: Math.round((r.heNocturna / 60) * 100) / 100,
    horasExtraFestivaDiurna: Math.round((r.heFestDiurna / 60) * 100) / 100,
    horasExtraFestivaNocturna: Math.round((r.heFestNocturna / 60) * 100) / 100,
    horasRecargoNocturno: Math.round((r.recNocturno / 60) * 100) / 100,
    horasRecargoDomFestDiurno: Math.round((r.recFestDiurno / 60) * 100) / 100,
    horasRecargoDomFestNocturno: Math.round((r.recFestNocturno / 60) * 100) / 100,
  };
}

export function resultadoToTurnoData(r: ResultadoCalcularHoras): {
  horasOrdinarias: number;
  heDiurna: number;
  heNocturna: number;
  heDominical: number;
  heNoctDominical: number;
  recNocturno: number;
  recDominical: number;
  recNoctDominical: number;
} {
  return {
    horasOrdinarias: r.horasOrdinarias,
    heDiurna: r.horasExtraDiurna,
    heNocturna: r.horasExtraNocturna,
    heDominical: r.horasExtraFestivaDiurna,
    heNoctDominical: r.horasExtraFestivaNocturna,
    recNocturno: r.horasRecargoNocturno,
    recDominical: r.horasRecargoDomFestDiurno,
    recNoctDominical: r.horasRecargoDomFestNocturno,
  };
}