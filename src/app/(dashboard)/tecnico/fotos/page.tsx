"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import CameraCapture from "@/components/fotos/CameraCapture";
import { HiPhotograph, HiUpload } from "react-icons/hi";

type TipoFoto = "FORANEO" | "GENERAL";

export default function FotosPage() {
  const { data: session } = useSession();
  const [modo, setModo] = useState<"lista" | "captura">("lista");
  const [tipo, setTipo] = useState<TipoFoto>("GENERAL");
  const [kmInicial, setKmInicial] = useState("");
  const [kmFinal, setKmFinal] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [loading, setLoading] = useState(false);
  const [exito, setExito] = useState(false);
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);

  const handleCapture = (base64: string) => { setFotoBase64(base64); };

  const handleSubmit = async () => {
    if (!fotoBase64 || !session?.user?.userId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/fotos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.user.userId, base64Data: fotoBase64, tipo, kmInicial: kmInicial || undefined, kmFinal: kmFinal || undefined, observaciones: observaciones || undefined }),
      });
      if (res.ok) {
        setExito(true); setFotoBase64(null); setKmInicial(""); setKmFinal(""); setObservaciones(""); setModo("lista");
        setTimeout(() => setExito(false), 3000);
      }
    } catch { console.error("Error subiendo foto"); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Fotos</h2>
        {modo === "lista" && (
          <button onClick={() => setModo("captura")} className="btn-primary flex items-center gap-2">
            <HiPhotograph className="h-5 w-5" />Nueva Foto
          </button>
        )}
      </div>
      {exito && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm">Foto registrada exitosamente</div>}
      {modo === "lista" && (
        <div className="card text-center py-12">
          <HiPhotograph className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Toma fotos para registrar visitas foráneas y trabajos en campo</p>
          <button onClick={() => setModo("captura")} className="btn-primary mt-4">Tomar Foto</button>
        </div>
      )}
      {modo === "captura" && !fotoBase64 && <CameraCapture onCapture={handleCapture} onCancel={() => setModo("lista")} />}
      {fotoBase64 && (
        <div className="max-w-lg mx-auto space-y-4">
          <div className="card p-0 overflow-hidden"><img src={fotoBase64} alt="Foto capturada" className="w-full h-auto" /></div>
          <div className="card space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Datos del registro</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de registro</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoFoto)} className="input-field">
                <option value="GENERAL">General</option><option value="FORANEO">Foráneo</option>
              </select>
            </div>
            {tipo === "FORANEO" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Km Inicial</label>
                  <input type="number" value={kmInicial} onChange={(e) => setKmInicial(e.target.value)} className="input-field" placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Km Final</label>
                  <input type="number" value={kmFinal} onChange={(e) => setKmFinal(e.target.value)} className="input-field" placeholder="0" />
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
              <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className="input-field" rows={3} placeholder="Descripción de la visita o trabajo..." />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setFotoBase64(null); setModo("lista"); }} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><HiUpload className="h-5 w-5" />Guardar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
