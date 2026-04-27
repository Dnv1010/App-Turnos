import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const prisma = new PrismaClient();

async function main() {
  console.log("DATABASE_URL host:", process.env.DATABASE_URL?.match(/@([^:/]+)/)?.[1] ?? "(no detectado)");

  const total = await prisma.mallaTurno.count({ where: { tipo: "DISPONIBLE" } });
  console.log(`\nTotal registros con tipo=DISPONIBLE en la BD: ${total}`);

  const recientes = await prisma.mallaTurno.findMany({
    where: {
      tipo: "DISPONIBLE",
      fecha: { gte: new Date("2026-03-15"), lte: new Date("2026-04-30") },
    },
    include: { user: { select: { nombre: true, cedula: true, role: true } } },
    orderBy: { fecha: "asc" },
  });
  console.log(`\nRegistros DISPONIBLE entre 15-mar y 30-abr 2026: ${recientes.length}`);
  for (const r of recientes) {
    console.log(`  - ${r.fecha.toISOString().split("T")[0]} | ${r.user.nombre} (${r.user.role}, ${r.user.cedula})`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("ERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});
