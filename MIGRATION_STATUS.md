# Estado de Migración a Supabase - App Turnos BIA

**Fecha**: Abril 7, 2026
**Estado General**: 🟡 En Progreso (70% completado)

---

## ✅ COMPLETADO

### 1. Configuración Base de Supabase

- ✅ Proyecto Supabase creado
- ✅ Buckets de Storage creados:
  - `fotos-turnos` (público)
  - `fotos-foraneos` (público)
- ✅ Credenciales obtenidas (URL, anon key, service_role key)

### 2. Dependencias y Configuración

- ✅ Instaladas: `@supabase/supabase-js`, `@supabase/ssr`
- ✅ Prisma schema actualizado con `directUrl`
- ✅ Variables de entorno documentadas en `.env.example`
- ✅ Archivo `.env` creado (falta password de BD)

### 3. Módulos Base Creados

- ✅ `src/lib/supabase.ts` - Cliente admin y browser
- ✅ `src/lib/supabase-server.ts` - Cliente servidor con cookies
- ✅ `src/lib/supabase-storage.ts` - Reemplazo de Google Drive
- ✅ `src/lib/auth-supabase.ts` - Helper autenticación PIN + getUserProfile
- ✅ `src/middleware.ts` - Protección de rutas con Supabase Auth

### 4. Autenticación Actualizada

- ✅ `src/lib/auth-provider.tsx` - Nuevo provider con Supabase (useAuth hook)
- ✅ `src/app/login/page.tsx` - Login actualizado (PIN + Google OAuth)
- ✅ `src/app/api/auth/login/route.ts` - Nueva API de login con PIN
- ✅ `src/app/auth/callback/page.tsx` - Callback para OAuth

### 5. Layouts Actualizados

- ✅ `src/app/layout.tsx` - AuthProvider ya configurado
- ✅ `src/app/(dashboard)/layout.tsx` - Migrado a useAuth()

### 6. Rutas API Migradas (Ejemplos)

- ✅ `src/app/api/fotos/route.ts` - GET y POST migrados
- ✅ `src/app/api/fotos/[id]/route.ts` - GET, PATCH y DELETE migrados

### 7. Documentación

- ✅ `MIGRATION_GUIDE.md` - Guía completa con patrón de migración
- ✅ `MIGRATION_STATUS.md` - Este archivo

---

## ⏳ PENDIENTE

### 1. Configuración Supabase Dashboard (Requiere Owner)

- ⏳ **Resetear password de base de datos**
  - Ir a: Project Settings → Database → Reset password
  - Guardar password y compartirla

- ⏳ **Configurar Redirect URLs**
  - Ir a: Authentication → URL Configuration
  - Site URL: `http://localhost:3000`
  - Redirect URLs:
    - `http://localhost:3000/auth/callback`
    - `http://localhost:3000`

### 2. Variables de Entorno Locales

- ⏳ **Actualizar `.env` con password**:
  ```env
  DATABASE_URL="postgresql://postgres:TU_PASSWORD@db.cjxfibdtlhbazobthywm.supabase.co:6543/postgres"
  DIRECT_URL="postgresql://postgres:TU_PASSWORD@db.cjxfibdtlhbazobthywm.supabase.co:5432/postgres"
  ```

### 3. Migraciones y Datos

- ⏳ **Ejecutar migraciones Prisma a Supabase**:
  ```bash
  npx prisma generate
  npx prisma db push
  ```

- ⏳ **Migrar datos existentes** (opcional - si hay datos en producción):
  - Crear script de migración de usuarios
  - Migrar fotos de Google Drive a Supabase Storage

### 4. Rutas API Restantes (34 rutas)

Ver `MIGRATION_GUIDE.md` para el listado completo y patrón de migración.

**Categorías pendientes**:
- Admin (3 rutas)
- Disponibilidad (1 ruta)
- Festivos (1 ruta)
- Foráneos (3 rutas)
- Malla (4 rutas)
- Push (2 rutas)
- Reportes (9 rutas)
- Sheets Sync (1 ruta)
- Turnos (6 rutas)
- Turnos Coordinador (2 rutas)
- Usuario (3 rutas)

