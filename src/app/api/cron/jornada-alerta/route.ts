export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureWebPushConfigured, webpush } from "@/lib/web-push-config";
import { getAlertaJornadaAt, mensajeCuerpoOperador15min, primerNombreOperador } from "@/lib/jornada-alerta";

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
      user: { select: { nombre: true, zona: true } },
    },
  });

  let sent = 0;
  let errors = 0;
  /** Zona → nombres completos de operadores a quienes se envió push con éxito (para un solo aviso al líder por zona) */
  const avisadosPorZona = new Map<string, string[]>();

  for (const turno of open) {
    const alertAt = getAlertaJornadaAt(turno.horaEntrada);
    if (now < alertAt) continue;

    const subs = await prisma.pushSubscription.findMany({
      where: { userId: turno.userId },
    });

    const pn = primerNombreOperador(turno.user.nombre);
    const payload = JSON.stringify({
      title: "⏰ Jornada por finalizar",
      body: mensajeCuerpoOperador15min(pn),
      url: "/tecnico",
      tag: "jornada-alerta",
    });

    if (subs.length === 0) {
      await prisma.turno.update({
        where: { id: turno.id },
        data: { jornadaAlertaPushSentAt: now },
      });
      continue;
    }

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
        console.error("[cron jornada-alerta] push operador falló:", e);
      }
    }

    if (anyOk || subs.length === 0) {
      await prisma.turno.update({
        where: { id: turno.id },
        data: { jornadaAlertaPushSentAt: now },
      });
    }
    if (anyOk) {
      sent += 1;
      const zona = turno.user.zona;
      if (!avisadosPorZona.has(zona)) avisadosPorZona.set(zona, []);
      avisadosPorZona.get(zona)!.push(turno.user.nombre);
    }
  }

  let enviadosLider = 0;
  let erroresLider = 0;

  for (const [zona, nombresRaw] of avisadosPorZona) {
    const nombres = [...new Set(nombresRaw)];
    const lider = await prisma.user.findFirst({
      where: {
        zona,
        role: { in: [Role.COORDINADOR, Role.COORDINADOR_INTERIOR] },
        isActive: true,
      },
      include: { pushSubscriptions: true },
    });

    if (!lider?.pushSubscriptions.length) continue;

    const saludoLider = primerNombreOperador(lider.nombre);
    let bodyLider: string;
    if (nombres.length === 1) {
      bodyLider = `Hola ${saludoLider}, te informamos que el operador ${nombres[0]} acaba de recibir su aviso de 15 minutos para el cierre de su jornada. Ya debería estar pausando actividades y organizando su salida.`;
    } else {
      bodyLider = `Hola ${saludoLider}, te informamos que los siguientes operadores acaban de recibir su aviso de 15 minutos: ${nombres.join(", ")}. Ya deberían estar pausando actividades y organizando su salida.`;
    }

    const payloadLider = JSON.stringify({
      title: `📋 Aviso de cierre — ${nombres.length} operador${nombres.length > 1 ? "es" : ""}`,
      body: bodyLider,
      url: "/coordinador",
      tag: `jornada-alerta-lider-${zona}`,
    });

    let liderOk = false;
    for (const s of lider.pushSubscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          payloadLider,
          { TTL: 3600, urgency: "high" }
        );
        liderOk = true;
      } catch (err: unknown) {
        erroresLider += 1;
        const status = typeof err === "object" && err && "statusCode" in err ? (err as { statusCode: number }).statusCode : 0;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        }
        console.error(`[cron jornada-alerta] push líder ${lider.nombre}:`, err);
      }
    }
    if (liderOk) enviadosLider += 1;
  }

  return NextResponse.json({
    ok: true,
    revisados: open.length,
    enviados: sent,
    erroresPush: errors,
    enviadosLider,
    erroresPushLider: erroresLider,
  });
}
