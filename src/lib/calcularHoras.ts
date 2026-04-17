/**
 * Motor de cálculo de horas alineado con AppScript.
 * Diurna 06:00-19:00 Colombia, nocturna resto.
 * Jornada Lun-Vie: 9h (8am-5pm), pero ordinarias PAGADAS: 8h (descontando almuerzo)
 * Jornada Sábado: 4h
 * Total semana: 8h × 5 + 4h = 44h
 */

import { normalizeName, looksLikeShift } from "@/lib/bia/calc-engine";

const DIURNA_START = 6 * 60;
const DIURNA_END = 19 * 60;

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

// ============ FUNCIONES DE TIMEZONE COLOMBIA ============

export function getMinutesOfDayColombia(d: Date): number {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.getUTCHours() * 60 + colombia.getUTCMinutes();
}

/**
 * FIX: Día de la semana para fechas @db.Date (midnight UTC = día de calendario).
 * Las fechas @db.Date llegan como midnight UTC — NO restar offset de Colombia
 * porque 2026-04-06T00:00:00Z - 5h = 2026-04-05T19:00Z = domingo (INCORRECTO).
 * Si tiene hora distinta de midnight (horaEntrada/horaSalida) sí aplicar offset.
 */
export function getDayOfWeekColombia(d: Date): number {
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return d.getUTCDay();
  }
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.getUTCDay();
}

export function dateKeyColombia(d: Date): string {
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return d.toISOString().split("T")[0];
  }
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.toISOString().split("T")[0];
}

// ============ JORNADA vs ORDINARIAS PAGADAS ============

/** Jornada laboral = tiempo después del cual empiezan HE */
function getJornadaMinutes(dow: number, mallaVal: string | null | undefined): number {
  if (dow === 0) return 0;
  const v = normalizeName(mallaVal ?? "");

  if (
    v.includes("descanso") ||
    v.includes("vacacion") ||
    v.includes("dia de la familia") ||
    v.includes("semana santa") ||
    v.includes("keynote")
  ) return 0;

  if (v === "disponible") return 0;

  if (v.includes("medio") && v.includes("cumple")) {
    if (dow === 6) return 0;
    return 240;
  }

  if (looksLikeShift(mallaVal ?? null)) {
    const raw = (mallaVal ?? "").replace(/\s/g, "");
    if (raw === "8-14") return 240;
    if (dow === 6) return 240;
    return 540;
  }

  if (dow === 6) return 240;

  return 540;
}

/** Horas ordinarias PAGADAS (descontando almuerzo) */
export function getOrdinaryMinutes(dow: number, mallaVal: string | null | undefined): number {
  if (dow === 0) return 0;
  const v = normalizeName(mallaVal ?? "");

  if (
    v.includes("descanso") ||
    v.includes("vacacion") ||
    v.includes("dia de la familia") ||
    v.includes("semana santa") ||
    v.includes("keynote")
  ) return 0;

  if (v === "disponible") return 0;

  if (v.includes("medio") && v.includes("cumple")) {
    if (dow === 6) return 0;
    return 240;
  }

  if (looksLikeShift(mallaVal ?? null)) {
    const raw = (mallaVal ?? "").replace(/\s/g, "");
    if (raw === "8-14") return 240;
    if (dow === 6) return 240;
    return 480;
  }

  if (dow === 6) return 240;

  return 480;
}

export function calcularMinutosEntre(horaInicio: string, horaFin: string): number {
  const [hh1, mm1] = horaInicio.split(":").map(Number);
  const [hh2, mm2] = horaFin.split(":").map(Number);
  let start = (hh1 ?? 0) * 60 + (mm1 ?? 0);
  let end = (hh2 ?? 0) * 60 + (mm2 ?? 0);
  if (end <= start) end += 24 * 60;
  return end - start;
}

// ============ CÁLCULO MINUTO A MINUTO ============

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
  jornadaMin: number,
  holidaySet: Set<string>,
  weeklyOrdHoursLt44: boolean
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
    const dow = getDayOfWeekColombia(t);
    const isMinuteDomFestivo = dow === 0 || holidaySet.has(dateKeyColombia(t));
    const minuteApplyRecargo = isMinuteDomFestivo && weeklyOrdHoursLt44;
    const withinOrd = jornadaMin > 0 && m < jornadaMin;

    if (isMinuteDomFestivo) {
      if (minuteApplyRecargo) {
        if (isDiurna) recFestDiurno++;
        else recFestNocturno++;
      } else {
        if (isDiurna) heFestDiurna++;
        else heFestNocturna++;
      }
    } else {
      if (withinOrd) {
        if (!isDiurna) recNocturno++;
      } else {
        if (isDiurna) heDiurna++;
        else heNocturna++;
      }
    }
  }

  // Umbral 0.5h: aplica solo a HE de días hábiles.
  // Festivos/dominicales y recargos se pagan desde el primer minuto.
  if (heDiurna + heNocturna < 30) {
    heDiurna = 0;
    heNocturna = 0;
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

// ============ RESULTADO ============

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

  // FIX: usar getDayOfWeekColombia corregida que respeta midnight UTC
  const dow = getDayOfWeekColombia(fechaTurno);
  const fechaKey = fechaTurno.toISOString().split("T")[0];
  const esFestivo = holidaySet.has(fechaKey);
  const esDomFestivo = dow === 0 || esFestivo;

  const mallaVal = mallaDia?.valor ?? null;

  let jornadaMin: number;
  let ordinariasPagadasMin: number;

  if (esDomFestivo) {
    jornadaMin = 0;
    ordinariasPagadasMin = 0;
  } else {
    jornadaMin = getJornadaMinutes(dow, mallaVal);
    ordinariasPagadasMin = getOrdinaryMinutes(dow, mallaVal);
  }

  const r = calcMinutes(entrada, totalMin, jornadaMin, holidaySet, weeklyOrdHours < 44);

  const minutosOrdinarios = Math.min(ordinariasPagadasMin, totalMin);

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