import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const rows = await prisma.mallaTurno.findMany({ where: { tipo: "DISPONIBLE" } });
  let fixed = 0;
  for (const r of rows) {
    if (r.fecha.getUTCHours() !== 0) {
      const f = new Date(Date.UTC(r.fecha.getUTCFullYear(), r.fecha.getUTCMonth(), r.fecha.getUTCDate(), 0, 0, 0));
      await prisma.mallaTurno.update({ where: { id: r.id }, data: { fecha: f } });
      fixed++;
    }
  }
  console.log('Corregidas: ' + fixed + ' de ' + rows.length);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
