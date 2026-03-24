"use client";

/* Fechas de turnos en tablas: usar formatFechaTurnoDdMmmYyyy desde @/lib/formatFechaTurno (evita desfase UTC). */
import { useState, useEffect, useCallback } from "react";
import { parseResponseJson } from "@/lib/parseFetchJson";
import DataTable from "@/components/ui/DataTable";
import { HiPlus, HiPencil, HiTrash, HiX, HiRefresh } from "react-icons/hi";
import { getRoleLabel, getZonaLabel } from "@/lib/roleLabels";

interface Usuario {
  id: string;
  cedula: string;
  nombre: string;
  email: string;
  role: string;
  zona: string;
  isActive: boolean;
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [form, setForm] = useState({
    cedula: "",
    nombre: "",
    email: "",
    pin: "",
    role: "TECNICO",
    zona: "BOGOTA",
    isActive: true,
  });
  const [saving, setSaving] = useState(false);
  const [syncingSheets, setSyncingSheets] = useState(false);
  const [recalculando, setRecalculando] = useState(false);

  const cargarUsuarios = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/usuarios");
      if (res.ok) {
        const list = await parseResponseJson<Usuario[]>(res);
        setUsuarios(Array.isArray(list) ? list : []);
      }
    } catch {
      console.error("Error cargando usuarios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarUsuarios();
  }, [cargarUsuarios]);

  const abrirCrear = () => {
    setEditando(null);
    setForm({ cedula: "", nombre: "", email: "", pin: "", role: "TECNICO", zona: "BOGOTA", isActive: true });
    setModal(true);
  };

  const abrirEditar = (u: Usuario) => {
    setEditando(u);
    setForm({
      cedula: u.cedula,
      nombre: u.nombre,
      email: u.email,
      pin: "",
      role: u.role,
      zona: u.zona,
      isActive: u.isActive,
    });
    setModal(true);
  };

  const guardar = async () => {
    setSaving(true);
    try {
      if (editando) {
        const body: Record<string, unknown> = {
          nombre: form.nombre,
          email: form.email,
          cedula: form.cedula,
          role: form.role,
          zona: form.zona,
          isActive: form.isActive,
        };
        if (form.pin.trim() !== "") body.pin = form.pin;
        const res = await fetch(`/api/admin/usuarios/${editando.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          setModal(false);
          cargarUsuarios();
        }
      } else {
        const res = await fetch("/api/admin/usuarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cedula: form.cedula,
            nombre: form.nombre,
            email: form.email,
            pin: form.pin,
            role: form.role,
            zona: form.zona,
            isActive: form.isActive,
          }),
        });
        if (res.ok) {
          setModal(false);
          cargarUsuarios();
        }
      }
    } catch {
      console.error("Error guardando usuario");
    } finally {
      setSaving(false);
    }
  };

  const sincronizarSheets = async () => {
    setSyncingSheets(true);
    try {
      const res = await fetch("/api/sheets/sync", { method: "POST" });
      if (res.ok) alert("Google Sheets sincronizados correctamente.");
      else {
        const err = await parseResponseJson<{ error?: string }>(res);
        alert(err?.error ?? "Error al sincronizar Sheets.");
      }
    } catch {
      alert("Error al sincronizar Sheets.");
    } finally {
      setSyncingSheets(false);
    }
  };

  const recalcularTurnos = async () => {
    if (!confirm("¿Recalcular todos los turnos? Esto puede tardar unos segundos.")) return;
    setRecalculando(true);
    try {
      const res = await fetch("/api/admin/recalcular", { method: "POST" });
      const data = await parseResponseJson<{ actualizados?: number; errores?: number }>(res);
      alert(`Completado: ${data?.actualizados ?? 0} turnos actualizados, ${data?.errores ?? 0} errores`);
    } catch {
      alert("Error al recalcular");
    } finally {
      setRecalculando(false);
    }
  };

  const eliminarUsuario = async (u: Usuario) => {
    if (!confirm(`¿Desactivar al usuario ${u.nombre}? Se marcará como inactivo.`)) return;
    try {
      const res = await fetch(`/api/admin/usuarios/${u.id}`, { method: "DELETE" });
      if (res.ok) cargarUsuarios();
    } catch {
      console.error("Error desactivando usuario");
    }
  };

  const columns = [
    { key: "cedula", label: "Cédula", sortable: true },
    { key: "nombre", label: "Nombre", sortable: true },
    { key: "email", label: "Email", sortable: true },
    {
      key: "role",
      label: "Rol",
      render: (u: Usuario) => {
        const cls: Record<string, string> = {
          ADMIN: "badge-red",
          MANAGER: "badge-purple",
          COORDINADOR: "badge-yellow",
          COORDINADOR_INTERIOR: "badge-yellow",
          TECNICO: "badge-blue",
        };
        return (
          <span className={cls[u.role] || "badge-blue"}>{getRoleLabel(u.role)}</span>
        );
      },
    },
    {
      key: "zona",
      label: "Zona",
      render: (u: Usuario) => (
        <span
          className={
            u.zona === "BOGOTA"
              ? "badge-blue"
              : u.zona === "INTERIOR"
                ? "badge-zona-interior"
                : "badge-green"
          }
        >
          {getZonaLabel(u.zona)}
        </span>
      ),
    },
    {
      key: "isActive",
      label: "Estado",
      render: (u: Usuario) => (
        <span className={u.isActive ? "badge-green" : "badge-red"}>
          {u.isActive ? "Activo" : "Inactivo"}
        </span>
      ),
    },
    {
      key: "acciones",
      label: "Acciones",
      render: (u: Usuario) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              abrirEditar(u);
            }}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-primary-600"
            title="Editar"
          >
            <HiPencil className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              eliminarUsuario(u);
            }}
            className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 hover:text-red-700"
            title="Eliminar (desactivar)"
          >
            <HiTrash className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Gestión de Usuarios
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => void recalcularTurnos()}
            disabled={recalculando}
            className="btn-secondary flex items-center gap-2"
          >
            <HiRefresh className="h-5 w-5" />
            {recalculando ? "Recalculando…" : "Recalcular Turnos"}
          </button>
          <button
            onClick={() => void sincronizarSheets()}
            disabled={syncingSheets}
            className="btn-secondary flex items-center gap-2"
          >
            <HiRefresh className="h-5 w-5" />
            {syncingSheets ? "Sincronizando…" : "Sincronizar Sheets"}
          </button>
          <button
            onClick={abrirCrear}
            className="btn-primary flex items-center gap-2"
          >
            <HiPlus className="h-5 w-5" />
            Nuevo Usuario
          </button>
        </div>
      </div>

      <DataTable
        columns={columns as never}
        data={usuarios as never}
        searchable
        searchPlaceholder="Buscar usuario..."
      />

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editando ? "Editar Usuario" : "Nuevo Usuario"}
              </h3>
              <button
                onClick={() => setModal(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <HiX className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cédula
                </label>
                <input
                  type="text"
                  value={form.cedula}
                  onChange={(e) =>
                    setForm({ ...form, cedula: e.target.value })
                  }
                  className="input-field"
                  required
                  disabled={!!editando}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre completo
                </label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) =>
                    setForm({ ...form, nombre: e.target.value })
                  }
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                  className="input-field"
                  required
                  disabled={!!editando}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PIN (4 dígitos)
                  {editando && " — dejar vacío para no cambiar"}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={form.pin}
                  onChange={(e) =>
                    setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })
                  }
                  className="input-field"
                  maxLength={4}
                  placeholder="••••"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="activo"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm({ ...form, isActive: e.target.checked })
                  }
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="activo" className="text-sm font-medium text-gray-700">
                  Activo
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rol
                  </label>
                  <select
                    value={form.role}
                    onChange={(e) =>
                      setForm({ ...form, role: e.target.value })
                    }
                    className="input-field"
                  >
                    <option value="TECNICO">Operador</option>
                    <option value="COORDINADOR">Líder de Zona</option>
                    <option value="COORDINADOR_INTERIOR">Líder de Zona (Interior)</option>
                    <option value="MANAGER">Manager</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Zona
                  </label>
                  <select
                    value={form.zona}
                    onChange={(e) =>
                      setForm({ ...form, zona: e.target.value })
                    }
                    className="input-field"
                  >
                    <option value="BOGOTA">Bogotá</option>
                    <option value="COSTA">Costa</option>
                    <option value="INTERIOR">Interior</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <button onClick={() => setModal(false)} className="btn-secondary">
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={
                  saving ||
                  !form.nombre ||
                  !form.email ||
                  (!editando && (!form.cedula || form.pin.length !== 4))
                }
                className="btn-primary"
              >
                {saving
                  ? "Guardando..."
                  : editando
                  ? "Actualizar"
                  : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
