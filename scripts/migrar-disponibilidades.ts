/**
 * Migración de histórico de disponibilidades desde CSV → MallaTurno.
 *
 * Modos:
 *   - Por defecto: dry-run (no escribe nada, solo reporta).
 *   - Con flag `--apply`: ejecuta los upserts en BD.
 *
 * Uso:
 *   npx tsx scripts/migrar-disponibilidades.ts "ruta/al/archivo.csv"
 *   npx tsx scripts/migrar-disponibilidades.ts "ruta/al/archivo.csv" --apply
 *
 * Formato CSV esperado (header):
 *   Cédula,Nombre,Rol,Fecha,Disponibilidad,Valor
 *
 * Match: por cédula (User.cedula es @unique).
 * Tipo destino: DISPONIBLE. Valor: "disponible" (técnico) o "Disponible" (coordinador).
 * Fecha: se guarda a 00:00 UTC, igual que el resto de la app.
 */
import { PrismaClient, type TipoDia } from "@prisma/client";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const prisma = new PrismaClient();

type CsvRow = {
  cedula: string;
  nombre: string;
  rol: string;
  fechaRaw: string;
  estado: string;
  valor: string;
};

function parsearCsv(contenido: string): CsvRow[] {
  const lineas = contenido.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lineas.length < 2) return [];
  // Saltar la cabecera (asume orden fijo: Cédula,Nombre,Rol,Fecha,Disponibilidad,Valor)
  return lineas.slice(1).map((linea) => {
    const cols = linea.split(",").map((c) => c.trim());
    return {
      cedula: cols[0] ?? "",
      nombre: cols[1] ?? "",
      rol: cols[2] ?? "",
      fechaRaw: cols[3] ?? "",
      estado: cols[4] ?? "",
      valor: cols[5] ?? "",
    };
  });
}

