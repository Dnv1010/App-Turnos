-- CreateEnum
CREATE TYPE "EstadoAprobacion" AS ENUM ('PENDIENTE', 'APROBADA', 'NO_APROBADA');

-- AlterTable
ALTER TABLE "FotoRegistro" ADD COLUMN "estadoAprobacion" "EstadoAprobacion" NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN "aprobadoPor" TEXT,
ADD COLUMN "fechaAprobacion" TIMESTAMP(3),
ADD COLUMN "notaAprobacion" TEXT;
