-- AlterTable
ALTER TABLE "Turno" ADD COLUMN "diaSemana" TEXT;

-- Backfill: calcular el día de la semana para registros existentes
UPDATE "Turno"
SET "diaSemana" = CASE EXTRACT(DOW FROM fecha)
  WHEN 0 THEN 'Domingo'
  WHEN 1 THEN 'Lunes'
  WHEN 2 THEN 'Martes'
  WHEN 3 THEN 'Miércoles'
  WHEN 4 THEN 'Jueves'
  WHEN 5 THEN 'Viernes'
  WHEN 6 THEN 'Sábado'
END
WHERE "diaSemana" IS NULL;
