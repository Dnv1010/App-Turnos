"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import KPICards from "@/components/dashboard/KPICards";
import DataTable from "@/components/ui/DataTable";
import BotonFichaje from "@/components/fichaje/BotonFichaje";
import MapaUbicacion from "@/components/fichaje/MapaUbicacion";

interface TurnoRecord {
  id: string;
  fecha: string;
  horaEntrada: string;
  horaSalida: string | null;
  horasOrdinarias: number;
  heDiurna: number;
  heNocturna: number;
  heDominical: number;
  heNoctDominical: number;
  recNocturno: number;
  recDominical: number;
  recNoctDominical: number;
  latEntrada: number | null;
  lngEntrada: number | null;
}

export default function TecnicoDashboard() {
  const { data: session } = useSession();
  const router = useRouter();
  const [turnos, setTurnos] = useState<TurnoRecord[]>([]);
  const [turnoActivo, setTurnoActivo] = useState<{ id: string; horaEntrada: string } | null>(null);
  const [foraneosResumen, setForaneosResumen] = useState<{ totalKm: number; totalPagar: number }>({ totalKm: 0, totalPagar: 0 });
  const [loading, setLoading] = useState(true);
  const ahora = new Date();
  const primerDiaMes = format(startOfMonth(ahora), "yyyy-MM-dd");
  const hoy = format(ahora, "yyyy-MM-dd");
  const [desde, setDesde] = useState(primerDiaMes);
  const [hasta, setHasta] = useState(hoy);

  const cargarDatos = useCallback(async () => {
    if (!session?.user?.userId) return;
    setLoading(true);
    try {
      console.log("[Filtro] desde:", desde, "hasta:", hasta);
      const [turnosRes, foraneosRes] = await Promise.all([
        fetch(`/api/turnos?desde=${desde}&hasta=${hasta}`),
        fetch(`/api/reportes/foraneos?desde=${desde}&hasta=${hasta}&userId=${session.user.userId}`),
      ]);
      const data = await turnosRes.json();
      setTurnos(Array.isArray(data) ? data : []);
      const abierto = (Array.isArray(data) ? data : []).find((t: TurnoRecord) => !t.horaSalida);
      setTurnoActivo(abierto ? { id: abierto.id, horaEntrada: abierto.horaEntrada } : null);

      const foraneosData = await foraneosRes.json();
      const listaForaneos = Array.isArray(foraneosData) ? foraneosData : [];
      const miForaneo = listaForaneos.find((f: { userId: string }) => f.userId === session.user.userId);
      setForaneosResumen(miForaneo ? { totalKm: miForaneo.totalKm ?? 0, totalPagar: miForaneo.totalPagar ?? 0 } : { totalKm: 0, totalPagar: 0 });
    } catch { console.error("Error cargando turnos"); setTurnos([]); setForaneosResumen({ totalKm: 0, totalPagar: 0 }); }
    finally { setLoading(false); }
  }, [session?.user?.userId, desde, hasta]);

  const filtrar = useCallback(async () => {
    if (!session?.user?.userId) return;
    setLoading(true);
    try {
      console.log("[Filtro] desde:", desde, "hasta:", hasta);
      const res = await fetch(`/api/turnos?desde=${desde}&hasta=${hasta}`);
      const data = await res.json();
      setTurnos(Array.isArray(data) ? data : []);
      const abierto = (Array.isArray(data) ? data : []).find((t: TurnoRecord) => !t.horaSalida);
      setTurnoActivo(abierto ? { id: abierto.id, horaEntrada: abierto.horaEntrada } : null);

      const foraneosRes = await fetch(`/api/reportes/foraneos?desde=${desde}&hasta=${hasta}&userId=${session.user.userId}`);
      const foraneosData = await foraneosRes.json();
      const listaForaneos = Array.isArray(foraneosData) ? foraneosData : [];
      const miForaneo = listaForaneos.find((f: { userId: string }) => f.userId === session.user.userId);
      setForaneosResumen(miForaneo ? { totalKm: miForaneo.totalKm ?? 0, totalPagar: miForaneo.totalPagar ?? 0 } : { totalKm: 0, totalPagar: 0 });
    } catch { console.error("Error cargando turnos"); setTurnos([]); setForaneosResumen({ totalKm: 0, totalPagar: 0 }); }
    finally { setLoading(false); }
  }, [session?.user?.userId, desde, hasta]);

  useEffect(() => {
    if (!session) return;
    if (session.user.role !== "TECNICO") {
      if (session.user.role === "COORDINADOR") router.replace("/coordinador");
      else if (["MANAGER", "ADMIN"].includes(session.user.role)) router.replace("/manager");
      return;
    }
    cargarDatos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const totalHE = turnos.reduce((s, t) => s + t.heDiurna + t.heNocturna + t.heDominical + t.heNoctDominical, 0);
  const totalRecargos = turnos.reduce((s, t) => s + t.recNocturno + t.recDominical + t.recNoctDominical, 0);
  const totalOrdinarias = turnos.reduce((s, t) => s + Math.max(0, t.horasOrdinarias), 0);

  const columns = [
    { key: "fecha", label: "Fecha", sortable: true,
      render: (t: TurnoRecord) => format(new Date(t.fecha), "EEE dd MMM", { locale: es }) },
    { key: "horaEntrada", label: "Entrada",
      render: (t: TurnoRecord) => new Date(t.horaEntrada).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }) },
    { key: "horaSalida", label: "Salida",
      render: (t: TurnoRecord) => t.horaSalida ? new Date(t.horaSalida).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }) : "—" },
    { key: "horasOrdinarias", label: "Ord.", sortable: true, render: (t: TurnoRecord) => Math.max(0, t.horasOrdinarias) },
    { key: "heDiurna", label: "HE Día", render: (t: TurnoRecord) => (t.heDiurna > 0 ? t.heDiurna : "—") },
    { key: "heNocturna", label: "HE Noc", render: (t: TurnoRecord) => (t.heNocturna > 0 ? t.heNocturna : "—") },
    { key: "recNocturno", label: "Rec. Noc", render: (t: TurnoRecord) => (t.recNocturno > 0 ? t.recNocturno : "—") },
  ];

  if (loading) {
    return <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
    </div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Mi Dashboard</h2>
          <p className="text-gray-500">Turnos y horas extras</p>
        </div>
      </div>
      <div className="card grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="input-field" />
        </div>
        <div className="sm:col-span-2 flex items-end">
          <button type="button" onClick={() => void filtrar()} disabled={loading} className="btn-primary flex items-center gap-2">
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
            Filtrar período
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <KPICards data={{
            horasOrdinarias: Math.max(0, Math.round(totalOrdinarias * 100) / 100),
            totalHorasExtra: Math.round(totalHE * 100) / 100,
            totalRecargos: Math.round(totalRecargos * 100) / 100,
            heDiurna: Math.round(turnos.reduce((s, t) => s + t.heDiurna, 0) * 100) / 100,
            heNocturna: Math.round(turnos.reduce((s, t) => s + t.heNocturna, 0) * 100) / 100,
            foraneos: foraneosResumen,
          }} />
        </div>
        <div className="flex justify-center">
          <BotonFichaje userId={session?.user?.userId || ""} turnoActivo={turnoActivo} onFichaje={cargarDatos} onTurnoFinalizado={cargarDatos} />
        </div>
      </div>
      {turnoActivo && turnos[0]?.latEntrada && turnos[0]?.lngEntrada && (
        <div className="max-w-md">
          <MapaUbicacion lat={turnos[0].latEntrada} lng={turnos[0].lngEntrada} label="Ubicación de entrada" />
        </div>
      )}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Detalle de turnos</h3>
        <DataTable columns={columns as never} data={turnos.filter((t) => t.horaSalida) as never}
          emptyMessage="No hay turnos registrados este mes" />
      </div>
    </div>
  );
}
