import { PrismaClient, type TipoDia } from "@prisma/client";
import { google } from "googleapis";
import * as dotenv from "dotenv";
import {
  calcularHorasTurno,
  resultadoToTurnoData,
  getDayOfWeekColombia,
  dateKeyColombia,
} from "../src/lib/calcularHoras";
import { sumWeeklyOrdHoursMonSat } from "../src/lib/weeklyOrdHours";
import { getInicioSemana, getFinSemana } from "../src/lib/bia/calc-engine";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });


const prisma = new PrismaClient();
const SHEET_ID = process.env.GOOGLE_SHEETS_ID;

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function normalizarFecha(fecha: string | undefined | null): string | null {
  if (!fecha) return null;
  let s = String(fecha).trim();
  if (s.includes("/")) {
    const p = s.split("/");
    const d = p[0].padStart(2, "0");
    const m = p[1].padStart(2, "0");
    const y = p[2];
    return `${y}-${m}-${d}`;
  }
  return s;
}

function parsearHora(valor: string): string | null {
  if (!valor || valor.trim() === "") return null;

  // Formato español AM/PM: "06:54 a. m." o "04:16 p. m."
  const amPmMatch = valor.trim().match(/^(\d{1,2}):(\d{2})\s*(a\.?\s*m\.|p\.?\s*m\.)$/i);
  if (amPmMatch) {
    let h = parseInt(amPmMatch[1], 10);
    const m = parseInt(amPmMatch[2], 10);
    const isPm = amPmMatch[3].replace(/\s/g, "").toLowerCase().startsWith("p");
    if (isPm && h !== 12) h += 12;
    if (!isPm && h === 12) h = 0;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:00`;
  }

  // Fracción decimal de Google Sheets (ej: 0.333 = 08:00)
  const num = parseFloat(valor);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMin = Math.round(num * 24 * 60);
    const h = Math.floor(totalMin / 60).toString().padStart(2, "0");
    const m = (totalMin % 60).toString().padStart(2, "0");
    return `${h}:${m}:00`;
  }

  // Formato HH:MM o HH:MM:SS
  const partes = valor.trim().split(":");
  partes[0] = partes[0].padStart(2, "0");
  if (partes.length === 2) partes.push("00");
  return partes.join(":");
}

async function leerHoja(nombre: string): Promise<Record<string, string>[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${nombre}!A1:Z10000`,
    });
    const rows = res.data.values ?? [];
    if (rows.length < 2) return [];
    const headers = rows[0] as string[];
    return rows.slice(1).map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h.trim()] = (row[i] ?? "").toString().trim();
      });
      return obj;
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unable to parse range") || msg.includes("INVALID_ARGUMENT")) {
      console.log(`   ⏭ Hoja "${nombre}" no existe, se omite.`);
      return [];
    }
    throw e;
  }
}

function parsearCoordenada(valor: string): [number, number] | null {
  if (!valor || valor.trim() === "") return null;
  const p = valor.split(",").map((v) => parseFloat(v.trim()));
  return p.length === 2 && !isNaN(p[0]) && !isNaN(p[1]) ? [p[0], p[1]] : null;
}

/** Claves de festivo: ISO del d?a guardado + dateKeyColombia, para alinear con el motor y la malla. */
function agregarClavesFestivo(fechaFestivo: Date, destino: Set<string>) {
  destino.add(fechaFestivo.toISOString().split("T")[0]);
  destino.add(dateKeyColombia(fechaFestivo));
}

type MallaRow = {
  tipo?: string | null;
  valor: string;
  horaInicio?: string | null;
  horaFin?: string | null;
};

function mallaDiaParaTurno(
  row: MallaRow | null,
  esFestivo: boolean,
  fechaDate: Date
) {
  const dowColombia = getDayOfWeekColombia(fechaDate);
  return row
    ? {
        tipo: esFestivo ? "FESTIVO" : (row.tipo ?? "TRABAJO"),
        valor: row.valor ?? null,
        horaInicio: row.horaInicio,
        horaFin: row.horaFin,
      }
    : esFestivo
      ? { tipo: "FESTIVO" as const, valor: null, horaInicio: null, horaFin: null }
      : dowColombia === 0
        ? { tipo: "DESCANSO" as const, valor: null, horaInicio: null, horaFin: null }
        : {
            tipo: "TRABAJO" as const,
            valor: "Trabajo",
            horaInicio: "08:00",
            horaFin: dowColombia === 6 ? "12:00" : "17:00",
          };
}

