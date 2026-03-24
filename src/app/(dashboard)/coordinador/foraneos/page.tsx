"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { parseResponseJson } from "@/lib/parseFetchJson";
import CoordinadorForaneosPanel from "@/components/foraneos/CoordinadorForaneosPanel";

interface TecnicoOption {
  id: string;
  nombre: string;
}

export default function CoordinadorForaneosPage() {
  const { data: session } = useSession();
  const [tecnicos, setTecnicos] = useState<TecnicoOption[]>([]);
  const [inicio, setInicio] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [fin, setFin] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [tecnicoFilter, setTecnicoFilter] = useState("ALL");

  useEffect(() => {
    if (!session?.user) return;
    const url =
      session.user.role === "COORDINADOR"
        ? `/api/usuarios?zona=${session.user.zona}&role=TECNICO`
        : `/api/usuarios?role=TECNICO`;
    fetch(url)
      .then(async (r) => parseResponseJson<{ tecnicos?: TecnicoOption[] }>(r))
      .then((d) => {
        if (d?.tecnicos) setTecnicos(d.tecnicos);
      })
      .catch(() => {});
  }, [session?.user?.role, session?.user?.zona]);

  if (session?.user?.role === "COORDINADOR" && !session?.user?.zona) {
    return <div className="p-6 text-gray-500">Sin zona asignada.</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Foráneos</h2>
      <p className="text-gray-500">
        {session?.user?.role === "COORDINADOR"
          ? `Zona ${session.user.zona} — Registros de foráneos de los técnicos de tu zona.`
          : "Registros foráneos."}
      </p>

      <div className="card">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
            <input
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
            <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Técnico</label>
            <select
              value={tecnicoFilter}
              onChange={(e) => setTecnicoFilter(e.target.value)}
              className="input-field"
            >
              <option value="ALL">Todos</option>
              {tecnicos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end text-sm text-gray-500">
            Ajusta fechas y técnico; usa &quot;Actualizar&quot; en la tabla inferior para recargar datos.
          </div>
        </div>
      </div>

      <CoordinadorForaneosPanel desde={inicio} hasta={fin} tecnicoFilter={tecnicoFilter} />
    </div>
  );
}
