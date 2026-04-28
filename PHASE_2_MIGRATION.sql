-- =============================================================
-- Fase 2: Rename físico de la DB de español → inglés (snake_case)
-- =============================================================
--
-- PRECONDICIONES (verificar antes de ejecutar):
--   1. Fase 1 (commit 52ac96e o posterior) ya está deployada en producción
--      y la app funciona normal con @@map / @map.
--   2. Backup automático de Supabase confirmado (Supabase los hace cada día,
--      pero verificar último backup en el dashboard antes de empezar).
--   3. Cron de Vercel /api/cron/jornada-alerta pausado (deshabilitar en
--      vercel.json o desactivar el cron desde el dashboard de Vercel).
--   4. Modo mantenimiento activado (opcional pero recomendado).
--   5. Conteo de filas en Account y Session verificado:
--        SELECT (SELECT count(*) FROM "Account") AS account_count,
--               (SELECT count(*) FROM "Session") AS session_count;
--      Si tienen filas con datos relevantes, NO ejecutar este script
--      hasta haber decidido qué hacer con ellos. Auditoría confirmó que
--      están vacíos / huérfanos.
--
-- EJECUCIÓN:
--   Pegar todo este script en el SQL editor de Supabase y ejecutar.
--   Está envuelto en una transacción — si cualquier paso falla, todo
--   rollback automáticamente y la DB queda intacta.
--
-- POST-EJECUCIÓN:
--   1. Quitar los @@map y @map del prisma/schema.prisma.
--   2. npx prisma generate
--   3. Commit + push + deploy.
--   4. Reactivar cron de Vercel.
--   5. Quitar modo mantenimiento.
--   6. Smoke test en producción.
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. Drop tablas de NextAuth (no usadas, eliminadas del schema en Fase 1)
-- -------------------------------------------------------------
DROP TABLE IF EXISTS "Session" CASCADE;
DROP TABLE IF EXISTS "Account" CASCADE;

-- -------------------------------------------------------------
-- 2. Rename de enum types (los valores se quedan en español)
-- -------------------------------------------------------------
ALTER TYPE "Zona"             RENAME TO "Zone";
ALTER TYPE "Cargo"            RENAME TO "JobTitle";
ALTER TYPE "EstadoAprobacion" RENAME TO "ApprovalStatus";
ALTER TYPE "TipoDia"          RENAME TO "DayType";
-- "Role" se queda como está

-- -------------------------------------------------------------
-- 3. User → users
-- -------------------------------------------------------------
ALTER TABLE "User" RENAME TO users;
ALTER TABLE users RENAME COLUMN "cedula"       TO document_number;
ALTER TABLE users RENAME COLUMN "nombre"       TO full_name;
ALTER TABLE users RENAME COLUMN "zona"         TO zone;
ALTER TABLE users RENAME COLUMN "cargo"        TO job_title;
ALTER TABLE users RENAME COLUMN "filtroEquipo" TO team_filter;
ALTER TABLE users RENAME COLUMN "isActive"     TO is_active;
ALTER TABLE users RENAME COLUMN "fotoUrl"      TO photo_url;
ALTER TABLE users RENAME COLUMN "createdAt"    TO created_at;
ALTER TABLE users RENAME COLUMN "updatedAt"    TO updated_at;