async function importarMalla() {
  console.log("\n???? Leyendo Importacion_Malla...");
  const filas = await leerHoja("Importacion_Malla");
  console.log(`   ${filas.length} filas encontradas`);
  let ok = 0,
    skip = 0,
    err = 0;

  const tipoMap: Record<string, TipoDia> = {
    TRABAJO: "TRABAJO",
    DESCANSO: "DESCANSO",
    DISPONIBLE: "DISPONIBLE",
    DIA_FAMILIA: "DIA_FAMILIA",
    INCAPACITADO: "INCAPACITADO",
    VACACIONES: "VACACIONES",
    MEDIO_CUMPLE: "MEDIO_CUMPLE",
  };

  for (const f of filas) {
    const cedula = f["Cedula"] || f["C?dula"] || "";
    const fechaRaw = f["Fecha"] || "";
    const valor = f["Valor"] || "";
    const tipo = (f["Tipo"] || "TRABAJO").toUpperCase();
    const horaInicio = f["HoraInicio"] || null;
    const horaFin = f["HoraFin"] || null;

    if (!cedula || !fechaRaw) {
      skip++;
      continue;
    }

    try {
      const fechaNorm = normalizarFecha(fechaRaw);
      if (!fechaNorm) {
        skip++;
        continue;
      }
      const user = await prisma.user.findUnique({ where: { cedula } });
      if (!user) {
        console.warn(`   ????  C?dula no encontrada: ${cedula}`);
        skip++;
        continue;
      }
      const fechaDate = new Date(`${fechaNorm}T00:00:00.000Z`);
      const tipoPrisma: TipoDia = tipoMap[tipo] ?? "TRABAJO";
      await prisma.mallaTurno.upsert({
        where: { userId_fecha: { userId: user.id, fecha: fechaDate } },
        create: {
          userId: user.id,
          fecha: fechaDate,
          valor: valor || tipoPrisma,
          tipo: tipoPrisma,
          horaInicio: horaInicio || null,
          horaFin: horaFin || null,
        },
        update: {
          valor: valor || tipoPrisma,
          tipo: tipoPrisma,
          horaInicio: horaInicio || null,
          horaFin: horaFin || null,
        },
      });
      ok++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`   ?? ${cedula} ${fechaRaw}:`, msg);
      err++;
    }
  }
  console.log(`   Malla: ${ok} ok, ${skip} saltados, ${err} errores`);
}

