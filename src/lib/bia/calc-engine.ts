/**
 * Motor de cálculo BIA - Alineado con AppScript
 * Diurna 06:00-19:00 Colombia, nocturna resto
 * Jornada Lun-Vie: 9h, Ordinarias pagadas: 8h (descontando almuerzo)
 * Jornada Sábado: 4h
 * Total semana: 44h
 */

import { startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns";

export interface TurnoData {
  fecha: Date;
  horaEntrada: Date;
  horaSalida: Date;
  esFestivo: boolean;
  esDomingo: boolean;
}

export interface ResultadoCalculo {
  horasOrdinarias: number;
  heDiurna: number;
  heNocturna: number;
  heDominical: number;
  heNoctDominical: number;
  recNocturno: number;
  recDominical: number;
  recNoctDominical: number;
}

export interface ResumenSemanal {
  horasOrdinariasSemana: number;
  aplicaRegla44h: boolean;
}

export interface AlertaBIA {
  tipo: string;
  id: string;
  correo: string;
  fecha: string;
  detalle: string;
  malla?: string;
}

const DIURNA_START = 6 * 60;
const DIURNA_END = 19 * 60;
const UMBRAL_HE = 0.5;

// ============ FUNCIONES DE TIMEZONE COLOMBIA ============

function getMinutesOfDayColombia(d: Date): number {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.getUTCHours() * 60 + colombia.getUTCMinutes();
}

function getDayOfWeekColombia(d: Date): number {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.getUTCDay();
}

export function dateKeyColombia(d: Date): string {
  // Si es medianoche exacta UTC → es campo @db.Date de Prisma,
  // no restar horas para evitar desfase de un día
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return d.toISOString().split("T")[0];
  }
  // Si tiene hora → convertir a Colombia (UTC-5)
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.toISOString().split("T")[0];
}

// ============ NORMALIZACIÓN ============

