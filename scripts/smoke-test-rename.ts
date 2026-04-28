/**
 * Smoke test: confirm that the renamed Prisma schema can read from the
 * real database with the @map / @@map directives in place.
 *
 * Tests every model/enum touched by the rename so we catch any missing
 * @map at the schema level before we ship to production.
 *
 * Run with: npx tsx scripts/smoke-test-rename.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("== Smoke test: schema rename con @map / @@map ==\n");

  const user = await prisma.user.findFirst({
    where: { isActive: true },
    select: {
      id: true,
      documentNumber: true,
      fullName: true,
      email: true,
      role: true,
      zone: true,
      jobTitle: true,
      teamFilter: true,
      photoUrl: true,
      createdAt: true,
    },
  });
  console.log("[User] OK —", user ? `${user.fullName} (zone=${user.zone}, jobTitle=${user.jobTitle})` : "ningún user activo");

  const shift = await prisma.shift.findFirst({
    select: { id: true, date: true, clockInAt: true, clockOutAt: true, regularHours: true, weekday: true, notes: true },
  });
  console.log("[Shift] OK —", shift ? `${shift.date.toISOString().slice(0, 10)} clockIn=${shift.clockInAt.toISOString()}` : "ninguno");

  const schedule = await prisma.shiftSchedule.findFirst({
    select: { id: true, date: true, shiftCode: true, dayType: true, startTime: true, endTime: true },
  });
  console.log("[ShiftSchedule] OK —", schedule ? `${schedule.date.toISOString().slice(0, 10)} code=${schedule.shiftCode} dayType=${schedule.dayType}` : "ninguno");

  const holiday = await prisma.holiday.findFirst({
    select: { id: true, date: true, name: true },
  });
  console.log("[Holiday] OK —", holiday ? `${holiday.date.toISOString().slice(0, 10)} ${holiday.name}` : "ninguno");

  const availability = await prisma.availability.findFirst({
    select: { id: true, date: true, amount: true },
  });
  console.log("[Availability] OK —", availability ? `${availability.date.toISOString().slice(0, 10)} amount=${availability.amount}` : "ninguno");

  const trip = await prisma.tripRecord.findFirst({
    select: { id: true, type: true, approvalStatus: true, startKm: true, endKm: true, approvedAt: true, approvalNote: true },
  });
  console.log("[TripRecord] OK —", trip ? `type=${trip.type} status=${trip.approvalStatus}` : "ninguno");

  const coordShift = await prisma.coordinatorShift.findFirst({
    select: { id: true, date: true, clockInAt: true, orderCode: true, note: true, regularHours: true },
  });
  console.log("[CoordinatorShift] OK —", coordShift ? `${coordShift.date.toISOString().slice(0, 10)} order=${coordShift.orderCode}` : "ninguno");

  const report = await prisma.report.findFirst({
    select: { id: true, name: true, startDate: true, endDate: true, createdBy: true, zone: true },
  });
  console.log("[Report] OK —", report ? `${report.name} zone=${report.zone ?? "-"}` : "ninguno");

  const reportShift = await prisma.reportShift.findFirst({ select: { id: true, reportId: true, shiftId: true } });
  console.log("[ReportShift] OK —", reportShift ? "1 row" : "ninguno");

  const reportTrip = await prisma.reportTrip.findFirst({ select: { id: true, reportId: true, tripRecordId: true } });
  console.log("[ReportTrip] OK —", reportTrip ? "1 row" : "ninguno");

  const reportAvailability = await prisma.reportAvailability.findFirst({ select: { id: true, reportId: true, shiftScheduleId: true } });
  console.log("[ReportAvailability] OK —", reportAvailability ? "1 row" : "ninguno");

  const reportCoordShift = await prisma.reportCoordinatorShift.findFirst({ select: { id: true, reportId: true, coordinatorShiftId: true } });
  console.log("[ReportCoordinatorShift] OK —", reportCoordShift ? "1 row" : "ninguno");

  const sub = await prisma.pushSubscription.findFirst({ select: { id: true, userId: true, endpoint: true, createdAt: true } });
  console.log("[PushSubscription] OK —", sub ? "1 row" : "ninguno");

  console.log("\n✅ Todos los queries pasaron. El schema con @map / @@map funciona end-to-end.");
}

main()
  .catch((err) => {
    console.error("\n❌ ERROR:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