async function importarTurnos() {
  console.log("\n📋 Leyendo Importacion_Turnos...");
  const filas = await leerHoja("Importacion_Turnos");
  console.log(`   ${filas.length} filas encontradas`);

  type Cand = {
    cedula: string;
    fechaNorm: string;
    fechaDate: Date;
    horaEntrada: Date;
    horaSalida: Date;
    ubicE: string;
    ubicS: string;
  };

  const cedulas = new Set<string>();
  const candidatos: Cand[] = [];

  for (let rowIdx = 0; rowIdx < filas.length; rowIdx++) {
    const f = filas[rowIdx];
    const cedula = f["Cedula"] || f["C?dula"] || "";
    const fechaRaw = f["Fecha"] || "";
    const entradaStr = f["HoraEntrada"] || "";
    const salidaStr = f["HoraSalida"] || "";
    if (!cedula || !fechaRaw || !entradaStr || !salidaStr) {
      if (!cedula) console.warn(`   ⚠️  Fila ${rowIdx + 2}: cédula vacía (fecha="${fechaRaw}")`);
      else if (!fechaRaw) console.warn(`   ⚠️  Fila ${rowIdx + 2}: fecha vacía (cédula="${cedula}")`);
      else console.warn(`   ⚠️  Fila ${rowIdx + 2}: sin horario — ${cedula} ${fechaRaw} (entrada="${entradaStr}" salida="${salidaStr}")`);
      continue;
    }

    const fechaNorm = normalizarFecha(fechaRaw);
    if (!fechaNorm) continue;

    const phE = parsearHora(entradaStr);
    const phS = parsearHora(salidaStr);
    if (!phE || !phS) continue;

    let horaEntrada = new Date(`${fechaNorm}T${phE}-05:00`);
    let horaSalida = new Date(`${fechaNorm}T${phS}-05:00`);
    if (isNaN(horaEntrada.getTime()) || isNaN(horaSalida.getTime())) continue;

    if (horaSalida.getTime() <= horaEntrada.getTime()) {
      horaSalida = new Date(horaSalida.getTime() + 24 * 60 * 60 * 1000);
    }

    const fechaDate = new Date(`${fechaNorm}T00:00:00.000Z`);
    cedulas.add(cedula);
    candidatos.push({
      cedula,
      fechaNorm,
      fechaDate,
      horaEntrada,
      horaSalida,
      ubicE: f["UbicacionEntrada"] || "",
      ubicS: f["UbicacionSalida"] || "",
    });
  }

  const users = await prisma.user.findMany({
    where: { cedula: { in: Array.from(cedulas) } },
    select: { id: true, cedula: true, nombre: true },
  });
  const userByCedula = new Map(users.map((u) => [u.cedula, u]));

  const resolved = candidatos
    .map((c) => {
      const user = userByCedula.get(c.cedula);
      if (!user) return null;
      return { ...c, user };
    })
    .filter((x): x is Cand & { user: { id: string; cedula: string; nombre: string } } => x !== null)
    .sort((a, b) => {
      if (a.user.id !== b.user.id) return a.user.id.localeCompare(b.user.id);
      return a.fechaNorm.localeCompare(b.fechaNorm);
    });

  if (resolved.length === 0) {
    console.log("   Sin filas v?lidas para importar.");
    return;
  }

  const minF = resolved.reduce((m, r) => (r.fechaDate < m ? r.fechaDate : m), resolved[0].fechaDate);
  const maxF = resolved.reduce((m, r) => (r.fechaDate > m ? r.fechaDate : m), resolved[0].fechaDate);
  const inicioGlob = getInicioSemana(minF);
  const finGlob = getFinSemana(maxF);

  const festivosRows = await prisma.festivo.findMany({
    where: { fecha: { gte: inicioGlob, lte: finGlob } },
  });
  const holidaySet = new Set<string>();
  for (const fv of festivosRows) agregarClavesFestivo(fv.fecha, holidaySet);

  const userIds = Array.from(new Set(resolved.map((r) => r.user.id)));
  const mallaRows = await prisma.mallaTurno.findMany({
    where: {
      userId: { in: userIds },
      fecha: { gte: minF, lte: maxF },
    },
  });
  const mallaKey = (uid: string, ymd: string) => `${uid}|${ymd}`;
  const mallaMap = new Map<string, MallaRow>();
  for (const m of mallaRows) {
    const ymd = m.fecha.toISOString().split("T")[0];
    mallaMap.set(mallaKey(m.userId, ymd), {
      tipo: m.tipo,
      valor: m.valor,
      horaInicio: m.horaInicio,
      horaFin: m.horaFin,
    });
  }

  /** Acumulado Lun???S?b de la importaci?n actual (misma semana BIA que getInicioSemana). */
  const batchOrdByWeek = new Map<string, { fecha: Date; horasOrdinarias: number }[]>();

  let ok = 0,
    skip = 0,
    err = 0;

  for (const row of resolved) {
    const { user, fechaDate, fechaNorm, horaEntrada, horaSalida, ubicE, ubicS } = row;

    try {
      const existe = await prisma.turno.findFirst({
        where: { userId: user.id, fecha: fechaDate },
      });
      if (existe) {
        console.log(`   ? Ya existe: ${user.nombre} ${fechaNorm}`);
        skip++;
        continue;
      }

      const inicioSemana = getInicioSemana(fechaDate);
      const finSemana = getFinSemana(fechaDate);
      const weekKey = `${user.id}|${inicioSemana.toISOString()}`;

      const dbSemana = await prisma.turno.findMany({
        where: {
          userId: user.id,
          fecha: { gte: inicioSemana, lte: finSemana },
          horaSalida: { not: null },
        },
        select: { fecha: true, horasOrdinarias: true },
      });

      const batchSlice = batchOrdByWeek.get(weekKey) ?? [];
      const combined = [
        ...dbSemana.map((t) => ({ fecha: t.fecha, horasOrdinarias: t.horasOrdinarias ?? 0 })),
        ...batchSlice,
      ];
      const weeklyOrdHours = sumWeeklyOrdHoursMonSat(combined);

      const rowMalla = mallaMap.get(mallaKey(user.id, fechaNorm)) ?? null;
      const esFestivo =
        holidaySet.has(dateKeyColombia(fechaDate)) ||
        holidaySet.has(fechaDate.toISOString().split("T")[0]);
      const mallaDia = mallaDiaParaTurno(rowMalla, esFestivo, fechaDate);

      const resultado = calcularHorasTurno(
        { horaEntrada, horaSalida, fecha: fechaDate },
        mallaDia,
        holidaySet,
        weeklyOrdHours
      );
      const horasData = resultadoToTurnoData(resultado);

      const coordE = parsearCoordenada(ubicE);
      const coordS = parsearCoordenada(ubicS);

      await prisma.turno.create({
        data: {
          userId: user.id,
          fecha: fechaDate,
          horaEntrada,
          horaSalida,
          latEntrada: coordE ? coordE[0] : null,
          lngEntrada: coordE ? coordE[1] : null,
          latSalida: coordS ? coordS[0] : null,
          lngSalida: coordS ? coordS[1] : null,
          ...horasData,
        },
      });

      if (getDayOfWeekColombia(fechaDate) !== 0) {
        const next = [...batchSlice, { fecha: fechaDate, horasOrdinarias: horasData.horasOrdinarias }];
        batchOrdByWeek.set(weekKey, next);
      }

      console.log(`   ??? ${user.nombre} ??? ${fechaNorm}`);
      ok++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`   ?? ${row.cedula} ${fechaNorm}:`, msg);
      err++;
    }
  }

  console.log(`   Turnos: ${ok} ok, ${skip} saltados, ${err} errores`);
}

