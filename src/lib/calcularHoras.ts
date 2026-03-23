/**
 * Motor de cálculo de horas alineado con AppScript.
 * Diurna 06:00-19:00 Colombia, nocturna resto.
 * Jornada Lun-Vie: 9h (8am-5pm), pero ordinarias PAGADAS: 8h (descontando almuerzo)
 * Jornada Sábado: 4h
 * Total semana: 8h × 5 + 4h = 44h
 */

const DIURNA_START = 6 * 60; // 06:00
const DIURNA_END = 19 * 60; // 19:00
const HE_THRESHOLD = 0.5; // mínimo 0.5h para contar HE (recargos sin umbral)

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

function getMinutesOfDayColombia(d: Date): number {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.getUTCHours() * 60 + colombia.getUTCMinutes();
}

function getDayOfWeekColombia(d: Date): number {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.getUTCDay();
}

function dateKeyColombia(d: Date): string {
  const colombia = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return colombia.toISOString().split("T")[0];
}

// ============ JORNADA vs ORDINARIAS PAGADAS ============

/** Jornada laboral = tiempo después del cual empiezan HE */
function getJornadaMinutes(dow: number, mallaVal: string | null | undefined): number {
  if (dow === 0) return 0; // Domingo
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
    return 240; // 4h
  }
  
  if (dow === 6) return 240; // Sábado: 4h
  
  return 540; // Lun-Vie: 9h jornada (8am-5pm)
}

/** Horas ordinarias PAGADAS (descontando almuerzo) */
export function getOrdinaryMinutes(dow: number, mallaVal: string | null | undefined): number {
  if (dow === 0) return 0; // Domingo
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
    return 240; // 4h
  }
  
  if (dow === 6) return 240; // Sábado: 4h
  
  return 480; // Lun-Vie: 8h pagadas (9h jornada - 1h almuerzo)
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
    /** Umbral HE en días hábiles: siempre jornada (540/240/etc.), nunca ordinarias pagadas */
    const withinOrd = jornadaMin > 0 && m < jornadaMin;

    if (esDomFestivo) {
      // Domingo o festivo: no hay “jornada” ordinaria; todo va a recargo o HE según regla 44h
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

  // Mínimo 0.5h para contar HE
  const totalHEMin = heDiurna + heNocturna + heFestDiurna + heFestNocturna;
  if (totalHEMin < HE_THRESHOLD * 60) {
    heDiurna = 0;
    heNocturna = 0;
    heFestDiurna = 0;
    heFestNocturna = 0;
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

  // fecha ya es la fecha Colombia almacenada como midnight UTC
  // NO aplicar offset de timezone, solo leer directamente
  const dow = fechaTurno.getUTCDay();
  const fechaKey = fechaTurno.toISOString().split("T")[0];
  const esFestivo = holidaySet.has(fechaKey);
  const esDomingo = dow === 0;
  const esDomFestivo = esDomingo || esFestivo;
  
  const mallaVal = mallaDia?.valor ?? null;
  
  // JORNADA = tiempo después del cual empiezan HE (9h Lun-Vie)
  // ORDINARIAS PAGADAS = lo que se reporta (8h Lun-Vie)
  let jornadaMin: number;
  let ordinariasPagadasMin: number;
  
  if (esDomFestivo) {
    jornadaMin = 0;
    ordinariasPagadasMin = 0;
  } else {
    jornadaMin = getJornadaMinutes(dow, mallaVal);
    ordinariasPagadasMin = getOrdinaryMinutes(dow, mallaVal);
  }

  // Regla 44h
  const applyDomRecargo = esDomFestivo && weeklyOrdHours < 44;

  // Calcular HE usando JORNADA (no ordinarias pagadas)
  const r = calcMinutes(entrada, totalMin, jornadaMin, esDomFestivo, applyDomRecargo);

  // Reportar ordinarias PAGADAS (8h, no 9h)
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