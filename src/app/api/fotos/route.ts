export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { uploadToStorage } from "@/lib/supabase-storage";

export async function POST(req: NextRequest) {
  try {
    // Autenticación con Supabase
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Obtener perfil del usuario
    const profile = await getUserProfile(user.email!);
    if (!profile) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    let body: {
      userId?: string;
      base64Data?: string;
      type?: string;
      turnoId?: string;
      notes?: string;
      startKm?: number;
      endKm?: number;
      startLat?: number;
      startLng?: number;
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }

    const { userId, base64Data, type, turnoId, notes, startKm, endKm, startLat, startLng } = body ?? {};

    const uid = userId || profile.id;

    // Validación para foráneos
    if (type === "FORANEO") {
      const activo = await prisma.tripRecord.findFirst({
        where: { userId: uid, type: "FORANEO", endKm: null },
      });

      if (activo) {
        return NextResponse.json(
          { error: "Ya tienes un foráneo activo. Finalízalo antes de iniciar otro." },
          { status: 400 }
        );
      }

      const latI = startLat != null ? parseFloat(String(startLat)) : NaN;
      const lngI = startLng != null ? parseFloat(String(startLng)) : NaN;

      if (Number.isNaN(latI) || Number.isNaN(lngI)) {
        return NextResponse.json(
          { error: "Ubicación GPS requerida para iniciar un foráneo (latitud y longitud válidas)." },
          { status: 400 }
        );
      }
    }

    let fileId: string | null = null;
    let fileUrl: string | null = null;
    let base64Fallback: string | null = null;
    let usedFallback = false;

    // Subir foto a Supabase Storage
    if (base64Data) {
      try {
        console.log("[Fotos] base64Data length:", base64Data?.length);
        console.log("[Fotos] base64Data prefix:", base64Data?.substring(0, 30));

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const fileName = `turno_${type || "FICHAJE"}_${uid}_${timestamp}.jpg`;

        // Determinar bucket según tipo
        const bucket = type === "FORANEO" ? "fotos-foraneos" : "fotos-turnos";

        const result = await uploadToStorage(base64Data, fileName, bucket);
        fileId = result.fileId;
        fileUrl = result.webViewLink;
      } catch (error) {
        console.error("[Fotos] Error subiendo a Supabase Storage, guardando fallback en BD:", error);
        usedFallback = true;
        base64Fallback = typeof base64Data === "string"
          ? base64Data.replace(/^data:image\/\w+;base64,/, "")
          : base64Data;
      }
    }

    // Crear registro en BD
    const registro = await prisma.tripRecord.create({
      data: {
        userId: uid,
        type: type || "FICHAJE",
        driveFileId: fileId,  // Mantener nombre de campo por compatibilidad
        driveUrl: fileUrl,    // Mantener nombre de campo por compatibilidad
        base64Fallback,
        notes: notes || (turnoId ? `Turno: ${turnoId}` : null),
        startKm: startKm != null ? parseFloat(String(startKm)) : null,
        endKm: type === "FORANEO" ? null : (endKm != null ? parseFloat(String(endKm)) : null),
        startLat: startLat != null ? parseFloat(String(startLat)) : null,
        startLng: startLng != null ? parseFloat(String(startLng)) : null,
      },
    });

    return NextResponse.json(
      { ...registro, driveUrl: fileUrl, fallback: usedFallback },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al registrar foto";
    console.error("[POST /api/fotos]", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  // Autenticación con Supabase
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Obtener perfil del usuario
  const profile = await getUserProfile(user.email!);
  if (!profile) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") || profile.id;
  const inicio = searchParams.get("inicio");
  const fin = searchParams.get("fin");
  const activoForaneo = searchParams.get("activoForaneo") === "1";

  // Buscar foráneo activo
  if (activoForaneo) {
    const activo = await prisma.tripRecord.findFirst({
      where: { userId, type: "FORANEO", endKm: null },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(activo ?? null);
  }

  // Filtrar por fechas
  const where: { userId: string; createdAt?: { gte?: Date; lte?: Date } } = { userId };
  if (inicio || fin) {
    where.createdAt = {};
    if (inicio) {
      const [y, m, d] = inicio.split("-").map(Number);
      where.createdAt.gte = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    }
    if (fin) {
      const [y, m, d] = fin.split("-").map(Number);
      where.createdAt.lte = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
    }
  }

  const fotos = await prisma.tripRecord.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(fotos);
}
