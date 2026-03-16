import { startOfWeek, endOfWeek, eachDayOfInterval, getDay, differenceInMinutes, setHours, setMinutes, max as dateMax, min as dateMin } from "date-fns";

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

const JORNADA_DIURNA_INICIO = 6;
const JORNADA_DIURNA_FIN = 19;
const ORDINARIO_LV = 9;
const ORDINARIO_SAB = 4;
const UMBRAL_HE = 0.5;

const ORDINARIO_LV_MIN = 540;
const ORDINARIO_SAB_MIN = 240;

export function normalizeName(val: string): string {
  return (val || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\u0300/g, "")
    .trim();
}

export function looksLikeShift(val: string | null): boolean {
  if (!val) return false;
  const raw = val.replace(/\s/g, "");
  return /^\d+-\d+$/.test(raw);
}

export function getOrdinaryMinutes(
  date: Date,
  mallaVal: string | null,
  holidaySet: Set<string>
): number {
  const dow = date.getUTCDay();
  const dateKey = date.toISOString().split("T")[0];
  const isFestivo = holidaySet.has(dateKey);

  if (dow === 0) return 0;

  const v = normalizeName(mallaVal || "");

  if (
    v.includes("descanso") ||
    v.includes("vacacion") ||
    v.includes("dia de la familia") ||
    v.includes("semana santa") ||
    v.includes("keynote")
  )
    return 0;

  if (v === "disponible") return 0;

  if (v.includes("medio dia") && v.includes("cumple")) {
    if (dow === 6) return 0;
    return 240;
  }

  if (looksLikeShift(mallaVal)) {
    const raw = (mallaVal || "").replace(/\s/g, "");
    if (raw === "8-14") return 240;
    if (dow === 6) return ORDINARIO_SAB_MIN;
    return ORDINARIO_LV_MIN;
  }

  if (dow === 6) return ORDINARIO_SAB_MIN;
  return ORDINARIO_LV_MIN;
}

export function checkMallaAlerts(
  turnoId: string,
  correo: string,
  fecha: Date,
  mallaVal: string | null,
  isFestivo: boolean,
  totalHoras: number
): AlertaBIA[] {
  const alerts: AlertaBIA[] = [];
  const fechaStr = fecha.toISOString().split("T")[0];

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
      detalle: `Trabajó ${totalHoras}h en día marcado como DESCANSO. Todas las horas son HE.`,
      malla: mallaVal,
    });
  }

  if (v.includes("vacacion")) {
    alerts.push({
      tipo: "TRABAJO_EN_VACACIONES",
      id: turnoId,
      correo,
      fecha: fechaStr,
      detalle: `Trabajó ${totalHoras}h en día marcado como VACACIONES.`,
      malla: mallaVal,
    });
  }

  if (v.includes("dia de la familia")) {
    alerts.push({
      tipo: "TRABAJO_EN_DIA_FAMILIA",
      id: turnoId,
      correo,
      fecha: fechaStr,
      detalle: `Trabajó ${totalHoras}h en día marcado como DÍA DE LA FAMILIA.`,
      malla: mallaVal,
    });
  }

  if (v.includes("semana santa") || v.includes("keynote")) {
    alerts.push({
      tipo: "TRABAJO_EN_NOVEDAD",
      id: turnoId,
      correo,
      fecha: fechaStr,
      detalle: `Trabajó ${totalHoras}h en día marcado como ${mallaVal}.`,
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
      detalle: `Duración ${totalHoras}h — posible error.`,
    });
  }

  return alerts;
}

function minutosAHoras(minutos: number): number {
  return Math.round((minutos / 60) * 100) / 100;
}

function calcularMinutosDiurnos(entrada: Date, salida: Date): number {
  const fechaBase = new Date(entrada);
  const inicioDiurna = setMinutes(setHours(new Date(fechaBase), JORNADA_DIURNA_INICIO), 0);
  const finDiurna = setMinutes(setHours(new Date(fechaBase), JORNADA_DIURNA_FIN), 0);
  const start = dateMax([entrada, inicioDiurna]);
  const end = dateMin([salida, finDiurna]);
  if (start >= end) return 0;
  return differenceInMinutes(end, start);
}

