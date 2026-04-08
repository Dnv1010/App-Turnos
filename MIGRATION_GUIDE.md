# Guía de Migración a Supabase - Rutas API Restantes

## ✅ Archivos YA Migrados (Ejemplos de Referencia)

1. **`src/app/api/auth/login/route.ts`** - Nueva API de login con PIN
2. **`src/app/api/fotos/route.ts`** - GET y POST migrados
3. **`src/app/api/fotos/[id]/route.ts`** - GET, PATCH y DELETE migrados

## 📋 Patrón de Migración

### ANTES (NextAuth):
```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { uploadToDrive } from "@/lib/drive-upload";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.userId;
  const role = session.user.role;
  const zona = session.user.zona;

  // Usar uploadToDrive para fotos
  const result = await uploadToDrive(base64, fileName);
}
```

### DESPUÉS (Supabase):
```typescript
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { uploadToStorage } from "@/lib/supabase-storage";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const profile = await getUserProfile(user.email!);
  if (!profile) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const userId = profile.id;
  const role = profile.role;
  const zona = profile.zona;

  // Usar uploadToStorage para fotos
  const bucket = "fotos-turnos"; // o "fotos-foraneos"
  const result = await uploadToStorage(base64, fileName, bucket);
}
```

## 🗂️ Lista de 34 Rutas API Pendientes de Migración

### Categoría: Admin

1. **`src/app/api/admin/recalcular/route.ts`**
   - Métodos: POST
   - Requiere: ADMIN o MANAGER

2. **`src/app/api/admin/usuarios/route.ts`**
   - Métodos: GET, POST
   - Requiere: ADMIN

3. **`src/app/api/admin/usuarios/[id]/route.ts`**
   - Métodos: GET, PATCH, DELETE
   - Requiere: ADMIN

### Categoría: Disponibilidad

4. **`src/app/api/disponibilidad-coordinadores/route.ts`**
   - Métodos: GET, POST, DELETE
   - Requiere: MANAGER, ADMIN, COORDINADOR

### Categoría: Festivos

5. **`src/app/api/festivos/route.ts`**
   - Métodos: GET, POST
   - Público (GET), ADMIN (POST)

### Categoría: Foráneos

6. **`src/app/api/foraneos/route.ts`**
   - Métodos: GET
   - Requiere: COORDINADOR, ADMIN, MANAGER

7. **`src/app/api/foraneos/[id]/route.ts`**
   - Métodos: PATCH
   - Requiere: COORDINADOR, ADMIN, MANAGER

8. **`src/app/api/foraneos/batch-aprobar/route.ts`**
   - Métodos: POST
   - Requiere: COORDINADOR, ADMIN, MANAGER

### Categoría: Malla

9. **`src/app/api/malla/route.ts`**
   - Métodos: GET, POST, DELETE
   - Requiere: Usuario autenticado

10. **`src/app/api/malla/batch/route.ts`**
    - Métodos: POST
    - Requiere: Usuario autenticado

11. **`src/app/api/malla/precarga/route.ts`**
    - Métodos: GET
    - Requiere: Usuario autenticado

12. **`src/app/api/malla/verificar-hoy/route.ts`**
    - Métodos: GET
    - Requiere: TECNICO

### Categoría: Push Notifications

13. **`src/app/api/push/send-alerta-jornada/route.ts`**
    - Métodos: POST
    - Requiere: Sistema (cron)

14. **`src/app/api/push/subscribe/route.ts`**
    - Métodos: POST
    - Requiere: Usuario autenticado

### Categoría: Reportes

15. **`src/app/api/reportes/route.ts`**
    - Métodos: GET
    - Requiere: MANAGER, ADMIN, COORDINADOR

16. **`src/app/api/reportes/disponibilidades/route.ts`**
    - Métodos: GET
    - Requiere: MANAGER, ADMIN

17. **`src/app/api/reportes/excel/route.ts`**
    - Métodos: GET
    - Requiere: MANAGER, ADMIN, COORDINADOR

18. **`src/app/api/reportes/foraneos/route.ts`**
    - Métodos: GET
    - Requiere: COORDINADOR, ADMIN, MANAGER

19. **`src/app/api/reportes/guardados/route.ts`**
    - Métodos: GET, POST
    - Requiere: MANAGER, ADMIN

20. **`src/app/api/reportes/guardados/preview/route.ts`**
    - Métodos: POST
    - Requiere: MANAGER, ADMIN

21. **`src/app/api/reportes/guardados/[id]/route.ts`**
    - Métodos: GET, DELETE
    - Requiere: MANAGER, ADMIN

