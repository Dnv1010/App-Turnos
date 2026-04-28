# Glosario de renombres: DB español → inglés

**Estado: APROBADO ✅** — todas las decisiones congeladas. Fase 1 lista para arrancar.

Convenciones:

- **Modelos Prisma**: PascalCase singular en inglés (ej. `Turno` → `Shift`)
- **Tablas DB**: `snake_case` plural en inglés (ej. `Turno` → `shifts`)
- **Columnas DB**: `snake_case` en inglés (ej. `horaEntrada` → `clock_in_at`)
- **Valores de enum y datos**: NO se cambian — se quedan en español (`TECNICO`, `BOGOTA`, `PENDIENTE`, etc.)
- **Tablas micaja** (`entregas`, `envios`, `facturas`, `gastos_generales`, `gastos_grupos`, `legalizaciones`, `sesiones_bot`, `usuarios`): NO se tocan
- **NextAuth**: se elimina (auditoría confirmó código muerto). `Account`, `Session` se borran del schema y de la DB.

---

## Tablas / Modelos

| Modelo Prisma actual | Modelo Prisma nuevo | Tabla DB nueva |
|----------------------|---------------------|----------------|
| `User` | `User` | `users` |
| `Turno` | `Shift` | `shifts` |
| `MallaTurno` | `ShiftSchedule` | `shift_schedules` |
| `Festivo` | `Holiday` | `holidays` |
| `Disponibilidad` | `Availability` | `availabilities` |
| `FotoRegistro` | `TripRecord` | `trip_records` |
| `TurnoCoordinador` | `CoordinatorShift` | `coordinator_shifts` |
| `Reporte` | `Report` | `reports` |
| `ReporteTurno` | `ReportShift` | `report_shifts` |
| `ReporteForaneo` | `ReportTrip` | `report_trips` |
| `ReporteDisponibilidad` | `ReportAvailability` | `report_availabilities` |
| `ReporteTurnoCoordinador` | `ReportCoordinatorShift` | `report_coordinator_shifts` |
| `PushSubscription` | `PushSubscription` | `push_subscriptions` |
| `Account` | ❌ ELIMINAR | ❌ DROP TABLE |
| `Session` | ❌ ELIMINAR | ❌ DROP TABLE |

---

## Columnas

### `User` → `users`

| Columna actual | Columna nueva |
|----------------|---------------|
| `id` | `id` |
| `cedula` | `document_number` |
| `nombre` | `full_name` |
| `email` | `email` |
| `password` | `password` |
| `role` | `role` |
| `zona` | `zone` |
| `cargo` | `job_title` |
| `filtroEquipo` | `team_filter` |
| `isActive` | `is_active` |
| `fotoUrl` | `photo_url` |
| `createdAt` | `created_at` |
| `updatedAt` | `updated_at` |

### `Turno` → `shifts`

| Columna actual | Columna nueva |
|----------------|---------------|
| `id` | `id` |
| `userId` | `user_id` |
| `fecha` | `date` |
| `diaSemana` | `weekday` |
| `horaEntrada` | `clock_in_at` |
| `horaSalida` | `clock_out_at` |
| `latEntrada` | `clock_in_lat` |
| `lngEntrada` | `clock_in_lng` |
| `latSalida` | `clock_out_lat` |
| `lngSalida` | `clock_out_lng` |
| `startPhotoUrl` | `start_photo_url` |
| `endPhotoUrl` | `end_photo_url` |
| `horasOrdinarias` | `regular_hours` |
| `heDiurna` | `daytime_overtime_hours` |
| `heNocturna` | `nighttime_overtime_hours` |
| `heDominical` | `sunday_overtime_hours` |
| `heNoctDominical` | `night_sunday_overtime_hours` |
| `recNocturno` | `night_surcharge_hours` |
| `recDominical` | `sunday_surcharge_hours` |
| `recNoctDominical` | `night_sunday_surcharge_hours` |
| `observaciones` | `notes` |
| `jornadaAlertaPushSentAt` | `workday_alert_sent_at` |
| `createdAt` | `created_at` |
| `updatedAt` | `updated_at` |

### `MallaTurno` → `shift_schedules`

| Columna actual | Columna nueva |
|----------------|---------------|
| `id` | `id` |
| `userId` | `user_id` |
| `fecha` | `date` |
| `valor` | `shift_code` |
| `tipo` | `day_type` |
| `horaInicio` | `start_time` |
| `horaFin` | `end_time` |
| `createdAt` | `created_at` |

### `Festivo` → `holidays`

| Columna actual | Columna nueva |
|----------------|---------------|
| `id` | `id` |
| `fecha` | `date` |
| `nombre` | `name` |

### `Disponibilidad` → `availabilities`

| Columna actual | Columna nueva |
|----------------|---------------|
| `id` | `id` |
| `userId` | `user_id` |
| `fecha` | `date` |
| `monto` | `amount` |
| `createdAt` | `created_at` |

### `FotoRegistro` → `trip_records`

| Columna actual | Columna nueva |
|----------------|---------------|
| `id` | `id` |
| `userId` | `user_id` |
| `tipo` | `type` |
| `driveFileId` | `drive_file_id` |
| `driveUrl` | `drive_url` |
| `driveFileIdFinal` | `drive_file_id_final` |
| `driveUrlFinal` | `drive_url_final` |
| `base64Fallback` | `base64_fallback` |
| `kmInicial` | `start_km` |
| `kmFinal` | `end_km` |
| `latInicial` | `start_lat` |
| `lngInicial` | `start_lng` |
| `latFinal` | `end_lat` |
| `lngFinal` | `end_lng` |
| `observaciones` | `notes` |
| `estadoAprobacion` | `approval_status` |
| `aprobadoPor` | `approved_by` |
| `fechaAprobacion` | `approved_at` |
| `notaAprobacion` | `approval_note` |
| `createdAt` | `created_at` |