**Patrón de migración**:
1. Reemplazar `getServerSession` → `createServerSupabase` + `getUserProfile`
2. Reemplazar `uploadToDrive` → `uploadToStorage` (si aplica)
3. Acceso a datos: `session.user.X` → `profile.X`

### 5. Componentes Cliente (Estimados ~18 componentes)

Componentes que usan `useSession()` de next-auth deben migrar a `useAuth()`:

- Páginas de dashboard (tecnico, coordinador, admin, manager, supply)
- Componentes específicos que acceden a la sesión

**Patrón de migración**:
```typescript
// ANTES
import { useSession } from "next-auth/react";
const { data: session } = useSession();
const userId = session?.user.userId;

// DESPUÉS
import { useAuth } from "@/lib/auth-provider";
const { profile } = useAuth();
const userId = profile?.id;
```

---

## 🎯 PASOS SIGUIENTES (En Orden)

### Paso 1: Configuración Pendiente (Requiere Owner) ⏰ Crítico

1. Pedir al Owner del proyecto:
   - Resetear password de BD y compartirla
   - Configurar Redirect URLs en Authentication

### Paso 2: Actualizar `.env` Local

2. Una vez tengas el password:
   - Actualizar `DATABASE_URL` y `DIRECT_URL`
   - Guardar el archivo

### Paso 3: Migrar Base de Datos

3. Ejecutar migraciones:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

### Paso 4: Probar Login

4. Iniciar servidor de desarrollo:
   ```bash
   npm run dev
   ```

5. Probar login en `http://localhost:3000/login`:
   - Con un usuario existente (email + PIN)
   - Verificar que redirecciona correctamente

### Paso 5: Migrar Rutas API (Gradual)

6. Migrar las 34 rutas API restantes:
   - Empezar con las más críticas (turnos, usuarios)
   - Seguir patrón de `MIGRATION_GUIDE.md`
   - Probar cada ruta después de migrarla

### Paso 6: Migrar Componentes Cliente

7. Actualizar componentes que usan `useSession()`:
   - Buscar con: `grep -r "useSession" src/`
   - Reemplazar por `useAuth()`

### Paso 7: Migrar Datos de Producción (Si aplica)

8. Si hay datos existentes:
   - Crear script de migración
   - Migrar usuarios
   - Migrar fotos de Drive a Supabase Storage
   - Actualizar referencias en BD

### Paso 8: Testing Completo

9. Probar todos los flujos:
   - Login/Logout
   - Creación de turnos
   - Upload de fotos
   - Reportes
   - Permisos por rol

### Paso 9: Deploy

10. Configurar variables en Vercel:
    - Agregar todas las variables de Supabase
    - Actualizar Redirect URLs en Supabase para producción

---

## 🚨 Problemas Conocidos

### 1. Permisos de Developer en Supabase

**Problema**: Usuario tiene rol "Developer" y no puede:
- Resetear password de BD
- Configurar Redirect URLs

**Solución**: Pedir al Owner del proyecto que haga estas configuraciones.

### 2. Password de BD No Disponible

**Estado**: Pendiente de reset por Owner

**Impacto**: No se pueden ejecutar migraciones ni probar la aplicación hasta tenerlo.

---

## 📊 Estadísticas de Migración

| Categoría | Completado | Pendiente | Total |
|-----------|------------|-----------|-------|
| Módulos Base | 5 | 0 | 5 |
| Autenticación | 4 | 0 | 4 |
| Layouts | 2 | 0 | 2 |
| Rutas API | 2 | 34 | 36 |
| Componentes | 0 | ~18 | ~18 |
| Configuración | 3 | 2 | 5 |
| **TOTAL** | **16** | **~54** | **~70** |

**Progreso**: ~23% completado

---

## 📞 Contacto Owner

Para completar la migración, necesitas que el Owner del proyecto Supabase:

1. Resetee el password de la base de datos
2. Configure las Redirect URLs en Authentication
3. Te comparta el password de forma segura

Una vez tengas el password, podrás continuar con los pasos 2-9.

---

## 🔗 Referencias

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Supabase Storage Docs](https://supabase.com/docs/guides/storage)
- [Prisma with Supabase](https://supabase.com/docs/guides/integrations/prisma)

---

**Última actualización**: 2026-04-07
