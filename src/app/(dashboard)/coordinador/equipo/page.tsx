"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import { HiUserAdd, HiPencil, HiTrash, HiX } from "react-icons/hi";

interface Tecnico {
  id: string;
  cedula: string;
  nombre: string;
  email: string;
  role: string;
  zona: string;
  isActive: boolean;
}

export default function CoordinadorEquipoPage() {
  const { data: session } = useSession();
  const [list, setList] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"none" | "add" | "edit">("none");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cedula, setCedula] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("1234");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!session?.user?.zona) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/usuarios?zona=${session.user.zona}&role=TECNICO`);
      const data = await res.json();
      setList(data.tecnicos || []);
    } catch { setList([]); }
    finally { setLoading(false); }
  }, [session?.user?.zona]);

  useEffect(() => { cargar(); }, [cargar]);

  const openAdd = () => {
    setCedula(""); setNombre(""); setEmail(""); setPin("1234");
    setEditingId(null); setError(null); setModal("add");
  };

  const openEdit = (t: Tecnico) => {
    setEditingId(t.id); setCedula(t.cedula); setNombre(t.nombre); setEmail(t.email); setPin("");
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
        body: JSON.stringify({ cedula: cedula.trim(), nombre: nombre.trim(), email: email.trim().toLowerCase(), pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear");
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
        body: JSON.stringify({ nombre: nombre.trim(), email: email.trim().toLowerCase(), ...(pin ? { pin } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al actualizar");
      closeModal();
      cargar();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setSubmitLoading(false); }
  };

  const handleDelete = async (t: Tecnico) => {
    if (!confirm(`¿Desactivar a ${t.nombre}? No podrá iniciar sesión.`)) return;
    try {
      const res = await fetch(`/api/usuarios/${t.id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      cargar();
    } catch (e) { alert(e instanceof Error ? e.message : "Error"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Mi Equipo</h2>
        <p className="text-gray-500">Zona {session?.user?.zona}</p>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <HiUserAdd className="h-5 w-5" />Agregar técnico
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Cédula</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Nombre</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Email</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Estado</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900">{t.cedula}</td>
                    <td className="py-3 px-4 text-sm text-gray-900">{t.nombre}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{t.email}</td>
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
          {list.length === 0 && <div className="text-center py-12 text-gray-500">No hay técnicos en tu zona</div>}
        </div>
      )}

      {modal !== "none" && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{modal === "add" ? "Agregar técnico" : "Editar técnico"}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><HiX className="h-5 w-5" /></button>
            </div>
            {error && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cédula</label>
                <input type="text" value={cedula} onChange={(e) => setCedula(e.target.value)} className="input-field" placeholder="Ej: 1023891601" disabled={modal === "edit"} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className="input-field" placeholder="Nombre completo" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" placeholder="correo@bia.app" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PIN {modal === "edit" && "(dejar vacío para no cambiar)"}</label>
                <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} className="input-field" placeholder="1234" maxLength={6} />
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
