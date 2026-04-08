export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getUserProfile } from "@/lib/auth-supabase";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureWebPushConfigured, webpush } from "@/lib/web-push-config";
import { mensajeCuerpoOperador15min, primerNombreOperador } from "@/lib/jornada-alerta";

const TITULO = "⏰ Fin de jornada en 15 min";

type Body = { userId?: string };

async function sendPayload(
  subs: { id: string; endpoint: string; p256dh: string; auth: string }[],
  payload: string
): Promise<{ enviados: number; errores: number }> {
  let enviados = 0;
  let errores = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 3600, urgency: "high" }
      );
      enviados += 1;
    } catch (e: unknown) {
      errores += 1;
      const status = typeof e === "object" && e && "statusCode" in e ? (e as { statusCode: number }).statusCode : 0;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      }
      console.error("[send-alerta-jornada] push falló:", e);
    }
  }
  return { enviados, errores };
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const profile = await getUserProfile(user.email!);
  if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  if (profile.role !== "TECNICO") {
    return NextResponse.json({ error: "Solo operadores pueden solicitar este aviso" }, { status: 403 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId || userId !== profile.id) {
    return NextResponse.json({ error: "userId no coincide con la sesión" }, { status: 403 });
  }

  if (!ensureWebPushConfigured()) {
    return NextResponse.json({ error: "VAPID no configurado", ok: false }, { status: 503 });
  }

  const tecnico = await prisma.user.findUnique({
    where: { id: userId },
    select: { nombre: true, zona: true, cargo: true },
  });
  if (!tecnico) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const cuerpo = mensajeCuerpoOperador15min(primerNombreOperador(tecnico.nombre));

  const payloadOperador = JSON.stringify({
    title: TITULO,
    body: cuerpo,
    icon: "/icon-192.png",
    url: "/tecnico",
    tag: "jornada-alerta",
  });

  const payloadLider = JSON.stringify({
    title: "👥 Alerta jornada equipo",
    body: `${primerNombreOperador(tecnico.nombre)} está por completar su jornada (faltan 15 min). Zona: ${tecnico.zona}.`,
    icon: "/icon-192.png",
    url: "/coordinador",
    tag: "jornada-alerta-lider",
  });

  const subsTecnico = await prisma.pushSubscription.findMany({ where: { userId } });

  let totalEnviados = 0;
  let totalErrores = 0;

  const rTec = await sendPayload(subsTecnico, payloadOperador);
  totalEnviados += rTec.enviados;
  totalErrores += rTec.errores;

  /**
   * Prisma no modela `zona` como relación con `lideres`; se obtienen líderes por enum Zona + roles.
   */
  const lideres = await prisma.user.findMany({
    where: {
      zona: tecnico.zona,
      role: { in: [Role.COORDINADOR, Role.COORDINADOR_INTERIOR, Role.SUPPLY] },
      isActive: true,
    },
    select: {
      id: true,
      nombre: true,
      filtroEquipo: true,
      pushSubscriptions: true,
    },
  });

  const tecnicoCargo = tecnico.cargo ?? "TECNICO";

  for (const l of lideres) {
    const filtro = l.filtroEquipo || "TODOS";
    if (filtro !== "TODOS" && filtro !== tecnicoCargo) continue;
    const rL = await sendPayload(l.pushSubscriptions, payloadLider);
    totalEnviados += rL.enviados;
    totalErrores += rL.errores;
  }

  return NextResponse.json({ ok: true, enviados: totalEnviados, erroresPush: totalErrores });
}