/** DD/MM/YYYY → YYYY-MM-DD */
function normalizarFecha(s: string): string | null {
  if (!s) return null;
  const t = s.trim();
  if (t.includes("/")) {
    const [d, m, y] = t.split("/");
    if (!d || !m || !y) return null;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return t;
}

/** El valor que se guarda en MallaTurno.valor depende del rol del usuario en BD. */
function valorParaRol(role: string): string {
  // Coordinadores guardan "Disponible" (capitalizado), técnicos guardan "disponible"
  // (mismo criterio que /api/disponibilidad-coordinadores y /api/malla).
  if (role === "COORDINADOR" || role === "COORDINADOR_INTERIOR") return "Disponible";
  return "disponible";
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const csvPath = args.find((a) => !a.startsWith("--"));

  if (!csvPath) {
    console.error("❌ Falta ruta al CSV.\n   Uso: npx tsx scripts/migrar-disponibilidades.ts \"ruta/archivo.csv\" [--apply]");
    process.exit(1);
  }

  const fullPath = path.resolve(csvPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ No se encontró el archivo: ${fullPath}`);
    process.exit(1);
  }

  console.log(`\n📂 Leyendo: ${fullPath}`);
  console.log(`   Modo: ${apply ? "🔴 APPLY (escribe en BD)" : "🟢 DRY-RUN (solo lectura)"}\n`);

  const contenido = fs.readFileSync(fullPath, "utf-8");
  const filas = parsearCsv(contenido);
  console.log(`   ${filas.length} filas encontradas en el CSV`);

  if (filas.length === 0) {
    console.log("⚠️  CSV vacío o sin datos");
    await prisma.$disconnect();
    return;
  }

  // 1) Match por cédula en bloque para reducir queries
  const cedulasUnicas = Array.from(new Set(filas.map((f) => f.cedula).filter(Boolean)));
  const usuarios = await prisma.user.findMany({
    where: { cedula: { in: cedulasUnicas } },
    select: { id: true, cedula: true, nombre: true, role: true, zona: true },
  });
  const userByCedula = new Map(usuarios.map((u) => [u.cedula, u]));

  console.log(`   ${usuarios.length}/${cedulasUnicas.length} cédulas matcheadas en BD\n`);

  // 2) Construir el plan de operaciones
  type Plan = {
    cedula: string;
    nombreCsv: string;
    rolCsv: string;
    nombreBd: string;
    roleBd: string;
    zona: string;
    userId: string;
    fechaIso: string;
    fechaDate: Date;
    valor: string;
    skip?: string;
  };

  const plan: Plan[] = [];
  const saltados: { cedula: string; nombre: string; razon: string }[] = [];

  for (const f of filas) {
    if (!f.cedula || !f.fechaRaw) {
      saltados.push({ cedula: f.cedula, nombre: f.nombre, razon: "campos vacíos" });
      continue;
    }
    const user = userByCedula.get(f.cedula);
    if (!user) {
      saltados.push({ cedula: f.cedula, nombre: f.nombre, razon: "cédula no existe en BD" });
      continue;
    }
    const fechaNorm = normalizarFecha(f.fechaRaw);
    if (!fechaNorm) {
      saltados.push({ cedula: f.cedula, nombre: f.nombre, razon: `fecha inválida: ${f.fechaRaw}` });
      continue;
    }
    const fechaDate = new Date(`${fechaNorm}T00:00:00.000Z`);
    if (isNaN(fechaDate.getTime())) {
      saltados.push({ cedula: f.cedula, nombre: f.nombre, razon: `fecha no parseable: ${f.fechaRaw}` });
      continue;
    }

    plan.push({
      cedula: f.cedula,
      nombreCsv: f.nombre,
      rolCsv: f.rol,
      nombreBd: user.nombre,
      roleBd: user.role,
      zona: user.zona,
      userId: user.id,
      fechaIso: fechaNorm,
      fechaDate,
      valor: valorParaRol(user.role),
    });
  }

  // 3) Reporte
  console.log("─".repeat(72));
  console.log(`📊 RESUMEN`);
  console.log("─".repeat(72));
  console.log(`✓ Listos para migrar: ${plan.length}`);
  console.log(`✗ Saltados:           ${saltados.length}`);

  if (saltados.length > 0) {
    console.log(`\n⚠️  Saltados (revisar):`);
    for (const s of saltados) {
      console.log(`   - ${s.cedula} ${s.nombre} → ${s.razon}`);
    }
  }

  // Agrupar por usuario para el reporte
  const porUser = new Map<string, Plan[]>();
  for (const p of plan) {
    const key = `${p.userId}`;
    if (!porUser.has(key)) porUser.set(key, []);
    porUser.get(key)!.push(p);
  }
  console.log(`\n📋 Por usuario (${porUser.size} usuarios):`);
  const ordenados = Array.from(porUser.values()).sort((a, b) => a[0].nombreBd.localeCompare(b[0].nombreBd));
  for (const grupo of ordenados) {
    const u = grupo[0];
    const fechas = grupo.map((g) => g.fechaIso).sort().join(", ");
    console.log(`   - ${u.nombreBd} (${u.roleBd}, ${u.zona}, ${u.cedula}): ${grupo.length} fecha(s) → ${fechas}`);
  }

  if (!apply) {
    console.log("\n" + "─".repeat(72));
    console.log("🟢 DRY-RUN finalizado. No se escribió nada en BD.");
    console.log("   Para aplicar, vuelve a correr con --apply al final del comando.");
    console.log("─".repeat(72) + "\n");
    await prisma.$disconnect();
    return;
  }

  // 4) Modo apply
  console.log("\n" + "─".repeat(72));
  console.log("🔴 Aplicando en BD...");
  console.log("─".repeat(72));

  let ok = 0;
  let err = 0;

  for (const p of plan) {
    try {
      await prisma.mallaTurno.upsert({
        where: { userId_fecha: { userId: p.userId, fecha: p.fechaDate } },
        create: {
          userId: p.userId,
          fecha: p.fechaDate,
          valor: p.valor,
          tipo: "DISPONIBLE" satisfies TipoDia,
        },
        update: {
          valor: p.valor,
          tipo: "DISPONIBLE",
        },
      });
      ok++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`   ❌ ${p.cedula} ${p.fechaIso}: ${msg}`);
      err++;
    }
  }

  console.log(`\n✅ Aplicado: ${ok} ok, ${err} errores`);
  console.log("─".repeat(72) + "\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  void prisma.$disconnect();
  process.exit(1);
});
