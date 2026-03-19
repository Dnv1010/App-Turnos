/**
 * Motor de cálculo BIA - Alineado con AppScript
 * Diurna 06:00-19:00 Colombia, nocturna resto
 * Regla 44h semanales para recargo vs HE dom/festivo
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

const DIURNA_START = 6 * 60;  // 06:00 = 360 minutos
const DIURNA_END = 19 * 60;   // 19:00 = 1140 minutos
const ORDINARIO_LV_MIN = 540; // 9 horas
const ORDINARIO_SAB_MIN = 240; // 4 horas
const UMBRAL_HE = 0.5;

// ============ FUNCIONES DE TIMEZONE COLOMBIA ============

/** Convierte Date a minutos del día en Colombia (UTC-5) */
function getMinutesOfDayColombia(d: Date): number {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.getUTCHours() * 60 + colombia.getUTCMinutes();
}

/** Día de la semana en Colombia (0=Dom, 1=Lun, ..., 6=Sáb) */
function getDayOfWeekColombia(d: Date): number {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.getUTCDay();
}

/** Convierte Date a YYYY-MM-DD en Colombia */
export function dateKeyColombia(d: Date): string {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.toISOString().split("T")[0];
}

// ============ FUNCIONES DE NORMALIZACIÓN ============

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

// ============ HORAS ORDINARIAS SEGÚN MALLA ============

export function getOrdinaryMinutes(
  date: Date,
  mallaVal: string | null,
  holidaySet: Set<string>
): number {
  const dow = getDayOfWeekColombia(date);
  const dateKey = dateKeyColombia(date);
  const isFestivo = holidaySet.has(dateKey);

  // Domingo nunca tiene ordinario
  if (dow === 0) return 0;
  
  // Festivo tampoco
  if (isFestivo) return 0;

  const v = normalizeName(mallaVal || "");

  // Bloqueos: no deberían trabajar => ordinario 0
  if (
    v.includes("descanso") ||
    v.includes("vacacion") ||
    v.includes("dia de la familia") ||
    v.includes("semana santa") ||
    v.includes("keynote")
  ) return 0;

  // Disponible: solo aplica domingos/festivos, no suma ordinario
  if (v === "disponible") return 0;

  // Medio día cumpleaños
  if (v.includes("medio dia") && v.includes("cumple")) {
    if (dow === 6) return 0;
    return 240; // 4h
  }

  // Turnos explícitos
  if (looksLikeShift(mallaVal)) {
    const raw = (mallaVal || "").replace(/\s/g, "");
    if (raw === "8-14") return 240;
    if (dow === 6) return ORDINARIO_SAB_MIN;
    return ORDINARIO_LV_MIN;
  }

  // Sábado normal
  if (dow === 6) return ORDINARIO_SAB_MIN;

  // Lun-Vie normal: 9h (incluye almuerzo)
  return ORDINARIO_LV_MIN;
}

// ============ ALERTAS DE MALLA ============

export function checkMallaAlerts(
  turnoId: string,
  correo: string,
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
      detalle: "Técnico sin malla asignada para este día. Se usó jornada ordinaria por defecto.",
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
      detalle: `Trabajó ${totalHoras.toFixed(2)}h en día marcado como DESCANSO. Todas las horas son HE.`,
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
      detalle: "Marcado como Disponible en día no festivo. Verificar malla.",
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

// ============ CÁLCULO MINUTO A MINUTO (IGUAL QUE APPSCRIPT) ============

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
      // Dentro de horas ordinarias
      if (isNocturna && !isFestivo) recNocturno++;
      if (applyDomRecargo) {
        if (isDiurna) recFestDiurno++;
        else recFestNocturno++;
      }
    } else {
      // Fuera de horas ordinarias = HE
      if (isFestivo) {
        if (isDiurna) heFestDiurna++;
        else heFestNocturna++;
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
  if (diaSemana >= 1 && diaSemana <= 5) return 9;
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

// ============ CÁLCULO PRINCIPAL DE TURNO ============

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
  const totalHoras = minutosAHoras(totalMin);
  const dow = getDayOfWeekColombia(turno.fecha);
  const esDomFestivo = turno.esDomingo || turno.esFestivo;

  // Obtener horas ordinarias del día según malla
  let ordMin: number;
  if (mallaVal !== undefined && holidaySet !== undefined) {
    ordMin = getOrdinaryMinutes(turno.fecha, mallaVal, holidaySet);
  } else {
    ordMin = calcularHorasOrdinariasEsperadas(dow) * 60;
  }

  // Regla 44h: si no ha completado 44h ordinarias en la semana, domingo/festivo es recargo
  const applyDomRecargo = esDomFestivo && resumenSemanal.aplicaRegla44h;

  // Calcular minuto a minuto
  const r = calcMinutes(turno.horaEntrada, totalMin, ordMin, esDomFestivo, applyDomRecargo);

  // Horas ordinarias
  resultado.horasOrdinarias = minutosAHoras(Math.min(ordMin, totalMin));

  // HE con umbral 0.5h
  resultado.heDiurna = applyThreshold(minutosAHoras(r.heDiurna), UMBRAL_HE);
  resultado.heNocturna = applyThreshold(minutosAHoras(r.heNocturna), UMBRAL_HE);
  resultado.heDominical = applyThreshold(minutosAHoras(r.heFestDiurna), UMBRAL_HE);
  resultado.heNoctDominical = applyThreshold(minutosAHoras(r.heFestNocturna), UMBRAL_HE);

  // Recargos (sin umbral)
  resultado.recNocturno = minutosAHoras(r.recNocturno);
  resultado.recDominical = minutosAHoras(r.recFestDiurno);
  resultado.recNoctDominical = minutosAHoras(r.recFestNocturno);

  return resultado;
}

// ============ UTILIDADES DE SEMANA ============

export function getInicioSemana(fecha: Date): Date {
  return startOfWeek(fecha, { weekStartsOn: 1 });
}

export function getFinSemana(fecha: Date): Date {
  return endOfWeek(fecha, { weekStartsOn: 1 });
}

export function getDiasSemana(fecha: Date): Date[] {
  return eachDayOfInterval({ start: getInicioSemana(fecha), end: getFinSemana(fecha) });
}