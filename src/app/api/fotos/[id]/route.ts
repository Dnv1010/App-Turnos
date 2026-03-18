import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { uploadToDrive } from "@/lib/drive-upload";
import { appendRow } from "@/lib/google-sheets";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const registro = await prisma.fotoRegistro.findUnique({ where: { id } });
  if (!registro) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
  if (registro.userId !== session.user.userId) {
    return NextResponse.json({ error: "No puedes editar este registro" }, { status: 403 });
  }
  if (registro.tipo !== "FORANEO") {
    return NextResponse.json({ error: "Solo se pueden editar registros foráneos" }, { status: 400 });
  }
  if (registro.kmFinal != null) {
    return NextResponse.json({ error: "Este foráneo ya está finalizado" }, { status: 400 });
  }

  let body: { kmInicial?: number; kmFinal?: number; observaciones?: string; base64Data?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }
  const { kmInicial, kmFinal, observaciones, base64Data } = body ?? {};

  const data: { kmInicial?: number; kmFinal?: number; observaciones?: string; driveFileIdFinal?: string | null; driveUrlFinal?: string | null } = {};
  if (kmInicial != null) data.kmInicial = parseFloat(String(kmInicial));
  if (kmFinal != null) data.kmFinal = parseFloat(String(kmFinal));
  if (observaciones !== undefined) data.observaciones = observaciones || null;

  if (base64Data) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `foraneo_final_${registro.userId}_${timestamp}.jpg`;
      const result = await uploadToDrive(base64Data, fileName);
      data.driveFileIdFinal = result.fileId;
      data.driveUrlFinal = result.webViewLink;
    } catch (e) {
      console.error("[PATCH /api/fotos] Error subiendo foto final:", e);
      return NextResponse.json({ error: "Error al subir la foto final a Drive" }, { status: 500 });
    }
  }

  const updated = await prisma.fotoRegistro.update({
    where: { id },
    data,
    include: { user: { select: { nombre: true, cedula: true } } },
  });

  if (updated.tipo === "FORANEO" && updated.kmFinal != null && updated.kmInicial != null) {
    const km = updated.kmFinal - updated.kmInicial;
    appendRow("Foraneos", [
      updated.user.nombre,
      updated.user.cedula ?? "",
      new Date(updated.createdAt).toISOString().split("T")[0],
      1,
      km,
      Math.round(km * 1100),
    ]).catch(console.error);
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const registro = await prisma.fotoRegistro.findUnique({ where: { id } });
  if (!registro) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
  if (registro.userId !== session.user.userId) {
    return NextResponse.json({ error: "No puedes eliminar este registro" }, { status: 403 });
  }

  await prisma.fotoRegistro.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
