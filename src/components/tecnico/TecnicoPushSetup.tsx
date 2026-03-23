"use client";

import { useState, useCallback } from "react";
import { HiBell, HiCheck } from "react-icons/hi";
import { pushSupported, urlBase64ToUint8Array } from "@/lib/push-client";
import { parseResponseJson } from "@/lib/parseFetchJson";
import { SERVICE_WORKER_SCRIPT } from "@/lib/service-worker-url";

export default function TecnicoPushSetup() {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  const activar = useCallback(async () => {
    setStatus("loading");
    setMsg(null);
    try {
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapid) {
        setMsg("Falta configurar notificaciones en el servidor.");
        setStatus("err");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setMsg("Debes permitir notificaciones en el navegador.");
        setStatus("err");
        return;
      }
      const reg = await navigator.serviceWorker.register(SERVICE_WORKER_SCRIPT, {
        scope: "/",
        updateViaCache: "none",
      });
      await reg.update();
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Suscripción incompleta");
      }
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        }),
      });
      const data = await parseResponseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "No se pudo guardar la suscripción");
      }
      setStatus("ok");
      setMsg("Listo. Recibirás avisos en este dispositivo (PWA o navegador con la app abierta o en segundo plano según el sistema).");
    } catch (e: unknown) {
      setStatus("err");
      setMsg(e instanceof Error ? e.message : "Error al activar avisos");
    }
  }, []);

  if (!pushSupported()) return null;

  if (status === "ok") {
    return (
      <div className="card p-4 border border-green-200 bg-green-50/80 flex items-start gap-3">
        <HiCheck className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-green-900">Avisos push activados</p>
          <p className="text-sm text-green-800 mt-1">{msg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4 border border-blue-200 bg-blue-50/50 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-3 flex-1">
        <HiBell className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-gray-900">Avisos en el celular</p>
          <p className="text-sm text-gray-600 mt-1">
            Activa las notificaciones para recibir el recordatorio 15 min antes del fin de jornada. En <strong>iOS</strong> debes
            añadir la app a la pantalla de inicio (PWA).
          </p>
          {msg && status === "err" && <p className="text-sm text-red-600 mt-2">{msg}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void activar()}
        disabled={status === "loading"}
        className="btn-primary whitespace-nowrap shrink-0"
      >
        {status === "loading" ? "Activando…" : "Activar avisos"}
      </button>
    </div>
  );
}