-- -------------------------------------------------------------
-- 4. Turno → shifts
-- -------------------------------------------------------------
ALTER TABLE "Turno" RENAME TO shifts;
ALTER TABLE shifts RENAME COLUMN "userId"                  TO user_id;
ALTER TABLE shifts RENAME COLUMN "fecha"                   TO date;
ALTER TABLE shifts RENAME COLUMN "diaSemana"               TO weekday;
ALTER TABLE shifts RENAME COLUMN "horaEntrada"             TO clock_in_at;
ALTER TABLE shifts RENAME COLUMN "horaSalida"              TO clock_out_at;
ALTER TABLE shifts RENAME COLUMN "latEntrada"              TO clock_in_lat;
ALTER TABLE shifts RENAME COLUMN "lngEntrada"              TO clock_in_lng;
ALTER TABLE shifts RENAME COLUMN "latSalida"               TO clock_out_lat;
ALTER TABLE shifts RENAME COLUMN "lngSalida"               TO clock_out_lng;
ALTER TABLE shifts RENAME COLUMN "startPhotoUrl"           TO start_photo_url;
ALTER TABLE shifts RENAME COLUMN "endPhotoUrl"             TO end_photo_url;
ALTER TABLE shifts RENAME COLUMN "horasOrdinarias"         TO regular_hours;
ALTER TABLE shifts RENAME COLUMN "heDiurna"                TO daytime_overtime_hours;
ALTER TABLE shifts RENAME COLUMN "heNocturna"              TO nighttime_overtime_hours;
ALTER TABLE shifts RENAME COLUMN "heDominical"             TO sunday_overtime_hours;
ALTER TABLE shifts RENAME COLUMN "heNoctDominical"         TO night_sunday_overtime_hours;
ALTER TABLE shifts RENAME COLUMN "recNocturno"             TO night_surcharge_hours;
ALTER TABLE shifts RENAME COLUMN "recDominical"            TO sunday_surcharge_hours;
ALTER TABLE shifts RENAME COLUMN "recNoctDominical"        TO night_sunday_surcharge_hours;
ALTER TABLE shifts RENAME COLUMN "observaciones"           TO notes;
ALTER TABLE shifts RENAME COLUMN "jornadaAlertaPushSentAt" TO workday_alert_sent_at;
ALTER TABLE shifts RENAME COLUMN "createdAt"               TO created_at;
ALTER TABLE shifts RENAME COLUMN "updatedAt"               TO updated_at;

-- -------------------------------------------------------------
-- 5. PushSubscription → push_subscriptions
-- -------------------------------------------------------------
ALTER TABLE "PushSubscription" RENAME TO push_subscriptions;
ALTER TABLE push_subscriptions RENAME COLUMN "userId"    TO user_id;
ALTER TABLE push_subscriptions RENAME COLUMN "createdAt" TO created_at;

-- -------------------------------------------------------------
-- 6. MallaTurno → shift_schedules
-- -------------------------------------------------------------
ALTER TABLE "MallaTurno" RENAME TO shift_schedules;
ALTER TABLE shift_schedules RENAME COLUMN "userId"     TO user_id;
ALTER TABLE shift_schedules RENAME COLUMN "fecha"      TO date;
ALTER TABLE shift_schedules RENAME COLUMN "valor"      TO shift_code;
ALTER TABLE shift_schedules RENAME COLUMN "tipo"       TO day_type;
ALTER TABLE shift_schedules RENAME COLUMN "horaInicio" TO start_time;
ALTER TABLE shift_schedules RENAME COLUMN "horaFin"    TO end_time;
ALTER TABLE shift_schedules RENAME COLUMN "createdAt"  TO created_at;

-- -------------------------------------------------------------
-- 7. Festivo → holidays
-- -------------------------------------------------------------
ALTER TABLE "Festivo" RENAME TO holidays;
ALTER TABLE holidays RENAME COLUMN "fecha"  TO date;
ALTER TABLE holidays RENAME COLUMN "nombre" TO name;

-- -------------------------------------------------------------
-- 8. Disponibilidad → availabilities
-- -------------------------------------------------------------
ALTER TABLE "Disponibilidad" RENAME TO availabilities;
ALTER TABLE availabilities RENAME COLUMN "userId"    TO user_id;
ALTER TABLE availabilities RENAME COLUMN "fecha"     TO date;
ALTER TABLE availabilities RENAME COLUMN "monto"     TO amount;
ALTER TABLE availabilities RENAME COLUMN "createdAt" TO created_at;

