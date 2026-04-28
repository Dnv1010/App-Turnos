"use client";

import { useAuth } from "@/lib/auth-provider";
import { parseResponseJson } from "@/lib/parseFetchJson";
import { useState, useEffect, useCallback } from "react";
import { HiUserAdd, HiPencil, HiTrash, HiX, HiEye, HiEyeOff } from "react-icons/hi";
import { getZonaLabel } from "@/lib/roleLabels";

interface Tecnico {
  id: string;
  documentNumber: string;
  fullName: string;
  email: string;
  role: string;
  zone: string;
  jobTitle?: string;
  isActive: boolean;
}

export default function CoordinadorEquipoPage() {
  const { profile } = useAuth();
  const [list, setList] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"none" | "add" | "edit">("none");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cedula, setCedula] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("1234");
  const [showPin, setShowPin] = useState(false);
  const [cargo, setCargo] = useState<"TECNICO" | "ALMACENISTA">("TECNICO");
  const [filtroCargo, setFiltroCargo] = useState<"TODOS" | "TECNICO" | "ALMACENISTA">("TODOS");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!profile?.zone) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/usuarios?zona=${profile?.zone}&role=TECNICO`);
      const data = await parseResponseJson<{ tecnicos?: Tecnico[] }>(res);
      setList(data?.tecnicos || []);
    } catch { setList([]); }
    finally { setLoading(false); }
  }, [profile?.zone]);

  useEffect(() => { cargar(); }, [cargar]);

  const openAdd = () => {
    setCedula(""); setNombre(""); setEmail(""); setPin("1234");
    setShowPin(false);
    setCargo("TECNICO");
    setEditingId(null); setError(null); setModal("add");
  };

  const openEdit = (t: Tecnico) => {
    setEditingId(t.id); setCedula(t.documentNumber); setNombre(t.fullName); setEmail(t.email); setPin("");
    setShowPin(false);
    setCargo((t.jobTitle as "TECNICO" | "ALMACENISTA") || "TECNICO");
    setError(null); setModal("edit");
  };

  const closeModal = () => { setModal("none"); setEditingId(null); setError(null); };

  const handleCreate = async () => {
    if (!cedula.trim() || !nombre.trim() || !email.trim() || !pin.trim()) {
      setError("Cédula, nombre, email y PIN son obligatorios");
      return;
    }
    setSubmitLoading(true); setError(null);
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentNumber: cedula.trim(),
          fullName: nombre.trim(),
          email: email.trim().toLowerCase(),
          pin,
          jobTitle: cargo,
        }),
      });
      const data = await parseResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data?.error || "Error al crear");
      closeModal();
      cargar();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setSubmitLoading(false); }
  };

  const handleUpdate = async () => {
    if (!editingId || !nombre.trim() || !email.trim()) {
      setError("Nombre y email son obligatorios");
      return;
    }
    setSubmitLoading(true); setError(null);
    try {
      const res = await fetch(`/api/usuarios/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: nombre.trim(),
          email: email.trim().toLowerCase(),
          ...(pin ? { pin } : {}),
          jobTitle: cargo,
        }),
      });
      const data = await parseResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data?.error || "Error al actualizar");
      closeModal();
      cargar();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setSubmitLoading(false); }
  };

  const handleDelete = async (t: Tecnico) => {
    if (!confirm(`¿Desactivar a ${t.fullName}? No podrá iniciar sesión.`)) return;
    try {
      const res = await fetch(`/api/usuarios/${t.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await parseResponseJson<{ error?: string }>(res);
        throw new Error(d?.error || "Error al desactivar");
      }
      cargar();
    } catch (e) { alert(e instanceof Error ? e.message : "Error"); }
  };

  const listFiltrada =
    filtroCargo === "TODOS" ? list : list.filter((t) => (t.jobTitle || "TECNICO") === filtroCargo);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Mi Equipo</h2>
        <p className="text-gray-500 dark:text-[#A0AEC0]">
          Zona {profile?.zone ? getZonaLabel(profile?.zone) : ""}
        </p>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <HiUserAdd className="h-5 w-5" />Agregar operador
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex gap-2 mb-3 px-4 pt-4">
            {(["TODOS", "TECNICO", "ALMACENISTA"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltroCargo(f)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  filtroCargo === f
                    ? "bg-primary-600 text-white border-primary-600"
                    : "border-gray-300 dark:border-[#3A4565] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#243052]"
                }`}
              >
                {f === "TODOS" ? "Todos" : f === "TECNICO" ? "Técnicos" : "Almacenistas"}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200 dark:bg-[#162035] dark:border-[#3A4565]">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-[#CBD5E1]">Cédula</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-[#CBD5E1]">Nombre</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-[#CBD5E1]">Email</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-[#CBD5E1]">Estado</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-[#CBD5E1]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {listFiltrada.map((t) => (
                  <tr key={t.id} className="border-b border-gray-100 dark:border-[#2A3555] hover:bg-gray-50 dark:hover:bg-[#243052]">
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">{t.documentNumber}</td>
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                      {t.fullName}
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded font-medium ml-1 ${
                          (t.jobTitle || "TECNICO") === "ALMACENISTA"
                            ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        }`}
                      >
                        {(t.jobTitle || "TECNICO") === "ALMACENISTA" ? "Almacenista" : "Técnico"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-[#A0AEC0]">{t.email}</td>
                    <td className="py-3 px-4">
                      <span className={t.isActive ? "badge-green" : "badge-blue"}>{t.isActive ? "Activo" : "Inactivo"}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button onClick={() => openEdit(t)} className="text-primary-600 hover:text-primary-800 p-1.5"><HiPencil className="h-4 w-4 inline" /></button>
                      {t.isActive && (
                        <button onClick={() => handleDelete(t)} className="text-red-600 hover:text-red-800 p-1.5 ml-1"><HiTrash className="h-4 w-4 inline" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {listFiltrada.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-[#A0AEC0]">
              {list.length === 0 ? "No hay operadores en tu zona" : "Ningún operador con este filtro"}
            </div>
          )}
        </div>
      )}

      {modal !== "none" && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1A2340] rounded-xl shadow-xl dark:shadow-black/40 max-w-md w-full p-6 border border-gray-200 dark:border-[#3A4565]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{modal === "add" ? "Agregar operador" : "Editar operador"}</h3>
              <button onClick={closeModal} className="text-gray-400 dark:text-[#64748B] hover:text-gray-600 dark:hover:text-white"><HiX className="h-5 w-5" /></button>
            </div>
            {error && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-[#CBD5E1] mb-1">Cédula</label>
                <input type="text" value={cedula} onChange={(e) => setCedula(e.target.value)} className="input-field" placeholder="Ej: 1023891601" disabled={modal === "edit"} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-[#CBD5E1] mb-1">Nombre</label>
                <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className="input-field" placeholder="Nombre completo" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-[#CBD5E1] mb-1">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" placeholder="correo@bia.app" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-[#CBD5E1] mb-1">Cargo</label>
                <select
                  value={cargo}
                  onChange={(e) => setCargo(e.target.value as "TECNICO" | "ALMACENISTA")}
                  className="input-field w-full"
                >
                  <option value="TECNICO">Técnico</option>
                  <option value="ALMACENISTA">Almacenista</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-[#CBD5E1] mb-1">PIN {modal === "edit" && "(dejar vacío para no cambiar)"}</label>
                <div className="relative">
                  <input
                    type={showPin ? "text" : "password"}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="input-field w-full pr-10"
                    placeholder="1234"
                    maxLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPin ? <HiEyeOff className="h-4 w-4" /> : <HiEye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={closeModal} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={modal === "add" ? handleCreate : handleUpdate} disabled={submitLoading} className="btn-primary flex-1">
                {submitLoading ? <span className="animate-pulse">Guardando...</span> : modal === "add" ? "Crear" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