async function importarForaneos() {
  console.log("\n📋 Leyendo Importacion_Foraneos...");
  const filas = await leerHoja("Importacion_Foraneos");
  console.log(`   ${filas.length} filas encontradas`);
  let ok = 0, skip = 0, err = 0;

  for (const f of filas) {
    const cedula = (f["Cedula"] || f["Cédula"] || "").trim();
    const fechaRaw = (f["Fecha"] || "").trim();
    const kmInicialStr = (f["KmInicial"] || "").trim();
    const kmFinalStr = (f["KmFinal"] || "").trim();
    const observaciones = (f["Observaciones"] || "").trim() || null;

    if (!cedula || !fechaRaw || !kmInicialStr || !kmFinalStr) { skip++; continue; }

    try {
      const fechaNorm = normalizarFecha(fechaRaw);
      const user = await prisma.user.findUnique({ where: { cedula } });
      if (!user) { console.warn(`   ⚠️  Cédula no encontrada: ${cedula}`); skip++; continue; }

      const kmInicial = parseFloat(kmInicialStr);
      const kmFinal = parseFloat(kmFinalStr);
      if (isNaN(kmInicial) || isNaN(kmFinal)) {
        console.warn(`   ⚠️  KM inválidos: ${cedula} ${fechaRaw}`);
        skip++; continue;
      }

      const createdAt = new Date(`${fechaNorm}T12:00:00.000Z`);
      const fechaStart = new Date(`${fechaNorm}T00:00:00.000Z`);
      const fechaEnd = new Date(`${fechaNorm}T23:59:59.999Z`);

      const existe = await prisma.fotoRegistro.findFirst({
        where: {
          userId: user.id,
          tipo: "FORANEO",
          createdAt: { gte: fechaStart, lte: fechaEnd },
        },
      });
      if (existe) {
        console.log(`   ⏭ Ya existe: ${user.nombre} ${fechaNorm}`);
        skip++;
        continue;
      }

      await prisma.fotoRegistro.create({
        data: {
          userId: user.id,
          tipo: "FORANEO",
          kmInicial,
          kmFinal,
          latInicial: 0,
          lngInicial: 0,
          observaciones,
          estadoAprobacion: "APROBADA",
          createdAt,
        }
      });

      console.log(`   ✅ ${user.nombre} — ${fechaNorm} (km ${kmInicial} → ${kmFinal})`);
      ok++;
    } catch(e: unknown) {
      console.error(`   ❌ ${cedula} ${fechaRaw}:`, e instanceof Error ? e.message : e);
      err++;
    }
  }
  console.log(`   Foráneos: ${ok} ok, ${skip} saltados, ${err} errores`);
}

