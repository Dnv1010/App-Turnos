-- CreateTable
CREATE TABLE "ReporteDisponibilidad" (
    "id" TEXT NOT NULL,
    "reporteId" TEXT NOT NULL,
    "mallaTurnoId" TEXT NOT NULL,

    CONSTRAINT "ReporteDisponibilidad_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReporteDisponibilidad_reporteId_mallaTurnoId_key" ON "ReporteDisponibilidad"("reporteId", "mallaTurnoId");

ALTER TABLE "ReporteDisponibilidad" ADD CONSTRAINT "ReporteDisponibilidad_reporteId_fkey" FOREIGN KEY ("reporteId") REFERENCES "Reporte"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReporteDisponibilidad" ADD CONSTRAINT "ReporteDisponibilidad_mallaTurnoId_fkey" FOREIGN KEY ("mallaTurnoId") REFERENCES "MallaTurno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
