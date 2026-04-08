-- AlterEnum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'COORDINADOR_INTERIOR';

-- CreateTable
CREATE TABLE "TurnoCoordinador" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "horaEntrada" TIMESTAMP(3) NOT NULL,
    "horaSalida" TIMESTAMP(3),
    "codigoOrden" TEXT NOT NULL,
    "horasOrdinarias" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "heDiurna" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "heNocturna" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "heDominical" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "heNoctDominical" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recNocturno" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recDominical" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recNoctDominical" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latEntrada" DOUBLE PRECISION,
    "lngEntrada" DOUBLE PRECISION,
    "latSalida" DOUBLE PRECISION,
    "lngSalida" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TurnoCoordinador_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReporteTurnoCoordinador" (
    "id" TEXT NOT NULL,
    "reporteId" TEXT NOT NULL,
    "turnoCoordinadorId" TEXT NOT NULL,

    CONSTRAINT "ReporteTurnoCoordinador_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TurnoCoordinador_userId_fecha_idx" ON "TurnoCoordinador"("userId", "fecha");

CREATE UNIQUE INDEX "ReporteTurnoCoordinador_reporteId_turnoCoordinadorId_key" ON "ReporteTurnoCoordinador"("reporteId", "turnoCoordinadorId");

ALTER TABLE "TurnoCoordinador" ADD CONSTRAINT "TurnoCoordinador_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReporteTurnoCoordinador" ADD CONSTRAINT "ReporteTurnoCoordinador_reporteId_fkey" FOREIGN KEY ("reporteId") REFERENCES "Reporte"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReporteTurnoCoordinador" ADD CONSTRAINT "ReporteTurnoCoordinador_turnoCoordinadorId_fkey" FOREIGN KEY ("turnoCoordinadorId") REFERENCES "TurnoCoordinador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