async function importarDisponibilidad() {
  console.log("\n📋 Leyendo Importacion_Disponibilidad...");
  const filas = await leerHoja("Importacion_Disponibilidad");
  console.log(`   ${filas.length} filas encontradas`);
  let ok = 0, skip = 0, err = 0;

  for (const f of filas) {
    const cedula = (f["Cedula"] || f["Cédula"] || "").trim();
    const fechaRaw = (f["Fecha"] || "").trim();
    const montoStr = (f["Monto"] || "").trim();

    if (!cedula || !fechaRaw) { skip++; continue; }

    try {
      const fechaNorm = normalizarFecha(fechaRaw);
      if (!fechaNorm) { skip++; continue; }

      const user = await prisma.user.findUnique({ where: { cedula } });
      if (!user) {
        console.warn(`   ⚠️  Cédula no encontrada: ${cedula}`);
        skip++;
        continue;
      }

      const fechaDate = new Date(`${fechaNorm}T00:00:00.000Z`);
      const monto = montoStr ? parseFloat(montoStr) : 80000;
      if (isNaN(monto)) { console.warn(`   ⚠️  Monto inválido: ${cedula} ${fechaRaw}`); skip++; continue; }

      await prisma.disponibilidad.upsert({
        where: { userId_fecha: { userId: user.id, fecha: fechaDate } },
        create: { userId: user.id, fecha: fechaDate, monto },
        update: { monto },
      });

      console.log(`   ✅ ${user.nombre} — ${fechaNorm} ($${monto})`);
      ok++;
    } catch (e: unknown) {
      console.error(`   ❌ ${cedula} ${fechaRaw}:`, e instanceof Error ? e.message : e);
      err++;
    }
  }
  console.log(`   Disponibilidad: ${ok} ok, ${skip} saltados, ${err} errores`);
}

