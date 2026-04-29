-- Mover tablas y enums de schema public a App_turnos
-- Ejecutado manualmente en Supabase el 2026-04-29

ALTER TYPE "Role" SET SCHEMA "App_turnos";
ALTER TYPE "Zone" SET SCHEMA "App_turnos";
ALTER TYPE "JobTitle" SET SCHEMA "App_turnos";
ALTER TYPE "ApprovalStatus" SET SCHEMA "App_turnos";
ALTER TYPE "DayType" SET SCHEMA "App_turnos";

ALTER TABLE public.users SET SCHEMA "App_turnos";
ALTER TABLE public.shifts SET SCHEMA "App_turnos";
ALTER TABLE public.push_subscriptions SET SCHEMA "App_turnos";
ALTER TABLE public.shift_schedules SET SCHEMA "App_turnos";
ALTER TABLE public.holidays SET SCHEMA "App_turnos";
ALTER TABLE public.availabilities SET SCHEMA "App_turnos";
ALTER TABLE public.trip_records SET SCHEMA "App_turnos";
ALTER TABLE public.reports SET SCHEMA "App_turnos";
ALTER TABLE public.report_shifts SET SCHEMA "App_turnos";
ALTER TABLE public.report_trips SET SCHEMA "App_turnos";
ALTER TABLE public.report_availabilities SET SCHEMA "App_turnos";
ALTER TABLE public.coordinator_shifts SET SCHEMA "App_turnos";
ALTER TABLE public.report_coordinator_shifts SET SCHEMA "App_turnos";

GRANT USAGE ON SCHEMA "App_turnos" TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA "App_turnos" TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA "App_turnos" TO anon, authenticated, service_role;
