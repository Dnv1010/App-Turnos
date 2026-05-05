-- holidays.name nunca se lee en ninguna query del sistema;
-- solo se usa date para calcular festivos.
ALTER TABLE "App_turnos"."holidays" DROP COLUMN "name";
