-- AlterTable
ALTER TABLE "TurnoCoordinador" ADD COLUMN "nota" TEXT;

-- DropForeignKey (nombre puede variar según migración previa; ajustar si falla)
ALTER TABLE "ReporteTurnoCoordinador" DROP CONSTRAINT IF EXISTS "ReporteTurnoCoordinador_turnoCoordinadorId_fkey";

-- AddForeignKey
ALTER TABLE "ReporteTurnoCoordinador" ADD CONSTRAINT "ReporteTurnoCoordinador_turnoCoordinadorId_fkey"
  FOREIGN KEY ("turnoCoordinadorId") REFERENCES "TurnoCoordinador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
