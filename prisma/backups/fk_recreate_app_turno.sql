-- Backup de FK constraints para schema App_turnos
-- Generado antes de ejecutar ALTER TABLE SET SCHEMA
-- Usar solo si los FK no se movieron automáticamente

ALTER TABLE "App_turnos".availabilities ADD CONSTRAINT "Disponibilidad_userId_fkey" FOREIGN KEY (user_id) REFERENCES "App_turnos".users (id) ON DELETE RESTRICT;
ALTER TABLE "App_turnos".coordinator_shifts ADD CONSTRAINT "TurnoCoordinador_userId_fkey" FOREIGN KEY (user_id) REFERENCES "App_turnos".users (id) ON DELETE RESTRICT;
ALTER TABLE "App_turnos".push_subscriptions ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY (user_id) REFERENCES "App_turnos".users (id) ON DELETE CASCADE;
ALTER TABLE "App_turnos".report_availabilities ADD CONSTRAINT "ReporteDisponibilidad_mallaTurnoId_fkey" FOREIGN KEY (shift_schedule_id) REFERENCES "App_turnos".shift_schedules (id) ON DELETE RESTRICT;
ALTER TABLE "App_turnos".report_availabilities ADD CONSTRAINT "ReporteDisponibilidad_reporteId_fkey" FOREIGN KEY (report_id) REFERENCES "App_turnos".reports (id) ON DELETE CASCADE;
ALTER TABLE "App_turnos".report_coordinator_shifts ADD CONSTRAINT "ReporteTurnoCoordinador_reporteId_fkey" FOREIGN KEY (report_id) REFERENCES "App_turnos".reports (id) ON DELETE CASCADE;
ALTER TABLE "App_turnos".report_coordinator_shifts ADD CONSTRAINT "ReporteTurnoCoordinador_turnoCoordinadorId_fkey" FOREIGN KEY (coordinator_shift_id) REFERENCES "App_turnos".coordinator_shifts (id) ON DELETE CASCADE;
ALTER TABLE "App_turnos".report_shifts ADD CONSTRAINT "ReporteTurno_reporteId_fkey" FOREIGN KEY (report_id) REFERENCES "App_turnos".reports (id) ON DELETE CASCADE;
ALTER TABLE "App_turnos".report_shifts ADD CONSTRAINT "ReporteTurno_turnoId_fkey" FOREIGN KEY (shift_id) REFERENCES "App_turnos".shifts (id) ON DELETE RESTRICT;
ALTER TABLE "App_turnos".report_trips ADD CONSTRAINT "ReporteForaneo_fotoRegistroId_fkey" FOREIGN KEY (trip_record_id) REFERENCES "App_turnos".trip_records (id) ON DELETE RESTRICT;
ALTER TABLE "App_turnos".report_trips ADD CONSTRAINT "ReporteForaneo_reporteId_fkey" FOREIGN KEY (report_id) REFERENCES "App_turnos".reports (id) ON DELETE CASCADE;
ALTER TABLE "App_turnos".reports ADD CONSTRAINT "Reporte_creadoPor_fkey" FOREIGN KEY (created_by) REFERENCES "App_turnos".users (id) ON DELETE RESTRICT;
ALTER TABLE "App_turnos".shift_schedules ADD CONSTRAINT "MallaTurno_userId_fkey" FOREIGN KEY (user_id) REFERENCES "App_turnos".users (id) ON DELETE RESTRICT;
ALTER TABLE "App_turnos".shifts ADD CONSTRAINT "Turno_userId_fkey" FOREIGN KEY (user_id) REFERENCES "App_turnos".users (id) ON DELETE RESTRICT;
ALTER TABLE "App_turnos".trip_records ADD CONSTRAINT "FotoRegistro_userId_fkey" FOREIGN KEY (user_id) REFERENCES "App_turnos".users (id) ON DELETE RESTRICT;