-- -------------------------------------------------------------
-- 9. FotoRegistro → trip_records
-- -------------------------------------------------------------
ALTER TABLE "FotoRegistro" RENAME TO trip_records;
ALTER TABLE trip_records RENAME COLUMN "userId"           TO user_id;
ALTER TABLE trip_records RENAME COLUMN "tipo"             TO type;
ALTER TABLE trip_records RENAME COLUMN "driveFileId"      TO drive_file_id;
ALTER TABLE trip_records RENAME COLUMN "driveUrl"         TO drive_url;
ALTER TABLE trip_records RENAME COLUMN "driveFileIdFinal" TO drive_file_id_final;
ALTER TABLE trip_records RENAME COLUMN "driveUrlFinal"    TO drive_url_final;
ALTER TABLE trip_records RENAME COLUMN "base64Fallback"   TO base64_fallback;
ALTER TABLE trip_records RENAME COLUMN "kmInicial"        TO start_km;
ALTER TABLE trip_records RENAME COLUMN "kmFinal"          TO end_km;
ALTER TABLE trip_records RENAME COLUMN "latInicial"       TO start_lat;
ALTER TABLE trip_records RENAME COLUMN "lngInicial"       TO start_lng;
ALTER TABLE trip_records RENAME COLUMN "latFinal"         TO end_lat;
ALTER TABLE trip_records RENAME COLUMN "lngFinal"         TO end_lng;
ALTER TABLE trip_records RENAME COLUMN "observaciones"    TO notes;
ALTER TABLE trip_records RENAME COLUMN "estadoAprobacion" TO approval_status;
ALTER TABLE trip_records RENAME COLUMN "aprobadoPor"      TO approved_by;
ALTER TABLE trip_records RENAME COLUMN "fechaAprobacion"  TO approved_at;
ALTER TABLE trip_records RENAME COLUMN "notaAprobacion"   TO approval_note;
ALTER TABLE trip_records RENAME COLUMN "createdAt"        TO created_at;

-- -------------------------------------------------------------
-- 10. TurnoCoordinador → coordinator_shifts
-- -------------------------------------------------------------
ALTER TABLE "TurnoCoordinador" RENAME TO coordinator_shifts;
ALTER TABLE coordinator_shifts RENAME COLUMN "userId"           TO user_id;
ALTER TABLE coordinator_shifts RENAME COLUMN "fecha"            TO date;
ALTER TABLE coordinator_shifts RENAME COLUMN "horaEntrada"      TO clock_in_at;
ALTER TABLE coordinator_shifts RENAME COLUMN "horaSalida"       TO clock_out_at;
ALTER TABLE coordinator_shifts RENAME COLUMN "codigoOrden"      TO order_code;
ALTER TABLE coordinator_shifts RENAME COLUMN "nota"             TO note;
ALTER TABLE coordinator_shifts RENAME COLUMN "horasOrdinarias"  TO regular_hours;
ALTER TABLE coordinator_shifts RENAME COLUMN "heDiurna"         TO daytime_overtime_hours;
ALTER TABLE coordinator_shifts RENAME COLUMN "heNocturna"       TO nighttime_overtime_hours;
ALTER TABLE coordinator_shifts RENAME COLUMN "heDominical"      TO sunday_overtime_hours;
ALTER TABLE coordinator_shifts RENAME COLUMN "heNoctDominical"  TO night_sunday_overtime_hours;
ALTER TABLE coordinator_shifts RENAME COLUMN "recNocturno"      TO night_surcharge_hours;
ALTER TABLE coordinator_shifts RENAME COLUMN "recDominical"     TO sunday_surcharge_hours;
ALTER TABLE coordinator_shifts RENAME COLUMN "recNoctDominical" TO night_sunday_surcharge_hours;
ALTER TABLE coordinator_shifts RENAME COLUMN "latEntrada"       TO clock_in_lat;
ALTER TABLE coordinator_shifts RENAME COLUMN "lngEntrada"       TO clock_in_lng;
ALTER TABLE coordinator_shifts RENAME COLUMN "latSalida"        TO clock_out_lat;
ALTER TABLE coordinator_shifts RENAME COLUMN "lngSalida"        TO clock_out_lng;
ALTER TABLE coordinator_shifts RENAME COLUMN "createdAt"        TO created_at;
ALTER TABLE coordinator_shifts RENAME COLUMN "updatedAt"        TO updated_at;

