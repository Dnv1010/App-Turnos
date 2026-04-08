export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const profile = await getUserProfile(user.email!);
  if (!profile) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  try {
    const { pinActual, pinNuevo } = await req.json();
    if (!pinActual || !pinNuevo) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }
    if (pinNuevo.length < 4) {
      return NextResponse.json({ error: "El PIN debe tener al menos 4 caracteres" }, { status: 400 });
    }
    const dbUser = await prisma.user.findUnique({
      where: { id: profile.id },
      select: { password: true },
    });
    if (!dbUser?.password) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    const valid = await bcrypt.compare(pinActual, dbUser.password);
    if (!valid) {
      return NextResponse.json({ error: "PIN actual incorrecto" }, { status: 400 });
    }
    const hash = await bcrypt.hash(pinNuevo, 12);
    await prisma.user.update({
      where: { id: profile.id },
      data: { password: hash },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error al cambiar PIN" }, { status: 500 });
  }
}
