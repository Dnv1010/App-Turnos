import { PrismaClient } from "@prisma/client";
import { google } from "googleapis";
import * as dotenv from "dotenv";
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

function normalizarFecha(fecha) {
  if (!fecha) return null;
  fecha = String(fecha).trim();
  if (fecha.includes("/")) {
    const p = fecha.split("/");
    const d = p[0].padStart(2,"0");
    const m = p[1].padStart(2,"0");
    const y = p[2];
    return `${y}-${m}-${d}`;
  }
  return fecha;
}

function parsearHora(valor) {
  if (!valor || valor.trim() === "") return null;
  const num = parseFloat(valor);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMin = Math.round(num * 24 * 60);
    const h = Math.floor(totalMin / 60).toString().padStart(2, "0");
    const m = (totalMin % 60).toString().padStart(2, "0");
    return `${h}:${m}:00`;
  }
  const partes = valor.trim().split(":");
  partes[0] = partes[0].padStart(2, "0");
  return partes.join(":");
}

async function leerHoja(nombre) {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${nombre}!A1:Z10000`,
  });
  const rows = res.data.values ?? [];
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = (row[i] ?? "").toString().trim(); });
    return obj;
  });
}

function parsearCoordenada(valor) {
  if (!valor || valor.trim() === "") return null;
  const p = valor.split(",").map(v => parseFloat(v.trim()));
  return p.length === 2 && !isNaN(p[0]) && !isNaN(p[1]) ? p : null;
}

async function importarMalla() {
  console.log("\n📋 Leyendo Importacion_Malla...");
  const filas = await leerHoja("Importacion_Malla");
  console.log(`   ${filas.length} filas encontradas`);
  let ok = 0, skip = 0, err = 0;

  const tipoMap = {
    TRABAJO:"TRABAJO", DESCANSO:"DESCANSO", DISPONIBLE:"DISPONIBLE",
    DIA_FAMILIA:"DIA_FAMILIA", INCAPACITADO:"INCAPACITADO",
    VACACIONES:"VACACIONES", MEDIO_CUMPLE:"MEDIO_CUMPLE",
  };

  for (const f of filas) {
    const cedula = f["Cedula"] || f["Cédula"] || "";
    const fechaRaw = f["Fecha"] || "";
    const valor = f["Valor"] || "";
    const tipo = (f["Tipo"] || "TRABAJO").toUpperCase();
    const horaInicio = f["HoraInicio"] || null;
    const horaFin = f["HoraFin"] || null;

    if (!cedula || !fechaRaw) { skip++; continue; }

    try {
      const fechaNorm = normalizarFecha(fechaRaw);
      const user = await prisma.user.findUnique({ where: { cedula } });
      if (!user) { console.warn(`   ⚠️  Cédula no encontrada: ${cedula}`); skip++; continue; }
      const fechaDate = new Date(`${fechaNorm}T00:00:00.000Z`);
      const tipoPrisma = tipoMap[tipo] ?? "TRABAJO";
      await prisma.mallaTurno.upsert({
        where: { userId_fecha: { userId: user.id, fecha: fechaDate } },
        create: { userId: user.id, fecha: fechaDate, valor: valor || tipoPrisma, tipo: tipoPrisma, horaInicio: horaInicio || null, horaFin: horaFin || null },
        update: { valor: valor || tipoPrisma, tipo: tipoPrisma, horaInicio: horaInicio || null, horaFin: horaFin || null },
      });
      ok++;
    } catch(e) { console.error(`   ❌ ${cedula} ${fechaRaw}:`, e.message); err++; }
  }
  console.log(`   Malla: ${ok} ok, ${skip} saltados, ${err} errores`);
}

async function importarTurnos() {
  console.log("\n📋 Leyendo Importacion_Turnos...");
  const filas = await leerHoja("Importacion_Turnos");
  console.log(`   ${filas.length} filas encontradas`);
  let ok = 0, skip = 0, err = 0;

  for (const f of filas) {
    const cedula = f["Cedula"] || f["Cédula"] || "";
    const fechaRaw = f["Fecha"] || "";
    const entradaStr = f["HoraEntrada"] || "";
    const salidaStr = f["HoraSalida"] || "";
    const ubicE = f["UbicacionEntrada"] || "";
    const ubicS = f["UbicacionSalida"] || "";

    if (!cedula || !fechaRaw || !entradaStr || !salidaStr) { skip++; continue; }

    try {
      const fechaNorm = normalizarFecha(fechaRaw);
      const user = await prisma.user.findUnique({ where: { cedula } });
      if (!user) { console.warn(`   ⚠️  Cédula no encontrada: ${cedula}`); skip++; continue; }

      const horaEntrada = new Date(`${fechaNorm}T${parsearHora(entradaStr)}-05:00`);
      const horaSalida  = new Date(`${fechaNorm}T${parsearHora(salidaStr)}-05:00`);
      const fechaDate = new Date(`${fechaNorm}T00:00:00.000Z`);

      if (isNaN(horaEntrada.getTime()) || isNaN(horaSalida.getTime())) {
        console.warn(`   ⚠️  Hora inválida: ${cedula} ${fechaRaw} | entrada="${entradaStr}" salida="${salidaStr}"`);
        skip++; continue;
      }

      const existe = await prisma.turno.findFirst({ where: { userId: user.id, fecha: fechaDate } });
      if (existe) { console.log(`   ⏩ Ya existe: ${user.nombre} ${fechaNorm}`); skip++; continue; }

      const coordE = parsearCoordenada(ubicE);
      const coordS = parsearCoordenada(ubicS);
      const diffH = (horaSalida - horaEntrada) / 3600000;
      const esDom = horaEntrada.getUTCDay() === 0;
      const horasOrd = Math.min(diffH, esDom ? 0 : 8);
      const extra = Math.max(0, diffH - horasOrd);

      await prisma.turno.create({
        data: {
          userId: user.id, fecha: fechaDate, horaEntrada, horaSalida,
          latEntrada: coordE ? coordE[0] : null, lngEntrada: coordE ? coordE[1] : null,
          latSalida: coordS ? coordS[0] : null, lngSalida: coordS ? coordS[1] : null,
          horasOrdinarias: Math.round(horasOrd * 100) / 100,
          heDiurna: esDom ? 0 : Math.round(extra * 100) / 100,
          heNocturna: 0, heDominical: esDom ? Math.round(extra * 100) / 100 : 0,
          heNoctDominical: 0, recNocturno: 0, recDominical: 0, recNoctDominical: 0,
        }
      });
      console.log(`   ✅ ${user.nombre} — ${fechaNorm}`);
      ok++;
    } catch(e) { console.error(`   ❌ ${cedula} ${fechaRaw}:`, e.message); err++; }
  }
  console.log(`   Turnos: ${ok} ok, ${skip} saltados, ${err} errores`);
}

async function main() {
  console.log("🚀 Iniciando importación...");
  await importarMalla();
  await importarTurnos();
  await prisma.$disconnect();
  console.log("\n✅ Listo. Ahora ejecuta Sincronizar Sheets en la app.");
}

main().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
