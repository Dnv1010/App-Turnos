-- CreateTable
CREATE TABLE "Reporte" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fechaInicio" DATE NOT NULL,
    "fechaFin" DATE NOT NULL,
    "creadoPor" TEXT NOT NULL,
    "zona" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReporteTurno" (
    "id" TEXT NOT NULL,
    "reporteId" TEXT NOT NULL,
    "turnoId" TEXT NOT NULL,

    CONSTRAINT "ReporteTurno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReporteForaneo" (
    "id" TEXT NOT NULL,
    "reporteId" TEXT NOT NULL,
    "fotoRegistroId" TEXT NOT NULL,

    CONSTRAINT "ReporteForaneo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Reporte_zona_idx" ON "Reporte"("zona");
CREATE INDEX "Reporte_createdAt_idx" ON "Reporte"("createdAt");

CREATE UNIQUE INDEX "ReporteTurno_reporteId_turnoId_key" ON "ReporteTurno"("reporteId", "turnoId");
CREATE UNIQUE INDEX "ReporteForaneo_reporteId_fotoRegistroId_key" ON "ReporteForaneo"("reporteId", "fotoRegistroId");

ALTER TABLE "Reporte" ADD CONSTRAINT "Reporte_creadoPor_fkey" FOREIGN KEY ("creadoPor") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReporteTurno" ADD CONSTRAINT "ReporteTurno_reporteId_fkey" FOREIGN KEY ("reporteId") REFERENCES "Reporte"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReporteTurno" ADD CONSTRAINT "ReporteTurno_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReporteForaneo" ADD CONSTRAINT "ReporteForaneo_reporteId_fkey" FOREIGN KEY ("reporteId") REFERENCES "Reporte"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReporteForaneo" ADD CONSTRAINT "ReporteForaneo_fotoRegistroId_fkey" FOREIGN KEY ("fotoRegistroId") REFERENCES "FotoRegistro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
