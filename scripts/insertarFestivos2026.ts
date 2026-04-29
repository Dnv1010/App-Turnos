import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const FORMATO_MAP: Record<string, string> = {
  "08:00-17:00": "8-17",
  "08:00-12:00": "8-12",
  "08:00-14:00": "8-14",
  "07:00-17:00": "7-17",
  "07:00-16:00": "7-16",
  "06:00-14:00": "6-14",
  "09:00-17:00": "9-17",
  "08:00-18:00": "8-18",
  "07:00-15:00": "7-15",
};

async function main() {
  const todos = await prisma.shiftSchedule.findMany({
    select: { shiftCode: true },
    distinct: ["shiftCode"],
  });
  console.log("Valores distintos en malla:");
  todos.forEach((m) => console.log(" -", JSON.stringify(m.shiftCode)));

  let totalFixed = 0;
  for (const [viejo, nuevo] of Object.entries(FORMATO_MAP)) {
    const result = await prisma.shiftSchedule.updateMany({
      where: { shiftCode: viejo },
      data: { shiftCode: nuevo },
    });
    if (result.count > 0) {
      console.log(`Corregidos "${viejo}" a "${nuevo}": ${result.count}`);
      totalFixed += result.count;
    }
  }
  console.log(`Total corregidos: ${totalFixed}`);
  await prisma.$disconnect();
}

main().catch(console.error);