async function importarTurnosCoordinador() {
  console.log("\n📋 Leyendo Importacion_TurnosCoordinador...");
  const filas = await leerHoja("Importacion_TurnosCoordinador");
  console.log(`   ${filas.length} filas encontradas`);

  type Cand = {
    cedula: string;
    fechaNorm: string;
    fechaDate: Date;
    horaEntrada: Date;
    horaSalida: Date;
    codigoOrden: string;
    nota: string | null;
    ubicE: string;
    ubicS: string;
  };

  const cedulas = new Set<string>();
  const candidatos: Cand[] = [];

  for (const f of filas) {
    const cedula = (f["Cedula"] || f["Cédula"] || "").trim();
    const fechaRaw = (f["Fecha"] || "").trim();
    const entradaStr = (f["HoraEntrada"] || "").trim();
    const salidaStr = (f["HoraSalida"] || "").trim();
    const codigoOrden = (f["CodigoOrden"] || f["Codigo"] || "").trim();
    if (!cedula || !fechaRaw || !entradaStr || !salidaStr || !codigoOrden) continue;

    const fechaNorm = normalizarFecha(fechaRaw);
    if (!fechaNorm) continue;

    const phE = parsearHora(entradaStr);
    const phS = parsearHora(salidaStr);
    if (!phE || !phS) continue;

    let horaEntrada = new Date(`${fechaNorm}T${phE}-05:00`);
    let horaSalida = new Date(`${fechaNorm}T${phS}-05:00`);
    if (isNaN(horaEntrada.getTime()) || isNaN(horaSalida.getTime())) continue;
    if (horaSalida.getTime() <= horaEntrada.getTime()) {
      horaSalida = new Date(horaSalida.getTime() + 24 * 60 * 60 * 1000);
    }

    cedulas.add(cedula);
    candidatos.push({
      cedula,
      fechaNorm,
      fechaDate: new Date(`${fechaNorm}T00:00:00.000Z`),
      horaEntrada,
      horaSalida,
      codigoOrden,
      nota: (f["Nota"] || "").trim() || null,
      ubicE: f["UbicacionEntrada"] || "",
      ubicS: f["UbicacionSalida"] || "",
    });
  }

  const users = await prisma.user.findMany({
    where: { cedula: { in: Array.from(cedulas) } },
    select: { id: true, cedula: true, nombre: true },
  });
  const userByCedula = new Map(users.map((u) => [u.cedula, u]));

  const resolved = candidatos
    .map((c) => {
      const user = userByCedula.get(c.cedula);
      if (!user) return null;
      return { ...c, user };
    })
    .filter((x): x is Cand & { user: { id: string; cedula: string; nombre: string } } => x !== null)
    .sort((a, b) => {
      if (a.user.id !== b.user.id) return a.user.id.localeCompare(b.user.id);
      return a.fechaNorm.localeCompare(b.fechaNorm);
    });

  if (resolved.length === 0) {
    console.log("   Sin filas válidas para importar.");
    return;
  }

  const minF = resolved.reduce((m, r) => (r.fechaDate < m ? r.fechaDate : m), resolved[0].fechaDate);
  const maxF = resolved.reduce((m, r) => (r.fechaDate > m ? r.fechaDate : m), resolved[0].fechaDate);
  const inicioGlob = getInicioSemana(minF);
  const finGlob = getFinSemana(maxF);

  const festivosRows = await prisma.festivo.findMany({
    where: { fecha: { gte: inicioGlob, lte: finGlob } },
  });
  const holidaySet = new Set<string>();
  for (const fv of festivosRows) agregarClavesFestivo(fv.fecha, holidaySet);

  const userIds = Array.from(new Set(resolved.map((r) => r.user.id)));
  const mallaRows = await prisma.mallaTurno.findMany({
    where: { userId: { in: userIds }, fecha: { gte: minF, lte: maxF } },
  });
  const mallaKey = (uid: string, ymd: string) => `${uid}|${ymd}`;
  const mallaMap = new Map<string, MallaRow>();
  for (const m of mallaRows) {
    const ymd = m.fecha.toISOString().split("T")[0];
    mallaMap.set(mallaKey(m.userId, ymd), {
      tipo: m.tipo,
      valor: m.valor,
      horaInicio: m.horaInicio,
      horaFin: m.horaFin,
    });
  }

  const batchOrdByWeek = new Map<string, { fecha: Date; horasOrdinarias: number }[]>();

  let ok = 0, skip = 0, err = 0;

  for (const row of resolved) {
    const { user, fechaDate, fechaNorm, horaEntrada, horaSalida, codigoOrden, nota, ubicE, ubicS } = row;

    try {
      const existe = await prisma.turnoCoordinador.findFirst({
        where: { userId: user.id, fecha: fechaDate },
      });
      if (existe) {
        console.log(`   ⏭ Ya existe: ${user.nombre} ${fechaNorm}`);
        skip++;
        continue;
      }

      const inicioSemana = getInicioSemana(fechaDate);
      const finSemana = getFinSemana(fechaDate);
      const weekKey = `${user.id}|${inicioSemana.toISOString()}`;

      const dbSemana = await prisma.turnoCoordinador.findMany({
        where: {
          userId: user.id,
          fecha: { gte: inicioSemana, lte: finSemana },
          horaSalida: { not: null },
        },
        select: { fecha: true, horasOrdinarias: true },
      });

      const batchSlice = batchOrdByWeek.get(weekKey) ?? [];
      const combined = [
        ...dbSemana.map((t) => ({ fecha: t.fecha, horasOrdinarias: t.horasOrdinarias ?? 0 })),
        ...batchSlice,
      ];
      const weeklyOrdHours = sumWeeklyOrdHoursMonSat(combined);

      const rowMalla = mallaMap.get(mallaKey(user.id, fechaNorm)) ?? null;
      const esFestivo =
        holidaySet.has(dateKeyColombia(fechaDate)) ||
        holidaySet.has(fechaDate.toISOString().split("T")[0]);
      const mallaDia = mallaDiaParaTurno(rowMalla, esFestivo, fechaDate);

      const resultado = calcularHorasTurno(
        { horaEntrada, horaSalida, fecha: fechaDate },
        mallaDia,
        holidaySet,
        weeklyOrdHours
      );
      const horasData = resultadoToTurnoData(resultado);

      const coordE = parsearCoordenada(ubicE);
      const coordS = parsearCoordenada(ubicS);

      await prisma.turnoCoordinador.create({
        data: {
          userId: user.id,
          fecha: fechaDate,
          horaEntrada,
          horaSalida,
          codigoOrden,
          nota,
          latEntrada: coordE ? coordE[0] : null,
          lngEntrada: coordE ? coordE[1] : null,
          latSalida: coordS ? coordS[0] : null,
          lngSalida: coordS ? coordS[1] : null,
          ...horasData,
        },
      });

      if (getDayOfWeekColombia(fechaDate) !== 0) {
        const next = [...batchSlice, { fecha: fechaDate, horasOrdinarias: horasData.horasOrdinarias }];
        batchOrdByWeek.set(weekKey, next);
      }

      console.log(`   ✅ ${user.nombre} — ${fechaNorm} [${codigoOrden}]`);
      ok++;
    } catch (e: unknown) {
      console.error(`   ❌ ${row.cedula} ${fechaNorm}:`, e instanceof Error ? e.message : e);
      err++;
    }
  }
  console.log(`   Turnos coordinador: ${ok} ok, ${skip} saltados, ${err} errores`);
}

