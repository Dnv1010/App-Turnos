import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const rows = await prisma.shiftSchedule.findMany({ where: { dayType: "DISPONIBLE" } });
  let fixed = 0;
  for (const r of rows) {
    if (r.date.getUTCHours() !== 0) {
      const f = new Date(Date.UTC(r.date.getUTCFullYear(), r.date.getUTCMonth(), r.date.getUTCDate(), 0, 0, 0));
      await prisma.shiftSchedule.update({ where: { id: r.id }, data: { date: f } });
      fixed++;
    }
  }
  console.log('Corregidas: ' + fixed + ' de ' + rows.length);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
