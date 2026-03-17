/**
 * Cálculo de horas enlazado con la malla de turnos.
 * Reglas Código Sustantivo del Trabajo Colombia: jornada 44h/semana, ordinaria diurna 06:00-21:00, nocturna 21:00-06:00.
 */

export interface Turno {
  horaEntrada: Date;
  horaSalida: Date;
}

export interface MallaDia {
  tipo: string;
  horaInicio?: string | null;
  horaFin?: string | null;
}

function parseTime(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

export function calcularMinutosEntre(horaInicio: string, horaFin: string): number {
  let start = parseTime(horaInicio);
  let end = parseTime(horaFin);
  if (end <= start) end += 24 * 60;
  return end - start;
}

function getMinutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Separa minutos extra en diurnas (06:00-21:00) y nocturnas (21:00-06:00) según la hora de salida. */
function separarDiurnasNocturnas(
  salida: Date,
  minutosExtra: number
): { diurnas: number; nocturnas: number } {
  if (minutosExtra <= 0) return { diurnas: 0, nocturnas: 0 };
  const minSalida = getMinutesOfDay(salida);
  const inicioNocturno = 21 * 60;
  const finNocturno = 6 * 60;
  let diurnas = 0;
  let nocturnas = 0;
  let restantes = minutosExtra;
  let cursor = minSalida;
  while (restantes > 0) {
    const esNocturno = cursor >= inicioNocturno || cursor < finNocturno;
    const hastaFrontera = esNocturno
      ? cursor < finNocturno
        ? finNocturno - cursor
        : 24 * 60 - cursor + finNocturno
      : inicioNocturno - cursor;
    const usar = Math.min(restantes, hastaFrontera);
    if (esNocturno) nocturnas += usar;
    else diurnas += usar;
    restantes -= usar;
    cursor = (cursor + usar) % (24 * 60);
  }
  return { diurnas, nocturnas };
}

/** Recargo nocturno dentro de las horas ordinarias (35%). */
function calcularRecargoNocturnoEnOrdinarias(entrada: Date, minutosOrdinarios: number): number {
  if (minutosOrdinarios <= 0) return 0;
  const minEntrada = getMinutesOfDay(entrada);
  const inicioNocturno = 21 * 60;
  const finNocturno = 6 * 60;
  let nocturnos = 0;
  let restantes = minutosOrdinarios;
  let cursor = minEntrada;
  while (restantes > 0) {
    const esNocturno = cursor >= inicioNocturno || cursor < finNocturno;
    const hastaFrontera = esNocturno
      ? cursor < finNocturno
        ? finNocturno - cursor
        : 24 * 60 - cursor + finNocturno
      : inicioNocturno - cursor;
    const usar = Math.min(restantes, hastaFrontera);
    if (esNocturno) nocturnos += usar;
    restantes -= usar;
    cursor = (cursor + usar) % (24 * 60);
  }
  return nocturnos;
}

export interface ResultadoCalcularHoras {
  horasOrdinarias: number;
  horasExtraDiurna: number;
  horasExtraNocturna: number;
  horasRecargoNocturno: number;
  horasRecargoDominical: number;
  horasRecargoFestivoNocturno: number;
}

export function calcularHorasTurno(turno: Turno, mallaDia: MallaDia | null): ResultadoCalcularHoras {
  const entrada = new Date(turno.horaEntrada);
  const salida = new Date(turno.horaSalida);
  const minutosTrabajados = (salida.getTime() - entrada.getTime()) / 60000;
  const diaSemana = entrada.getDay();
  const esFestivo = mallaDia?.tipo === "FESTIVO";
  const esDescanso = mallaDia?.tipo === "DESCANSO";
  const esDominical = diaSemana === 0;
  const esFinDeSemanaNoLaboral = esDominical || esFestivo || esDescanso;

  const minutosEsperados =
    mallaDia?.horaInicio && mallaDia?.horaFin
      ? calcularMinutosEntre(mallaDia.horaInicio, mallaDia.horaFin)
      : diaSemana === 6
        ? 240
        : diaSemana === 0
          ? 0
          : 480;

  let minutosOrdinarios = 0;
  let minutosExtraDiurno = 0;
  let minutosExtraNocturno = 0;
  let minutosRecargoNocturno = 0;
  let minutosRecargoDominical = 0;
  let minutosRecargoFestivoNocturno = 0;

  if (esFinDeSemanaNoLaboral) {
    minutosRecargoDominical = minutosTrabajados;
    if (esFestivo || esDominical) {
      const { diurnas, nocturnas } = separarDiurnasNocturnas(salida, minutosTrabajados);
      minutosRecargoDominical = diurnas;
      minutosRecargoFestivoNocturno = nocturnas;
    }
  } else {
    minutosOrdinarios = Math.min(minutosTrabajados, minutosEsperados);
    const minutosExtra = Math.max(0, minutosTrabajados - minutosEsperados);
    const { diurnas, nocturnas } = separarDiurnasNocturnas(salida, minutosExtra);
    minutosExtraDiurno = diurnas;
    minutosExtraNocturno = nocturnas;
    minutosRecargoNocturno = calcularRecargoNocturnoEnOrdinarias(entrada, minutosOrdinarios);
  }

  return {
    horasOrdinarias: Math.max(0, minutosOrdinarios / 60),
    horasExtraDiurna: minutosExtraDiurno / 60,
    horasExtraNocturna: minutosExtraNocturno / 60,
    horasRecargoNocturno: minutosRecargoNocturno / 60,
    horasRecargoDominical: minutosRecargoDominical / 60,
    horasRecargoFestivoNocturno: minutosRecargoFestivoNocturno / 60,
  };
}

/** Mapea resultado de calcularHorasTurno a campos del modelo Turno (Prisma). */
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
    horasOrdinarias: Math.round(r.horasOrdinarias * 100) / 100,
    heDiurna: Math.round(r.horasExtraDiurna * 100) / 100,
    heNocturna: Math.round(r.horasExtraNocturna * 100) / 100,
    heDominical: 0,
    heNoctDominical: 0,
    recNocturno: Math.round(r.horasRecargoNocturno * 100) / 100,
    recDominical: Math.round(r.horasRecargoDominical * 100) / 100,
    recNoctDominical: Math.round(r.horasRecargoFestivoNocturno * 100) / 100,
  };
}