22. **`src/app/api/reportes/guardados/[id]/csv/route.ts`**
    - Métodos: GET
    - Requiere: MANAGER, ADMIN

23. **`src/app/api/reportes/guardados/[id]/excel/route.ts`**
    - Métodos: GET
    - Requiere: MANAGER, ADMIN

### Categoría: Sheets Sync

24. **`src/app/api/sheets/sync/route.ts`**
    - Métodos: POST
    - Requiere: ADMIN

### Categoría: Turnos

25. **`src/app/api/turnos/route.ts`**
    - Métodos: GET, POST
    - Requiere: Usuario autenticado

26. **`src/app/api/turnos/alerta-handled/route.ts`**
    - Métodos: POST
    - Requiere: TECNICO

27. **`src/app/api/turnos/jornada-report/route.ts`**
    - Métodos: GET
    - Requiere: TECNICO

28. **`src/app/api/turnos/sync/route.ts`**
    - Métodos: POST
    - Requiere: ADMIN

29. **`src/app/api/turnos/[id]/route.ts`**
    - Métodos: GET, PATCH, DELETE
    - Requiere: Variable según rol

30. **`src/app/api/turnos/stream-sse/route.ts`**
    - Métodos: GET
    - Requiere: COORDINADOR, ADMIN, MANAGER, SUPPLY

### Categoría: Turnos Coordinador

31. **`src/app/api/turnos-coordinador/route.ts`**
    - Métodos: GET, POST
    - Requiere: Usuario autenticado

32. **`src/app/api/turnos-coordinador/[id]/route.ts`**
    - Métodos: PATCH, DELETE
    - Requiere: COORDINADOR, ADMIN, MANAGER

### Categoría: Usuario

33. **`src/app/api/usuario/cambiar-pin/route.ts`**
    - Métodos: POST
    - Requiere: Usuario autenticado

34. **`src/app/api/usuarios/route.ts`**
    - Métodos: GET
    - Requiere: Usuario autenticado

35. **`src/app/api/usuarios/[id]/route.ts`**
    - Métodos: GET
    - Requiere: Usuario autenticado

## 🔧 Pasos para Migrar Cada Ruta

### 1. Reemplazar imports:
```typescript
// Eliminar
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { uploadToDrive } from "@/lib/drive-upload";

// Agregar
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { uploadToStorage } from "@/lib/supabase-storage";
```

### 2. Reemplazar autenticación en cada handler:
```typescript
// ANTES
const session = await getServerSession(authOptions);
if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

// DESPUÉS
const supabase = await createServerSupabase();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

const profile = await getUserProfile(user.email!);
if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
```

### 3. Reemplazar acceso a datos del usuario:
```typescript
// ANTES
session.user.userId → profile.id
session.user.role → profile.role
session.user.zona → profile.zona
session.user.nombre → profile.nombre

// DESPUÉS
profile.id
profile.role
profile.zona
profile.nombre
```

### 4. Reemplazar upload de fotos (si aplica):
```typescript
// ANTES
const result = await uploadToDrive(base64, fileName);

// DESPUÉS
const bucket = "fotos-turnos"; // o "fotos-foraneos"
const result = await uploadToStorage(base64, fileName, bucket);
```

## ⚙️ Comandos Útiles para Buscar y Reemplazar

```bash
# Buscar todas las rutas que usan getServerSession
grep -r "getServerSession" src/app/api/

# Buscar todas las rutas que usan uploadToDrive
grep -r "uploadToDrive" src/app/api/

# Buscar todas las rutas que usan authOptions
grep -r "authOptions" src/app/api/
```

## ✅ Checklist de Validación por Ruta

- [ ] Imports actualizados
- [ ] Autenticación migrada (getServerSession → Supabase)
- [ ] Acceso a perfil de usuario (session.user → profile)
- [ ] Upload de fotos migrado (si aplica)
- [ ] Verificación de roles funciona
- [ ] Prueba manual exitosa

## 🧪 Testing

Después de migrar cada ruta, probar:

1. **Sin autenticación** → Debe retornar 401
2. **Con usuario correcto** → Debe funcionar
3. **Con rol incorrecto** → Debe retornar 403
4. **Verificar que los datos se guardan correctamente**

## 📝 Notas Importantes

- **NO cambiar la lógica de negocio**, solo la autenticación y storage
- **Mantener nombres de campos** como `driveUrl`, `driveFileId` para compatibilidad
- **Google Sheets se mantiene** sin cambios
- **Prisma queries se mantienen** sin cambios
- Los **buckets de Supabase** ya están creados: `fotos-turnos` y `fotos-foraneos`