export function normalizeName(val: string): string {
  return (val || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function looksLikeShift(val: string | null): boolean {
  if (!val) return false;
  const raw = val.replace(/\s/g, "");
  return /^\d+-\d+$/.test(raw);
}

// ============ JORNADA vs ORDINARIAS PAGADAS ============

/** Jornada laboral = tiempo después del cual empiezan HE */
function getJornadaMinutes(
  date: Date,
  mallaVal: string | null,
  holidaySet: Set<string>
): number {
  const dow = getDayOfWeekColombia(date);
  const dateKey = dateKeyColombia(date);
  const isFestivo = holidaySet.has(dateKey);

  if (dow === 0 || isFestivo) return 0;

  const v = normalizeName(mallaVal || "");

  if (
    v.includes("descanso") ||
    v.includes("vacacion") ||
    v.includes("dia de la familia") ||
    v.includes("semana santa") ||
    v.includes("keynote")
  ) return 0;

  if (v === "disponible") return 0;

  if (v.includes("medio dia") && v.includes("cumple")) {
    if (dow === 6) return 0;
    return 240;
  }

  if (looksLikeShift(mallaVal)) {
    const raw = (mallaVal || "").replace(/\s/g, "");
    if (raw === "8-14") return 240;
    if (dow === 6) return 240;
    return 540; // 9h jornada
  }

  if (dow === 6) return 240; // Sábado: 4h

  return 540; // Lun-Vie: 9h jornada
}

/** Horas ordinarias PAGADAS (descontando almuerzo) */
export function getOrdinaryMinutes(
  date: Date,
  mallaVal: string | null,
  holidaySet: Set<string>
): number {
  const dow = getDayOfWeekColombia(date);
  const dateKey = dateKeyColombia(date);
  const isFestivo = holidaySet.has(dateKey);

  if (dow === 0 || isFestivo) return 0;

  const v = normalizeName(mallaVal || "");

  if (
    v.includes("descanso") ||
    v.includes("vacacion") ||
    v.includes("dia de la familia") ||
    v.includes("semana santa") ||
    v.includes("keynote")
  ) return 0;

  if (v === "disponible") return 0;

  if (v.includes("medio dia") && v.includes("cumple")) {
    if (dow === 6) return 0;
    return 240;
  }

  if (looksLikeShift(mallaVal)) {
    const raw = (mallaVal || "").replace(/\s/g, "");
    if (raw === "8-14") return 240;
    if (dow === 6) return 240;
    return 480; // 8h pagadas
  }

  if (dow === 6) return 240; // Sábado: 4h

  return 480; // Lun-Vie: 8h pagadas (9h jornada - 1h almuerzo)
}

// ============ ALERTAS ============

export function checkMallaAlerts(
  turnoId: string,
  correo: string,
  nombre: string,
  fecha: Date,
  mallaVal: string | null,
  isFestivo: boolean,
  totalHoras: number
): AlertaBIA[] {
  const alerts: AlertaBIA[] = [];
  const fechaStr = dateKeyColombia(fecha);

  if (!mallaVal) {
    alerts.push({
      tipo: "SIN_MALLA",
      id: turnoId,
      correo,
      fecha: fechaStr,
      detalle: `${nombre} (${fechaStr}) — sin malla asignada para este día.`,
    });
    return alerts;
  }

  const v = normalizeName(mallaVal);

  if (v.includes("descanso")) {
    alerts.push({
      tipo: "TRABAJO_EN_DESCANSO",
      id: turnoId,
      correo,
      fecha: fechaStr,
      detalle: `${nombre} (${fechaStr}) — trabajó ${totalHoras.toFixed(2)}h en día marcado como DESCANSO.`,
      malla: mallaVal,
    });
  }

  if (v.includes("vacacion")) {
    alerts.push({
      tipo: "TRABAJO_EN_VACACIONES",
      id: turnoId,
      correo,
      fecha: fechaStr,
      detalle: `Trabajó ${totalHoras.toFixed(2)}h en día marcado como VACACIONES.`,
      malla: mallaVal,
    });
  }

  if (v.includes("dia de la familia")) {
    alerts.push({
      tipo: "TRABAJO_EN_DIA_FAMILIA",
      id: turnoId,
      correo,
      fecha: fechaStr,
      detalle: `Trabajó ${totalHoras.toFixed(2)}h en día marcado como DÍA DE LA FAMILIA.`,
      malla: mallaVal,
    });
  }

  if (v.includes("semana santa") || v.includes("keynote")) {
    alerts.push({
      tipo: "TRABAJO_EN_NOVEDAD",
      id: turnoId,
      correo,
      fecha: fechaStr,
      detalle: `Trabajó ${totalHoras.toFixed(2)}h en día marcado como ${mallaVal}.`,
      malla: mallaVal,
    });
  }

  if (v === "disponible" && !isFestivo) {
    alerts.push({
      tipo: "DISPONIBLE_EN_NO_FESTIVO",
      id: turnoId,
      correo,
      fecha: fechaStr,
      detalle: "Marcado como Disponible en día no festivo.",
      malla: mallaVal,
    });
  }

  if (totalHoras > 14) {
    alerts.push({
      tipo: "TURNO_MAYOR_14H",
      id: turnoId,
      correo,
      fecha: fechaStr,
      detalle: `Duración ${totalHoras.toFixed(2)}h — posible error.`,
    });
  }

  return alerts;
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
  esDomFestivo: boolean,
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
    const withinOrd = jornadaMin > 0 && m < jornadaMin;

    if (esDomFestivo) {
      if (applyDomRecargo) {
        if (isDiurna) recFestDiurno++;
        else recFestNocturno++;
      } else {
        if (isDiurna) heFestDiurna++;
        else heFestNocturna++;
      }
    } else {
      if (withinOrd) {
        if (isNocturna) recNocturno++;
      } else {
        if (isDiurna) heDiurna++;
        else heNocturna++;
      }
    }
  }

  return { heDiurna, heNocturna, heFestDiurna, heFestNocturna, recNocturno, recFestDiurno, recFestNocturno };
}

function minutosAHoras(min: number): number {
  return Math.round((min / 60) * 100) / 100;
}

function applyThreshold(val: number, threshold: number): number {
  return val >= threshold ? val : 0;
}

// ============ RESUMEN SEMANAL ============

export function calcularHorasOrdinariasEsperadas(diaSemana: number): number {
  if (diaSemana >= 1 && diaSemana <= 5) return 8; // 8h pagadas
  if (diaSemana === 6) return 4;
  return 0;
}

export function calcularHorasSemanales(turnosSemana: TurnoData[]): ResumenSemanal {
  let totalOrdinarias = 0;
  for (const turno of turnosSemana) {
    const dia = getDayOfWeekColombia(turno.fecha);
    if (dia >= 1 && dia <= 6) {
      const totalHoras = (turno.horaSalida.getTime() - turno.horaEntrada.getTime()) / (1000 * 60 * 60);
      const esperadas = calcularHorasOrdinariasEsperadas(dia);
      totalOrdinarias += Math.min(totalHoras, esperadas);
    }
  }
  return {
    horasOrdinariasSemana: Math.round(totalOrdinarias * 100) / 100,
    aplicaRegla44h: totalOrdinarias < 44,
  };
}

export function calcularHorasSemanalesConMalla(
  turnosSemana: TurnoData[],
  mallaGetter: (fecha: Date) => string | null,
  holidaySet: Set<string>
): ResumenSemanal {
  let totalOrdinariasMin = 0;
  for (const turno of turnosSemana) {
    const mallaVal = mallaGetter(turno.fecha);
    const ordMin = getOrdinaryMinutes(turno.fecha, mallaVal, holidaySet);
    totalOrdinariasMin += ordMin;
  }
  const horasOrdinariasSemana = Math.round((totalOrdinariasMin / 60) * 100) / 100;
  return {
    horasOrdinariasSemana,
    aplicaRegla44h: horasOrdinariasSemana < 44,
  };
}

// ============ CÁLCULO PRINCIPAL ============

export function calcularTurno(
  turno: TurnoData,
  resumenSemanal: ResumenSemanal,
  mallaVal?: string | null,
  holidaySet?: Set<string>
): ResultadoCalculo {
  const resultado: ResultadoCalculo = {
    horasOrdinarias: 0, heDiurna: 0, heNocturna: 0, heDominical: 0,
    heNoctDominical: 0, recNocturno: 0, recDominical: 0, recNoctDominical: 0,
  };

  const totalMin = Math.max(0, (turno.horaSalida.getTime() - turno.horaEntrada.getTime()) / 60000);
  const esDomFestivo = turno.esDomingo || turno.esFestivo;

  // Jornada vs Ordinarias pagadas
  let jornadaMin: number;
  let ordinariasPagadasMin: number;
  
  if (mallaVal !== undefined && holidaySet !== undefined) {
    jornadaMin = esDomFestivo ? 0 : getJornadaMinutes(turno.fecha, mallaVal, holidaySet);
    ordinariasPagadasMin = esDomFestivo ? 0 : getOrdinaryMinutes(turno.fecha, mallaVal, holidaySet);
  } else {
    const dow = getDayOfWeekColombia(turno.fecha);
    jornadaMin = esDomFestivo ? 0 : (dow === 6 ? 240 : 540);
    ordinariasPagadasMin = esDomFestivo ? 0 : (dow === 6 ? 240 : 480);
  }

  const applyDomRecargo = esDomFestivo && resumenSemanal.aplicaRegla44h;

  const r = calcMinutes(turno.horaEntrada, totalMin, jornadaMin, esDomFestivo, applyDomRecargo);

  // Reportar ordinarias PAGADAS
  resultado.horasOrdinarias = minutosAHoras(Math.min(ordinariasPagadasMin, totalMin));

  // HE con umbral 0.5h
  resultado.heDiurna = applyThreshold(minutosAHoras(r.heDiurna), UMBRAL_HE);
  resultado.heNocturna = applyThreshold(minutosAHoras(r.heNocturna), UMBRAL_HE);
  resultado.heDominical = applyThreshold(minutosAHoras(r.heFestDiurna), UMBRAL_HE);
  resultado.heNoctDominical = applyThreshold(minutosAHoras(r.heFestNocturna), UMBRAL_HE);

  // Recargos
  resultado.recNocturno = minutosAHoras(r.recNocturno);
  resultado.recDominical = minutosAHoras(r.recFestDiurno);
  resultado.recNoctDominical = minutosAHoras(r.recFestNocturno);

  return resultado;
}

// ============ UTILIDADES SEMANA ============

export function getInicioSemana(fecha: Date): Date {
  return startOfWeek(fecha, { weekStartsOn: 1 });
}

export function getFinSemana(fecha: Date): Date {
  return endOfWeek(fecha, { weekStartsOn: 1 });
}

export function getDiasSemana(fecha: Date): Date[] {
  return eachDayOfInterval({ start: getInicioSemana(fecha), end: getFinSemana(fecha) });
}