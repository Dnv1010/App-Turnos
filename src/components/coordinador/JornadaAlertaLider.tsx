"use client";
import { useEffect, useState } from "react";
import { HiX, HiBell } from "react-icons/hi";

interface AlertaData {
  title: string;
  body: string;
  url?: string;
}

export default function JornadaAlertaLider() {
  const [alerta, setAlerta] = useState<AlertaData | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const channel = new BroadcastChannel("jornada-lider-alert");
    channel.onmessage = (e) => {
      if (e.data?.title) setAlerta(e.data);
    };
    return () => channel.close();
  }, []);

  if (!alerta) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 dark:bg-black/70"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div
        className="bg-white dark:bg-[#1A2340] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border-2 border-blue-400 dark:border-blue-600/80"
        style={{ transform: "translateZ(0)" }}
      >
        <div className="bg-blue-50 dark:bg-blue-950/50 px-4 py-3 border-b border-blue-200 dark:border-blue-800 flex items-center gap-2">
          <HiBell className="h-6 w-6 text-blue-700 dark:text-blue-400" />
          <h3 className="font-bold text-blue-900 dark:text-blue-100">
            {alerta.title}
          </h3>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-base font-medium text-gray-900 dark:text-white">
            {alerta.body}
          </p>
          <button
            type="button"
            className="btn-primary w-full flex items-center justify-center gap-2"
            onClick={() => setAlerta(null)}
          >
            <HiX className="h-5 w-5" />
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
