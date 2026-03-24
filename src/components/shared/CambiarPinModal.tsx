"use client";
import { useState } from "react";
import { HiKey, HiX, HiEye, HiEyeOff } from "react-icons/hi";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CambiarPinModal({ open, onClose }: Props) {
  const [pinActual, setPinActual] = useState("");
  const [pinNuevo, setPinNuevo] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [showActual, setShowActual] = useState(false);
  const [showNuevo, setShowNuevo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const reset = () => {
    setPinActual(""); setPinNuevo(""); setPinConfirm("");
    setErr(null); setOk(false); setLoading(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    setErr(null);
    if (!pinActual || !pinNuevo || !pinConfirm) {
      setErr("Completa todos los campos."); return;
    }
    if (pinNuevo !== pinConfirm) {
      setErr("El PIN nuevo no coincide con la confirmación."); return;
    }
    if (pinNuevo.length < 4) {
      setErr("El PIN debe tener al menos 4 caracteres."); return;
    }
    if (pinNuevo === pinActual) {
      setErr("El PIN nuevo debe ser diferente al actual."); return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/usuario/cambiar-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinActual, pinNuevo }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErr(data.error || "Error al cambiar PIN");
        setLoading(false); return;
      }
      setOk(true);
      setTimeout(() => handleClose(), 2000);
    } catch {
      setErr("Error de red");
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-[#1A2340] rounded-2xl shadow-2xl max-w-sm w-full border border-gray-200 dark:border-[#3A4565]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-[#3A4565]">
          <div className="flex items-center gap-2">
            <HiKey className="h-5 w-5 text-primary-600" />
            <h3 className="font-bold text-gray-900 dark:text-white">Cambiar PIN</h3>
          </div>
          <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
            <HiX className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {ok ? (
            <div className="text-center py-4">
              <p className="text-green-600 dark:text-green-400 font-semibold text-lg">✅ PIN actualizado correctamente</p>
            </div>
          ) : (
            <>
              {/* PIN actual */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">PIN actual</label>
                <div className="relative">
                  <input
                    type={showActual ? "text" : "password"}
                    className="input-field w-full pr-10"
                    placeholder="••••"
                    value={pinActual}
                    onChange={e => setPinActual(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowActual(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showActual ? <HiEyeOff className="h-4 w-4"/> : <HiEye className="h-4 w-4"/>}
                  </button>
                </div>
              </div>

              {/* PIN nuevo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">PIN nuevo</label>
                <div className="relative">
                  <input
                    type={showNuevo ? "text" : "password"}
                    className="input-field w-full pr-10"
                    placeholder="Mínimo 4 caracteres"
                    value={pinNuevo}
                    onChange={e => setPinNuevo(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowNuevo(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showNuevo ? <HiEyeOff className="h-4 w-4"/> : <HiEye className="h-4 w-4"/>}
                  </button>
                </div>
              </div>

              {/* Confirmar PIN */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirmar PIN nuevo</label>
                <input
                  type="password"
                  className="input-field w-full"
                  placeholder="Repite el PIN nuevo"
                  value={pinConfirm}
                  onChange={e => setPinConfirm(e.target.value)}
                />
              </div>

              {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}

              <button
                type="button"
                className="btn-primary w-full"
                disabled={loading}
                onClick={handleSubmit}
              >
                {loading ? "Guardando…" : "Cambiar PIN"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
