-- ============================================================
-- Fase 1 (no destructiva): agregar campos + copiar datos
-- ============================================================

-- 1. Crear enum ShiftType
CREATE TYPE "App_turnos"."ShiftType" AS ENUM ('TECHNICAL', 'COORDINATOR');

-- 2. Agregar columnas nuevas a shifts
ALTER TABLE "App_turnos"."shifts"
  ADD COLUMN "shift_type" "App_turnos"."ShiftType" NOT NULL DEFAULT 'TECHNICAL',
  ADD COLUMN "order_code" TEXT;

-- 3. Insertar coordinator_shifts en shifts (con shiftType = COORDINATOR)
--    La columna 'note' de coordinator_shifts se fusiona en 'notes' de shifts.
INSERT INTO "App_turnos"."shifts" (
  "id", "user_id", "date", "shift_type",
  "clock_in_at", "clock_out_at",
  "order_code", "notes",
  "regular_hours", "daytime_overtime_hours", "nighttime_overtime_hours",
  "sunday_overtime_hours", "night_sunday_overtime_hours",
  "night_surcharge_hours", "sunday_surcharge_hours", "night_sunday_surcharge_hours",
  "clock_in_lat", "clock_in_lng", "clock_out_lat", "clock_out_lng",
  "created_at", "updated_at"
)
SELECT
  "id", "user_id", "date", 'COORDINATOR',
  "clock_in_at", "clock_out_at",
  "order_code", "note",
  "regular_hours", "daytime_overtime_hours", "nighttime_overtime_hours",
  "sunday_overtime_hours", "night_sunday_overtime_hours",
  "night_surcharge_hours", "sunday_surcharge_hours", "night_sunday_surcharge_hours",
  "clock_in_lat", "clock_in_lng", "clock_out_lat", "clock_out_lng",
  "created_at", "updated_at"
FROM "App_turnos"."coordinator_shifts";

-- 4. Migrar report_coordinator_shifts → report_shifts
INSERT INTO "App_turnos"."report_shifts" ("id", "report_id", "shift_id")
SELECT "id", "report_id", "coordinator_shift_id"
FROM "App_turnos"."report_coordinator_shifts";

-- ============================================================
-- Fase 2 (destructiva): eliminar tablas viejas
-- Ejecutar solo después de verificar que el código nuevo funciona
-- ============================================================

DROP TABLE "App_turnos"."report_coordinator_shifts";
DROP TABLE "App_turnos"."coordinator_shifts";

-- ============================================================
-- Índices adicionales
-- ============================================================

-- Índice en clockOutAt para búsquedas de turnos abiertos (fix DB_ANALYSIS)
CREATE INDEX ON "App_turnos"."shifts" ("user_id", "clock_out_at");

-- ============================================================
-- CHECK constraint de integridad por tipo de turno
-- ============================================================

ALTER TABLE "App_turnos"."shifts"
  ADD CONSTRAINT "chk_shift_type_fields" CHECK (
    ("shift_type" = 'TECHNICAL' AND "order_code" IS NULL)
    OR
    ("shift_type" = 'COORDINATOR' AND "start_photo_url" IS NULL AND "end_photo_url" IS NULL)
  );