async function importarTurnosHojaPrincipal() {
  console.log("\n📋 Leyendo hoja Turnos (con horas pre-calculadas)...");
  const filas = await leerHoja("Turnos");
  console.log(`   ${filas.length} filas encontradas`);
  let ok = 0, skip = 0, err = 0;

  const cedulas = new Set<string>();
  for (const f of filas) {
    const cedula = (f["Cédula"] || f["Cedula"] || "").trim();
    if (cedula) cedulas.add(cedula);
  }

  const users = await prisma.user.findMany({
    where: { cedula: { in: Array.from(cedulas) } },
    select: { id: true, cedula: true, nombre: true },
  });
  const userByCedula = new Map(users.map((u) => [u.cedula, u]));

  for (let rowIdx = 0; rowIdx < filas.length; rowIdx++) {
    const f = filas[rowIdx];
    const cedula = (f["Cédula"] || f["Cedula"] || "").trim();
    const fechaRaw = (f["Fecha"] || "").trim();
    const entradaStr = (f["Entrada"] || "").trim();
    const salidaStr = (f["Salida"] || "").trim();

    if (!cedula || !fechaRaw || !entradaStr || !salidaStr) {
      if (!cedula) console.warn(`   ⚠️  Fila ${rowIdx + 2}: cédula vacía (fecha="${fechaRaw}", entrada="${entradaStr}", salida="${salidaStr}")`);
      else if (!fechaRaw) console.warn(`   ⚠️  Fila ${rowIdx + 2}: fecha vacía (cédula="${cedula}")`);
      else console.warn(`   ⚠️  Sin horario: ${cedula} ${fechaRaw} (entrada="${entradaStr}" salida="${salidaStr}")`);
      skip++; continue;
    }

    try {
      const fechaNorm = normalizarFecha(fechaRaw);
      if (!fechaNorm) { console.warn(`   ⚠️  Fecha inválida: ${cedula} "${fechaRaw}"`); skip++; continue; }

      const user = userByCedula.get(cedula);
      if (!user) {
        console.warn(`   ⚠️  Cédula no encontrada: ${cedula}`);
        skip++;
        continue;
      }

      const fechaDate = new Date(`${fechaNorm}T00:00:00.000Z`);

      const existe = await prisma.turno.findFirst({
        where: { userId: user.id, fecha: fechaDate },
      });
      if (existe) {
        skip++;
        continue;
      }

      const phE = parsearHora(entradaStr);
      const phS = parsearHora(salidaStr);
      if (!phE || !phS) { console.warn(`   ⚠️  Hora inválida: ${cedula} ${fechaNorm} (entrada="${entradaStr}" salida="${salidaStr}")`); skip++; continue; }

      let horaEntrada = new Date(`${fechaNorm}T${phE}-05:00`);
      let horaSalida = new Date(`${fechaNorm}T${phS}-05:00`);
      if (isNaN(horaEntrada.getTime()) || isNaN(horaSalida.getTime())) {
        console.warn(`   ⚠️  Hora no parseable: ${cedula} ${fechaNorm} (${phE} / ${phS})`);
        skip++; continue;
      }
      if (horaSalida.getTime() <= horaEntrada.getTime()) {
        horaSalida = new Date(horaSalida.getTime() + 24 * 60 * 60 * 1000);
      }

      const parseHoras = (v: string) => parseFloat(v.replace(",", ".")) || 0;

      await prisma.turno.create({
        data: {
          userId: user.id,
          fecha: fechaDate,
          horaEntrada,
          horaSalida,
          horasOrdinarias:  parseHoras(f["Horas Ordinarias"] || "0"),
          heDiurna:         parseHoras(f["HE Diurna"] || "0"),
          heNocturna:       parseHoras(f["HE Nocturna"] || "0"),
          heDominical:      parseHoras(f["HE Dom/Fest Diurna"] || "0"),
          heNoctDominical:  parseHoras(f["HE Dom/Fest Nocturna"] || "0"),
          recNocturno:      parseHoras(f["Recargo Nocturno"] || "0"),
          recDominical:     parseHoras(f["Recargo Dom/Fest Diurno"] || "0"),
          recNoctDominical: parseHoras(f["Recargo Dom/Fest Nocturno"] || "0"),
        },
      });

      console.log(`   ✅ ${user.nombre} — ${fechaNorm}`);
      ok++;
    } catch (e: unknown) {
      console.error(`   ❌ ${cedula} ${fechaRaw}:`, e instanceof Error ? e.message : e);
      err++;
    }
  }
  console.log(`   Turnos (hoja principal): ${ok} ok, ${skip} saltados, ${err} errores`);
}

