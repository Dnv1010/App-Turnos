export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureWebPushConfigured, webpush } from "@/lib/web-push-config";
import { getAlertaJornadaAt } from "@/lib/jornada-alerta";

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "development") return true;
    return false;
  }
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!ensureWebPushConfigured()) {
    return NextResponse.json({ error: "VAPID no configurado", skipped: true }, { status: 200 });
  }

  const now = new Date();
  const open = await prisma.turno.findMany({
    where: { horaSalida: null, jornadaAlertaPushSentAt: null },
    select: {
      id: true,
      userId: true,
      horaEntrada: true,
    },
  });

  let sent = 0;
  let errors = 0;

  for (const turno of open) {
    const alertAt = getAlertaJornadaAt(turno.horaEntrada);
    if (now < alertAt) continue;

    const subs = await prisma.pushSubscription.findMany({
      where: { userId: turno.userId },
    });
    if (subs.length === 0) {
      await prisma.turno.update({
        where: { id: turno.id },
        data: { jornadaAlertaPushSentAt: now },
      });
      continue;
    }

    const payload = JSON.stringify({
      title: "Turnos BIA — Fin de jornada",
      body: "Faltan 15 minutos para el fin de tu jornada. Abre la app e indica si sigues laborando o cierra turno.",
      url: "/tecnico",
      tag: `jornada-${turno.id}`,
    });

    let anyOk = false;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          payload,
          { TTL: 3600, urgency: "high" }
        );
        anyOk = true;
      } catch (e: unknown) {
        errors += 1;
        const status = typeof e === "object" && e && "statusCode" in e ? (e as { statusCode: number }).statusCode : 0;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        }
        console.error("[cron jornada-alerta] push falló:", e);
      }
    }

    /* No marcar enviado si hubo subs pero todos fallaron (reintenta en el próximo cron) */
    if (anyOk || subs.length === 0) {
      await prisma.turno.update({
        where: { id: turno.id },
        data: { jornadaAlertaPushSentAt: now },
      });
    }
    if (anyOk) sent += 1;
  }

  return NextResponse.json({ ok: true, revisados: open.length, enviados: sent, erroresPush: errors });
}
