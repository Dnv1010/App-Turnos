"use client";

import { useState } from "react";
import { HiKey } from "react-icons/hi";
import CambiarPinModal from "@/components/shared/CambiarPinModal";

export default function AdminPage() {
  const [showCambiarPin, setShowCambiarPin] = useState(false);
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Administración</h2>
          <p className="text-sm text-gray-500 dark:text-bia-muted">Usa el menú lateral para acceder a cada sección.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCambiarPin(true)}
          className="btn-secondary flex items-center gap-2 py-2 px-3 text-sm"
        >
          <HiKey className="h-4 w-4" />
          Cambiar PIN
        </button>
      </div>
      <CambiarPinModal open={showCambiarPin} onClose={() => setShowCambiarPin(false)} />
    </div>
  );
}