function calcularMinutosNocturnos(entrada: Date, salida: Date): number {
  const totalMinutos = differenceInMinutes(salida, entrada);
  const minutosDiurnos = calcularMinutosDiurnos(entrada, salida);
  return Math.max(0, totalMinutos - minutosDiurnos);
}

export function calcularHorasOrdinariasEsperadas(diaSemana: number): number {
  if (diaSemana >= 1 && diaSemana <= 5) return ORDINARIO_LV;
  if (diaSemana === 6) return ORDINARIO_SAB;
  return 0;
}

export function calcularHorasSemanales(turnosSemana: TurnoData[]): ResumenSemanal {
  let totalOrdinarias = 0;
  for (const turno of turnosSemana) {
    const dia = getDay(turno.fecha);
    if (dia >= 1 && dia <= 6) {
      const totalHoras = differenceInMinutes(turno.horaSalida, turno.horaEntrada) / 60;
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

  const totalMinutos = differenceInMinutes(turno.horaSalida, turno.horaEntrada);
  const totalHoras = minutosAHoras(totalMinutos);
  const minutosDiurnos = calcularMinutosDiurnos(turno.horaEntrada, turno.horaSalida);
  const minutosNocturnos = calcularMinutosNocturnos(turno.horaEntrada, turno.horaSalida);
  const horasDiurnas = minutosAHoras(minutosDiurnos);
  const horasNocturnas = minutosAHoras(minutosNocturnos);
  const diaSemana = getDay(turno.fecha);
  const esDomFestivo = turno.esDomingo || turno.esFestivo;

  if (esDomFestivo) {
    if (resumenSemanal.aplicaRegla44h) {
      resultado.recDominical = horasDiurnas;
      resultado.recNoctDominical = horasNocturnas;
    } else {
      resultado.heDominical = horasDiurnas >= UMBRAL_HE ? horasDiurnas : 0;
      resultado.heNoctDominical = horasNocturnas >= UMBRAL_HE ? horasNocturnas : 0;
    }
    return resultado;
  }

  let horasEsperadas: number;
  if (mallaVal !== undefined && holidaySet !== undefined) {
    const ordMin = getOrdinaryMinutes(turno.fecha, mallaVal, holidaySet);
    horasEsperadas = ordMin / 60;
  } else {
    horasEsperadas = calcularHorasOrdinariasEsperadas(diaSemana);
  }
  resultado.horasOrdinarias = Math.min(totalHoras, horasEsperadas);

  const excedente = totalHoras - horasEsperadas;
  if (excedente > 0 && excedente >= UMBRAL_HE) {
    const excedenteDiurnoMin = Math.max(0, minutosDiurnos - horasEsperadas * 60);
    const heDiurnaCalc = minutosAHoras(excedenteDiurnoMin);
    resultado.heDiurna = heDiurnaCalc >= UMBRAL_HE ? heDiurnaCalc : 0;
    resultado.heNocturna = horasNocturnas >= UMBRAL_HE ? horasNocturnas : 0;
  }

  if (horasNocturnas > 0 && diaSemana >= 1 && diaSemana <= 6) {
    const nocturnoOrdinario = Math.min(horasNocturnas, Math.max(0, horasEsperadas - horasDiurnas));
    if (nocturnoOrdinario > 0) resultado.recNocturno = nocturnoOrdinario;
  }

  return resultado;
}

export function getInicioSemana(fecha: Date): Date {
  return startOfWeek(fecha, { weekStartsOn: 1 });
}

export function getFinSemana(fecha: Date): Date {
  return endOfWeek(fecha, { weekStartsOn: 1 });
}

export function getDiasSemana(fecha: Date): Date[] {
  return eachDayOfInterval({ start: getInicioSemana(fecha), end: getFinSemana(fecha) });
}
