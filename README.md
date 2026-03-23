# App Turnos BIA

Sistema de **gestión de turnos laborales, fichajes y horas extras** para **BIA Colombia**.

## Descripción del proyecto

Aplicación web que permite a técnicos, coordinadores, managers y administradores llevar el control de la jornada laboral: registro de entrada y salida (fichaje) con foto y ubicación GPS, carga de fotos de trabajo en campo (incluido registro foráneo con kilometraje), malla de turnos planificados por técnico y fecha, y reportes con cálculo de horas ordinarias y extras (diurna, nocturna, dominical, recargos).

- **Técnicos:** Fichaje de entrada/salida con foto obligatoria y GPS, registro de fotos y kilometraje (foráneo/general), calendario de turnos asignados.
- **Coordinadores:** Gestión de equipo (alta/edición de técnicos de su zona), asignación y edición de turnos, malla de turnos, vista de fichajes.
- **Managers / Admin:** Reportes, gestión de usuarios (todas las zonas/roles), configuración global.

La autenticación es por **email + PIN** (NextAuth con CredentialsProvider); opcionalmente se puede habilitar inicio de sesión con Google. Los datos se almacenan en **PostgreSQL** (Prisma) y las fotos se suben a **Google Drive**.

## Stack

- **Next.js 14** (App Router), **React**, **TypeScript**
- **NextAuth.js** (sesión JWT, credenciales y opcional Google)
- **Prisma** + **PostgreSQL**
- **Tailwind CSS**, **react-icons**, **react-webcam**, **Recharts**
- **Google APIs** (Drive para almacenar fotos)

## Scripts

| Comando        | Uso                          |
|----------------|------------------------------|
| `npm run dev`  | Desarrollo local             |
| `npm run build`| Build para producción        |
| `npm run start`| Servidor de producción       |
| `npm run db:push` | Sincronizar schema Prisma con la BD |
| `npm run db:seed` | Cargar usuarios de ejemplo y festivos |
| `npm run db:studio` | Abrir Prisma Studio (BD)   |

## Variables de entorno

- `DATABASE_URL` — Conexión PostgreSQL  
- `NEXTAUTH_SECRET` — Clave para firmar sesiones (obligatorio)  
- `NEXTAUTH_URL` — URL de la app (en Vercel suele auto-configurarse)  
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Solo si usas login con Google  
- `GOOGLE_DRIVE_FOLDER_ID` — Carpeta de Drive para subir fotos  
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — Web Push (avisos al celular / PWA); generar con `npx web-push generate-vapid-keys`  
- `VAPID_CONTACT_EMAIL` — Contacto VAPID, ej. `soporte@tuempresa.com` o `mailto:soporte@tuempresa.com`  
- `CRON_SECRET` — Secreto para el cron de Vercel que llama a `/api/cron/jornada-alerta` (Bearer token)  

En **Vercel**: Settings → Cron Jobs usa el mismo `CRON_SECRET` en variables de entorno; el job invocará `GET /api/cron/jornada-alerta` cada 5 minutos.

## Estructura de roles

| Rol           | Descripción breve                                      |
|---------------|--------------------------------------------------------|
| **TECNICO**  | Fichaje, fotos, kilometraje, ver sus turnos            |
| **COORDINADOR** | Equipo y turnos de su zona, malla, coordinación     |
| **MANAGER**   | Reportes y visión amplia                               |
| **ADMIN**     | Usuarios, zonas y configuración                       |

---

**BIA Colombia — Sistema de Gestión de Turnos v1.0**
