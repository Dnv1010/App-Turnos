import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const prisma = new PrismaClient();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const BUCKET_FORANEOS = "fotos-foraneos";
const BUCKET_TURNOS = "fotos-turnos";
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID!;

function getDriveAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });
}

type DriveFile = { id: string; name: string };

async function listarArchivosDrive(): Promise<DriveFile[]> {
  const auth = getDriveAuth();
  const drive = google.drive({ version: "v3", auth });
  const archivos: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name)",
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: "allDrives",
      ...(pageToken ? { pageToken } : {}),
    });
    for (const f of res.data.files ?? []) {
      if (f.id && f.name) archivos.push({ id: f.id, name: f.name });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return archivos;
}

async function descargarArchivoDrive(fileId: string): Promise<Buffer | null> {
  try {
    const auth = getDriveAuth();
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" }
    );
    return Buffer.from(res.data as ArrayBuffer);
  } catch (e) {
    console.warn(`   ⚠️  Error descargando ${fileId}: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

async function subirAStorage(buffer: Buffer, path: string, bucket: string): Promise<string | null> {
  const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType: "image/jpeg",
    cacheControl: "3600",
    upsert: true,
  });
  if (error) {
    console.warn(`   ⚠️  Storage upload ${path}: ${error.message}`);
    return null;
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

function parsearTimestamp(tsRaw: string): Date | null {
  const tsStr = tsRaw.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d+)Z/, "T$1:$2:$3.$4Z");
  const d = new Date(tsStr);
  return isNaN(d.getTime()) ? null : d;
}

function extraerCampos(nombre: string): { oldUserId: string; tipo: string; timestamp: Date } | null {
  const match = nombre.match(/^(?:turno|foraneo)_(ENTRADA|SALIDA|FORANEO|fin|inicio|final|inicial)_([a-z0-9]+)_(\d{4}-\d{2}-\d{2}T[\d-]+Z)\.jpg$/i);
  if (!match) return null;
  const timestamp = parsearTimestamp(match[3]);
  if (!timestamp) return null;
  return { tipo: match[1].toUpperCase(), oldUserId: match[2], timestamp };
}

function fechaDesdets(ts: Date): Date {
  return new Date(`${ts.toISOString().split("T")[0]}T00:00:00.000Z`);
}

// ─── Paso 1: mapeo estático oldUserId → newUserId ───────────────────────────
const OLD_TO_NEW: Record<string, string> = {
  "cmmuuzpld00007ii9uslcidu1": "cmnqht1ae0000iyce3j88jzny",
  "cmmuuzq5200047ii98ofdt5u3": "cmnqht2nz0004iyceuxl49bcv",
  "cmmuuzqa400067ii9ou130a48": "cmnqht3ce0006iycerwt68f9p",
  "cmmuuzqh400097ii9ubf8jt47": "cmnqht4dh0009iyce89clwpvm",
  "cmmuuzqjo000a7ii9k8yirlxu": "cmnqht4pr000aiyce0ecftyd5",
  "cmmuuzqm5000b7ii9rto6qn7f": "cmnqht528000biycexjyr8fo6",
  "cmmuuzqpz000c7ii9mwupl5om": "cmnqht5el000ciyceme6zwmdb",
  "cmmuuzqsc000d7ii9cfxa3kl1": "cmnqht5r0000diycepgrxwlyu",
  "cmmuuzqv4000e7ii9znws6ao9": "cmnqht63j000eiyceta5o66w5",
  "cmmuuzq7e00057ii9z18ry2al": "cmnqht3080005iyce2berobul",
  "cmmuuzqcf00077ii9tp4q8101": "cmnqht3oz0007iyceyzd0otuj",
  "cmmuuzqen00087ii9dgrd23qe": "cmnqht4160008iyce4os9e3vn",
  "cmmuuzq2l00037ii9391pq0xb": "cmnqht2bs0003iyce957zhush",
  "cmmuuzqy6000f7ii91510ta69": "cmnqht6g0000fiyce1yurrbt6",
  "cmmuuzpqw00017ii9j932vf3k": "cmnqht1nc0001iyce14mqoi6t",
};

async function construirMapeo(): Promise<Map<string, { newUserId: string; nombre: string }>> {
  console.log("\n🔗 Construyendo mapeo de usuarios (old → new) desde tabla estática...");
  const mapeo = new Map<string, { newUserId: string; nombre: string }>();

  for (const [oldId, newId] of Object.entries(OLD_TO_NEW)) {
    const user = await prisma.user.findUnique({
      where: { id: newId },
      select: { fullName: true },
    });
    if (!user) {
      console.warn(`   ⚠️  newUserId no encontrado en BD: ${newId}`);
      continue;
    }
    mapeo.set(oldId, { newUserId: newId, nombre: user.fullName });
    console.log(`   ✅ ...${oldId.slice(-8)} → ${user.fullName}`);
  }

  console.log(`   Mapeo construido: ${mapeo.size}/${Object.keys(OLD_TO_NEW).length} usuarios`);
  return mapeo;
}

// ─── Paso 2: migrar fotos de turnos ─────────────────────────────────────────
async function migrarTurnos(archivos: DriveFile[], mapeo: Map<string, { newUserId: string; nombre: string }>) {
  console.log("\n📸 Migrando fotos de Turnos...");
  const archivosTurno = archivos.filter(f =>
    f.name.startsWith("turno_ENTRADA_") || f.name.startsWith("turno_SALIDA_")
  );
  console.log(`   ${archivosTurno.length} archivos de entrada/salida encontrados en Drive`);

  let ok = 0, skip = 0, err = 0;

  for (const archivo of archivosTurno) {
    const c = extraerCampos(archivo.name);
    if (!c) { console.warn(`   ⚠️  Nombre no reconocido: ${archivo.name}`); err++; continue; }

    const mapped = mapeo.get(c.oldUserId);
    if (!mapped) {
      console.warn(`   ⚠️  Sin mapeo para usuario ...${c.oldUserId.slice(-8)}`);
      skip++; continue;
    }

    const fecha = fechaDesdets(c.timestamp);
    const campoDB = c.tipo === "ENTRADA" ? "startPhotoUrl" : "endPhotoUrl";

    const turno = await prisma.shift.findFirst({
      where: { userId: mapped.newUserId, date: fecha },
      select: { id: true, startPhotoUrl: true, endPhotoUrl: true, date: true, user: { select: { fullName: true } } },
    });

    if (!turno) {
      console.warn(`   ⚠️  Sin turno: ${mapped.nombre} ${fecha.toISOString().split("T")[0]}`);
      skip++; continue;
    }

    const urlActual = turno[campoDB as "startPhotoUrl" | "endPhotoUrl"];
    if (urlActual && !urlActual.includes("drive.google.com")) { skip++; continue; }

    const buf = await descargarArchivoDrive(archivo.id);
    if (!buf) { err++; continue; }

    const year = turno.date.getFullYear();
    const storagePath = `${year}/${turno.id}_${c.tipo.toLowerCase()}.jpg`;
    const newUrl = await subirAStorage(buf, storagePath, BUCKET_TURNOS);
    if (!newUrl) { err++; continue; }

    await prisma.shift.update({ where: { id: turno.id }, data: { [campoDB]: newUrl } });
    console.log(`   ✅ ${turno.user.fullName} — ${c.tipo} ${turno.date.toISOString().split("T")[0]}`);
    ok++;
  }
  console.log(`   Turnos: ${ok} ok, ${skip} no encontrados, ${err} errores`);
}

// ─── Paso 3: migrar fotos de foráneos ───────────────────────────────────────
async function migrarForaneos(archivos: DriveFile[], mapeo: Map<string, { newUserId: string; nombre: string }>) {
  console.log("\n📸 Migrando fotos de Foráneos...");
  const archivosForaneo = archivos.filter(f =>
    f.name.startsWith("foraneo_") || f.name.startsWith("turno_FORANEO_")
  );
  console.log(`   ${archivosForaneo.length} archivos de foráneos encontrados en Drive`);

  let ok = 0, skip = 0, err = 0;

  for (const archivo of archivosForaneo) {
    const c = extraerCampos(archivo.name);
    if (!c) { console.warn(`   ⚠️  Nombre no reconocido: ${archivo.name}`); err++; continue; }

    const tipoRaw = c.tipo.toLowerCase();
    const tipo: "INICIAL" | "FINAL" =
      c.tipo === "FORANEO" || tipoRaw === "inicio" || tipoRaw === "inicial" ? "INICIAL" : "FINAL";

    const mapped = mapeo.get(c.oldUserId);
    if (!mapped) {
      console.warn(`   ⚠️  Sin mapeo para usuario ...${c.oldUserId.slice(-8)}`);
      skip++; continue;
    }

    // Buscar FotoRegistro por newUserId + fecha (±1 día por si el trip cruzó medianoche)
    const FORANEO_MARGIN = 24 * 60 * 60 * 1000;
    const registro = await prisma.tripRecord.findFirst({
      where: {
        userId: mapped.newUserId,
        type: "FORANEO",
        createdAt: {
          gte: new Date(c.timestamp.getTime() - FORANEO_MARGIN),
          lte: new Date(c.timestamp.getTime() + FORANEO_MARGIN),
        },
      },
      select: { id: true, driveUrl: true, driveUrlFinal: true, createdAt: true, user: { select: { fullName: true } } },
      orderBy: { createdAt: "asc" },
    });

    if (!registro) {
      console.warn(`   ⚠️  Sin registro: ${mapped.nombre} — ${tipo} ${c.timestamp.toISOString().split("T")[0]}`);
      skip++; continue;
    }

    const urlActual = tipo === "INICIAL" ? registro.driveUrl : registro.driveUrlFinal;
    if (urlActual && !urlActual.includes("drive.google.com")) { skip++; continue; }

    const buf = await descargarArchivoDrive(archivo.id);
    if (!buf) { err++; continue; }

    const year = registro.createdAt.getFullYear();
    const storagePath = `${year}/${registro.id}_${tipo.toLowerCase()}.jpg`;
    const newUrl = await subirAStorage(buf, storagePath, BUCKET_FORANEOS);
    if (!newUrl) { err++; continue; }

    if (tipo === "INICIAL") {
      await prisma.tripRecord.update({ where: { id: registro.id }, data: { driveUrl: newUrl, driveFileId: null } });
    } else {
      await prisma.tripRecord.update({ where: { id: registro.id }, data: { driveUrlFinal: newUrl, driveFileIdFinal: null } });
    }
    console.log(`   ✅ ${registro.user.fullName} — ${tipo} ${c.timestamp.toISOString().split("T")[0]}`);
    ok++;
  }
  console.log(`   Foráneos: ${ok} ok, ${skip} no encontrados, ${err} errores`);
}

async function main() {
  if (!FOLDER_ID) { console.error("❌ GOOGLE_DRIVE_FOLDER_ID no configurado"); process.exit(1); }
  console.log("🚀 Iniciando migración de fotos Drive → Supabase Storage...");
  console.log(`   Carpeta Drive: ${FOLDER_ID}`);

  console.log("\n📂 Listando archivos en Drive...");
  const archivos = await listarArchivosDrive();
  console.log(`   ${archivos.length} archivos encontrados`);
  if (archivos.length > 0) {
    console.log("   Ejemplos:", archivos.slice(0, 3).map(f => f.name).join(", "));
  }

  const mapeo = await construirMapeo();

  await migrarTurnos(archivos, mapeo);
  await migrarForaneos(archivos, mapeo);
  await prisma.$disconnect();
  console.log("\n✅ Migración de fotos completada.");
}

main().catch((e) => {
  console.error(e);
  void prisma.$disconnect();
  process.exit(1);
});
