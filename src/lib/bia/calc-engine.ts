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

const JORNADA_DIURNA_INICIO = 6;
const JORNADA_DIURNA_FIN = 19;
const ORDINARIO_LV = 9;
const ORDINARIO_SAB = 4;
const UMBRAL_HE = 0.5;

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

export function calcularTurno(turno: TurnoData, resumenSemanal: ResumenSemanal): ResultadoCalculo {
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

  const horasEsperadas = calcularHorasOrdinariasEsperadas(diaSemana);
  resultado.horasOrdinarias = Math.min(totalHoras, horasEsperadas);

  const excedente = totalHoras - horasEsperadas;
  if (excedente > 0 && excedente >= UMBRAL_HE) {
    const excedenteDiurnoMin = Math.max(0, minutosDiurnos - horasEsperadas * 60);
    const heDiurnaCalc = minutosAHoras(excedenteDiurnoMin);
    resultado.heDiurna = heDiurnaCalc >= UMBRAL_HE ? heDiurnaCalc : 0;
    resultado.heNocturna = horasNocturnas >= UMBRAL_HE ? horasNocturnas : 0;
  }

  if (horasNocturnas > 0 && diaSemana >= 1 && diaSemana <= 6) {
    const nocturnoOrdinario = Math.min(horasNocturnas, horasEsperadas - horasDiurnas);
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
