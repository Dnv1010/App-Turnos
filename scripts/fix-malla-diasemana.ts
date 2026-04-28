/**
 * Corrige registros de MallaTurno donde el día de la semana fue mal calculado.
 *
 * Causa: entornos no-UTC usaban getDay() sobre fechas UTC midnight, haciendo
 * que lunes (UTC) se tratara como domingo local → DESCANSO, y
 * domingo (UTC) como sábado local → TRABAJO 08:00-12:00.
 *
 * Ejecutar: npx tsx scripts/fix-malla-diasemana.ts
 */
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const prisma = new PrismaClient();

async function main() {
  const todos = await prisma.shiftSchedule.findMany({
    select: { id: true, date: true, dayType: true, shiftCode: true, startTime: true, endTime: true },
  });

  // Festivos en BD para no sobreescribir lunes festivos que sí deben ser DESCANSO
  const festivoRows = await prisma.holiday.findMany({ select: { date: true } });
  const festivoSet = new Set(festivoRows.map((f) => f.date.toISOString().split("T")[0]));

  let fixedDomingo = 0;
  let fixedLunes = 0;
  let skippedLunesFestivo = 0;

  for (const r of todos) {
    const dow = r.date.getUTCDay(); // 0=Dom, 1=Lun, 6=Sáb
    const fechaKey = r.date.toISOString().split("T")[0];
    const esFestivo = festivoSet.has(fechaKey);

    // Caso 1: Domingo mal marcado como TRABAJO (debería ser DESCANSO)
    if (dow === 0 && r.dayType === "TRABAJO") {
      await prisma.shiftSchedule.update({
        where: { id: r.id },
        data: { dayType: "DESCANSO", shiftCode: "descanso", startTime: null, endTime: null },
      });
      console.log(`  [DOM→DESCANSO] ${fechaKey}`);
      fixedDomingo++;
    }

    // Caso 2: Lunes mal marcado como DESCANSO (valor "descanso"), sin ser festivo
    else if (dow === 1 && r.dayType === "DESCANSO" && r.shiftCode === "descanso" && !esFestivo) {
      await prisma.shiftSchedule.update({
        where: { id: r.id },
        data: { dayType: "TRABAJO", shiftCode: "08:00-17:00", startTime: "08:00", endTime: "17:00" },
      });
      console.log(`  [LUN→TRABAJO]  ${fechaKey}`);
      fixedLunes++;
    }

    else if (dow === 1 && r.dayType === "DESCANSO" && r.shiftCode === "descanso" && esFestivo) {
      skippedLunesFestivo++;
    }
  }

  console.log("\n=== Resumen ===");
  console.log(`Domingos corregidos (TRABAJO→DESCANSO): ${fixedDomingo}`);
  console.log(`Lunes corregidos   (DESCANSO→TRABAJO):  ${fixedLunes}`);
  console.log(`Lunes omitidos     (son festivos, OK):   ${skippedLunesFestivo}`);
  console.log(`Total revisados: ${todos.length}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
