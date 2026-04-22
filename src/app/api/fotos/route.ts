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
      tipo?: string;
      turnoId?: string;
      observaciones?: string;
      kmInicial?: number;
      kmFinal?: number;
      latInicial?: number;
      lngInicial?: number;
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }

    const { userId, base64Data, tipo, turnoId, observaciones, kmInicial, kmFinal, latInicial, lngInicial } = body ?? {};

    const uid = userId || profile.id;

    // Validación para foráneos
    if (tipo === "FORANEO") {
      const activo = await prisma.fotoRegistro.findFirst({
        where: { userId: uid, tipo: "FORANEO", kmFinal: null },
      });

      if (activo) {
        return NextResponse.json(
          { error: "Ya tienes un foráneo activo. Finalízalo antes de iniciar otro." },
          { status: 400 }
        );
      }

      const latI = latInicial != null ? parseFloat(String(latInicial)) : NaN;
      const lngI = lngInicial != null ? parseFloat(String(lngInicial)) : NaN;

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
        const fileName = `turno_${tipo || "FICHAJE"}_${uid}_${timestamp}.jpg`;

        // Determinar bucket según tipo
        const bucket = tipo === "FORANEO" ? "fotos-foraneos" : "fotos-turnos";

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
    const registro = await prisma.fotoRegistro.create({
      data: {
        userId: uid,
        tipo: tipo || "FICHAJE",
        driveFileId: fileId,  // Mantener nombre de campo por compatibilidad
        driveUrl: fileUrl,    // Mantener nombre de campo por compatibilidad
        base64Fallback,
        observaciones: observaciones || (turnoId ? `Turno: ${turnoId}` : null),
        kmInicial: kmInicial != null ? parseFloat(String(kmInicial)) : null,
        kmFinal: tipo === "FORANEO" ? null : (kmFinal != null ? parseFloat(String(kmFinal)) : null),
        latInicial: latInicial != null ? parseFloat(String(latInicial)) : null,
        lngInicial: lngInicial != null ? parseFloat(String(lngInicial)) : null,
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
    const activo = await prisma.fotoRegistro.findFirst({
      where: { userId, tipo: "FORANEO", kmFinal: null },
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

  const fotos = await prisma.fotoRegistro.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(fotos);
}
