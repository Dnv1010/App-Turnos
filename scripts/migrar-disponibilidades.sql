-- ============================================================
-- Migración de histórico de disponibilidades → tabla MallaTurno
-- Pegar en Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================
-- Cómo funciona:
--   - Por cada fila de la lista, busca el User por cédula y crea
--     un registro DISPONIBLE en MallaTurno para esa fecha.
--   - Si ya existe un registro (mismo userId + fecha), lo actualiza
--     a DISPONIBLE (es idempotente, puedes correrlo 2 veces sin riesgo).
--   - El valor depende del rol: "Disponible" para coordinadores,
--     "disponible" para técnicos.
--   - Las cédulas que no existen en User se ignoran silenciosamente.
-- ============================================================

DO $$
DECLARE
  v RECORD;
  rec_count INT := 0;
  skip_count INT := 0;
BEGIN
  FOR v IN
    SELECT * FROM (VALUES
      ('1023891601', DATE '2026-04-12'),
      ('1096215786', DATE '2026-04-02'),
      ('1096215786', DATE '2026-04-03'),
      ('1096215786', DATE '2026-04-04'),
      ('1096215786', DATE '2026-04-05'),
      ('1001913368', DATE '2026-03-23'),
      ('1001913368', DATE '2026-04-05'),
      ('1022978634', DATE '2026-04-05'),
      ('1002153663', DATE '2026-03-22'),
      ('1002153663', DATE '2026-03-23'),
      ('1002153663', DATE '2026-04-02'),
      ('1002153663', DATE '2026-04-03'),
      ('1002153663', DATE '2026-04-12'),
      ('1004371043', DATE '2026-03-21'),
      ('1004371043', DATE '2026-03-22'),
      ('1004371043', DATE '2026-03-28'),
      ('1004371043', DATE '2026-03-29'),
      ('1004371043', DATE '2026-04-11'),
      ('1004371043', DATE '2026-04-12'),
      ('1072198167', DATE '2026-04-03'),
      ('1234089967', DATE '2026-03-22'),
      ('1234089967', DATE '2026-04-03'),
      ('1143146472', DATE '2026-04-02'),
      ('72002473',   DATE '2026-03-29'),
      ('72002473',   DATE '2026-04-12'),
      ('1013613004', DATE '2026-03-22'),
      ('1026575433', DATE '2026-03-29'),
      ('1044426009', DATE '2026-03-29'),
      ('1044426009', DATE '2026-04-05'),
      ('79715869',   DATE '2026-03-23'),
      ('1015433156', DATE '2026-04-02')
    ) AS t(cedula, fecha)
  LOOP
    INSERT INTO "MallaTurno" ("id", "userId", "fecha", "valor", "tipo", "createdAt")
    SELECT
      'mig_' || u."id" || '_' || to_char(v.fecha, 'YYYYMMDD'),
      u."id",
      v.fecha,
      CASE
        WHEN u."role" IN ('COORDINADOR', 'COORDINADOR_INTERIOR') THEN 'Disponible'
        ELSE 'disponible'
      END,
      'DISPONIBLE'::"TipoDia",
      NOW()
    FROM "User" u
    WHERE u."cedula" = v.cedula
    ON CONFLICT ("userId", "fecha")
    DO UPDATE SET
      "tipo" = 'DISPONIBLE'::"TipoDia",
      "valor" = EXCLUDED."valor";

    IF FOUND THEN
      rec_count := rec_count + 1;
    ELSE
      skip_count := skip_count + 1;
      RAISE NOTICE 'Cédula no encontrada: %', v.cedula;
    END IF;
  END LOOP;

  RAISE NOTICE 'Migración completada: % insertados/actualizados, % saltados', rec_count, skip_count;
END $$;

-- Verificación: cuenta los DISPONIBLE migrados en el rango
SELECT
  u."nombre",
  u."role",
  u."cedula",
  COUNT(*) AS dias_disponible
FROM "MallaTurno" mt
JOIN "User" u ON u."id" = mt."userId"
WHERE mt."tipo" = 'DISPONIBLE'
  AND mt."fecha" BETWEEN DATE '2026-03-15' AND DATE '2026-04-30'
GROUP BY u."nombre", u."role", u."cedula"
ORDER BY u."nombre";