async function diagnosticarDuplicados() {
  console.log("\n🔍 Buscando filas duplicadas en hoja Turnos...");
  const filas = await leerHoja("Turnos");
  const vistas = new Map<string, number>();
  for (let i = 0; i < filas.length; i++) {
    const cedula = (filas[i]["Cédula"] || filas[i]["Cedula"] || "").trim();
    const fechaRaw = (filas[i]["Fecha"] || "").trim();
    const fechaNorm = normalizarFecha(fechaRaw) ?? fechaRaw;
    const key = `${cedula}|${fechaNorm}`;
    if (vistas.has(key)) {
      console.log(`   ⚠️  DUPLICADO fila ${i + 2} == fila ${vistas.get(key)! + 2}: cédula=${cedula} fecha=${fechaNorm}`);
    } else {
      vistas.set(key, i);
    }
  }
  console.log(`   Listo. ${filas.length} filas, ${vistas.size} únicas.`);
}

async function diagnosticarFaltantes() {
  console.log("\n🔍 Diagnosticando registros faltantes en hoja Turnos...");
  const filas = await leerHoja("Turnos");
  console.log(`   ${filas.length} filas en sheet`);

  const cedulas = new Set<string>();
  for (const f of filas) {
    const c = (f["Cédula"] || f["Cedula"] || "").trim();
    if (c) cedulas.add(c);
  }
  const users = await prisma.user.findMany({
    where: { cedula: { in: Array.from(cedulas) } },
    select: { id: true, cedula: true, nombre: true },
  });
  const userByCedula = new Map(users.map((u) => [u.cedula, u]));

  let faltantes = 0;
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    const cedula = (f["Cédula"] || f["Cedula"] || "").trim();
    const fechaRaw = (f["Fecha"] || "").trim();
    if (!cedula || !fechaRaw) {
      console.log(`   ⚠️  Fila ${i + 2}: cedula="${cedula}" fecha="${fechaRaw}"`);
      continue;
    }
    const fechaNorm = normalizarFecha(fechaRaw);
    if (!fechaNorm) { console.log(`   ⚠️  Fila ${i + 2}: fecha inválida "${fechaRaw}"`); continue; }
    const user = userByCedula.get(cedula);
    if (!user) { console.log(`   ⚠️  Fila ${i + 2}: cédula ${cedula} no en DB`); continue; }
    const fechaDate = new Date(`${fechaNorm}T00:00:00.000Z`);
    const existe = await prisma.turno.findFirst({ where: { userId: user.id, fecha: fechaDate } });
    if (!existe) {
      console.log(`   ❌ FALTANTE fila ${i + 2}: ${user.nombre} (${cedula}) — ${fechaNorm} | entrada="${f["Entrada"]}" salida="${f["Salida"]}"`);
      faltantes++;
    }
  }
  console.log(`   Total faltantes: ${faltantes}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--duplicados")) {
    await diagnosticarDuplicados();
    await prisma.$disconnect();
    return;
  }
  if (args.includes("--diagnosticar")) {
    await diagnosticarFaltantes();
    await prisma.$disconnect();
    return;
  }
  console.log("🚀 Iniciando importación...");
  await importarMalla();
  await importarDisponibilidad();
  await importarForaneos();
  await importarTurnosCoordinador();
  await importarTurnosHojaPrincipal();
  await importarTurnos();
  await prisma.$disconnect();
  console.log("\n✅ Listo. Opcional: admin → recalcular turnos si mezclas datos antiguos.");
}

main().catch((e) => {
  console.error(e);
  void prisma.$disconnect();
  process.exit(1);
});
