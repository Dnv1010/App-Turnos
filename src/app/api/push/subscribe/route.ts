export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { prisma } from "@/lib/prisma";

type Body = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const profile = await getUserProfile(user.email!);
    if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    const { endpoint, keys } = body;
    const p256dh = keys?.p256dh;
    const auth = keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "endpoint, keys.p256dh y keys.auth requeridos" }, { status: 400 });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId: profile.id,
        endpoint,
        p256dh,
        auth,
      },
      update: {
        userId: profile.id,
        p256dh,
        auth,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/push/subscribe]", e);
    return NextResponse.json({ error: "Error al guardar suscripción" }, { status: 500 });
  }
}

/** Elimina una suscripción (un dispositivo) o todas las del usuario si no mandas endpoint */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const profile = await getUserProfile(user.email!);
    if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    let endpoint: string | undefined;
    try {
      const b = await req.json();
      endpoint = typeof b?.endpoint === "string" ? b.endpoint : undefined;
    } catch {
      /* sin body */
    }

    if (endpoint) {
      await prisma.pushSubscription.deleteMany({
        where: { userId: profile.id, endpoint },
      });
    } else {
      await prisma.pushSubscription.deleteMany({
        where: { userId: profile.id },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/push/subscribe]", e);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