### `TurnoCoordinador` → `coordinator_shifts`

| Columna actual | Columna nueva |
|----------------|---------------|
| `id` | `id` |
| `userId` | `user_id` |
| `fecha` | `date` |
| `horaEntrada` | `clock_in_at` |
| `horaSalida` | `clock_out_at` |
| `codigoOrden` | `order_code` |
| `nota` | `note` |
| `horasOrdinarias` | `regular_hours` |
| `heDiurna` | `daytime_overtime_hours` |
| `heNocturna` | `nighttime_overtime_hours` |
| `heDominical` | `sunday_overtime_hours` |
| `heNoctDominical` | `night_sunday_overtime_hours` |
| `recNocturno` | `night_surcharge_hours` |
| `recDominical` | `sunday_surcharge_hours` |
| `recNoctDominical` | `night_sunday_surcharge_hours` |
| `latEntrada` | `clock_in_lat` |
| `lngEntrada` | `clock_in_lng` |
| `latSalida` | `clock_out_lat` |
| `lngSalida` | `clock_out_lng` |
| `createdAt` | `created_at` |
| `updatedAt` | `updated_at` |

### `Reporte` → `reports`

| Columna actual | Columna nueva |
|----------------|---------------|
| `id` | `id` |
| `nombre` | `name` |
| `fechaInicio` | `start_date` |
| `fechaFin` | `end_date` |
| `creadoPor` | `created_by` |
| `zona` | `zone` |
| `createdAt` | `created_at` |

### `ReporteTurno` → `report_shifts`

| Columna actual | Columna nueva |
|----------------|---------------|
| `id` | `id` |
| `reporteId` | `report_id` |
| `turnoId` | `shift_id` |

### `ReporteForaneo` → `report_trips`

| Columna actual | Columna nueva |
|----------------|---------------|
| `id` | `id` |
| `reporteId` | `report_id` |
| `fotoRegistroId` | `trip_record_id` |

### `ReporteDisponibilidad` → `report_availabilities`

| Columna actual | Columna nueva |
|----------------|---------------|
| `id` | `id` |
| `reporteId` | `report_id` |
| `mallaTurnoId` | `shift_schedule_id` |

### `ReporteTurnoCoordinador` → `report_coordinator_shifts`

| Columna actual | Columna nueva |
|----------------|---------------|
| `id` | `id` |
| `reporteId` | `report_id` |
| `turnoCoordinadorId` | `coordinator_shift_id` |

### `PushSubscription` → `push_subscriptions`

| Columna actual | Columna nueva |
|----------------|---------------|
| `id` | `id` |
| `userId` | `user_id` |
| `endpoint` | `endpoint` |
| `p256dh` | `p256dh` |
| `auth` | `auth` |
| `createdAt` | `created_at` |

---

## Enums

Solo se renombra el **nombre del tipo**. Los **valores** (datos almacenados) no se tocan.

| Enum actual | Enum nuevo | Valores (sin cambio) |
|-------------|------------|----------------------|
| `Role` | `Role` (ya está en inglés) | `TECNICO`, `COORDINADOR`, `COORDINADOR_INTERIOR`, `MANAGER`, `ADMIN`, `SUPPLY`, `PENDIENTE` |
| `Zona` | `Zone` | `BOGOTA`, `COSTA`, `INTERIOR` |
| `Cargo` | `JobTitle` | `TECNICO`, `ALMACENISTA` |
| `EstadoAprobacion` | `ApprovalStatus` | `PENDIENTE`, `APROBADA`, `NO_APROBADA` |
| `TipoDia` | `DayType` | `TRABAJO`, `DESCANSO`, `DISPONIBLE`, `DIA_FAMILIA`, `INCAPACITADO`, `VACACIONES`, `MEDIO_CUMPLE` |

---

## Eliminación de NextAuth

Auditoría confirmó que NextAuth está instalado pero **NO se usa**. La autenticación real va por:
- `/src/app/api/auth/login/route.ts` (login custom con PIN + Supabase Auth)
- `/src/lib/auth-provider.tsx` (Supabase Auth en cliente)

A eliminar en Fase 1:

- **Dependencias** (`package.json`): `next-auth`, `@auth/prisma-adapter`
- **Archivos**:
  - `/src/lib/auth.ts`
  - `/src/app/api/auth/[...nextauth]/route.ts`
- **Modelos Prisma**: `Account`, `Session` (con sus relaciones en `User`)
- **Tablas DB**: `Account`, `Session` se borran (DROP TABLE) en Fase 2

> **Precondición:** Antes de Fase 2, verificar con un `SELECT count(*) FROM "Account"` y `SELECT count(*) FROM "Session"` que están vacías o no tienen datos relevantes.

---

## Índices y constraints

Todos se renombran automáticamente al renombrar tabla/columna. Los **nombres internos de constraints** (ej. `Turno_userId_fecha_idx`) quedan con el viejo nombre — funcional pero feo. En Fase 2 agregamos `ALTER ... RENAME CONSTRAINT` cosmético al final del SQL.