-- -------------------------------------------------------------
-- 11. Reporte → reports
-- -------------------------------------------------------------
ALTER TABLE "Reporte" RENAME TO reports;
ALTER TABLE reports RENAME COLUMN "nombre"      TO name;
ALTER TABLE reports RENAME COLUMN "fechaInicio" TO start_date;
ALTER TABLE reports RENAME COLUMN "fechaFin"    TO end_date;
ALTER TABLE reports RENAME COLUMN "creadoPor"   TO created_by;
ALTER TABLE reports RENAME COLUMN "zona"        TO zone;
ALTER TABLE reports RENAME COLUMN "createdAt"   TO created_at;

-- -------------------------------------------------------------
-- 12. ReporteTurno → report_shifts
-- -------------------------------------------------------------
ALTER TABLE "ReporteTurno" RENAME TO report_shifts;
ALTER TABLE report_shifts RENAME COLUMN "reporteId" TO report_id;
ALTER TABLE report_shifts RENAME COLUMN "turnoId"   TO shift_id;

-- -------------------------------------------------------------
-- 13. ReporteForaneo → report_trips
-- -------------------------------------------------------------
ALTER TABLE "ReporteForaneo" RENAME TO report_trips;
ALTER TABLE report_trips RENAME COLUMN "reporteId"      TO report_id;
ALTER TABLE report_trips RENAME COLUMN "fotoRegistroId" TO trip_record_id;

-- -------------------------------------------------------------
-- 14. ReporteDisponibilidad → report_availabilities
-- -------------------------------------------------------------
ALTER TABLE "ReporteDisponibilidad" RENAME TO report_availabilities;
ALTER TABLE report_availabilities RENAME COLUMN "reporteId"    TO report_id;
ALTER TABLE report_availabilities RENAME COLUMN "mallaTurnoId" TO shift_schedule_id;

-- -------------------------------------------------------------
-- 15. ReporteTurnoCoordinador → report_coordinator_shifts
-- -------------------------------------------------------------
ALTER TABLE "ReporteTurnoCoordinador" RENAME TO report_coordinator_shifts;
ALTER TABLE report_coordinator_shifts RENAME COLUMN "reporteId"          TO report_id;
ALTER TABLE report_coordinator_shifts RENAME COLUMN "turnoCoordinadorId" TO coordinator_shift_id;

-- =============================================================
-- Verificación post-rename (opcional, antes del COMMIT)
-- =============================================================
-- Descomentar y revisar manualmente antes de hacer COMMIT:
--
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name NOT IN ('entregas','envios','facturas','gastos_generales',
--                            'gastos_grupos','legalizaciones','sesiones_bot','usuarios',
--                            '_prisma_migrations')
--   ORDER BY table_name;
--
-- Debería listar exactamente:
--   availabilities, coordinator_shifts, holidays, push_subscriptions,
--   report_availabilities, report_coordinator_shifts, report_shifts,
--   report_trips, reports, shift_schedules, shifts, trip_records, users
--
-- Y NO debería incluir: User, Turno, Account, Session, MallaTurno, Festivo,
--   Disponibilidad, FotoRegistro, TurnoCoordinador, Reporte, ReporteTurno,
--   ReporteForaneo, ReporteDisponibilidad, ReporteTurnoCoordinador, PushSubscription.

COMMIT;

-- =============================================================
-- Si necesitas ROLLBACK manual antes del COMMIT:
--   ROLLBACK;
-- =============================================================
