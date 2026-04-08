"use client";

import { useAuth } from "@/lib/auth-provider";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { useTurnosStream } from "@/hooks/useTurnosStream";
import { parseResponseJson } from "@/lib/parseFetchJson";
import KPICards from "@/components/dashboard/KPICards";
import DataTable from "@/components/ui/DataTable";
import BotonFichaje from "@/components/fichaje/BotonFichaje";
import MapaUbicacion from "@/components/fichaje/MapaUbicacion";
import TecnicoPushSetup from "@/components/tecnico/TecnicoPushSetup";
import JornadaAlertaFlow from "@/components/tecnico/JornadaAlertaFlow";
import type { ForaneoRow } from "@/components/foraneos/CoordinadorForaneosPanel";

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
  const { profile } = useAuth();
  const router = useRouter();
  const [modalTurno, setModalTurno] = useState(null);
  const [turnos, setTurnos] = useState<TurnoRecord[]>([]);
  const [turnoActivo, setTurnoActivo] = useState<{
    id: string;
    horaEntrada: string;
    userId: string;
  } | null>(null);
  const [foraneosResumen, setForaneosResumen] = useState<{ totalKm: number; totalPagar: number }>({ totalKm: 0, totalPagar: 0 });
  const [bloqueoMalla, setBloqueoMalla] = useState<{ estado: string; fecha: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const ahora = new Date();
  const primerDiaMes = format(startOfMonth(ahora), "yyyy-MM-dd");
  const hoy = format(ahora, "yyyy-MM-dd");
  const [desde, setDesde] = useState(primerDiaMes);
  const [hasta, setHasta] = useState(hoy);
  const [foraneosRows, setForaneosRows] = useState<ForaneoRow[]>([]);
  const [estadoFiltroForaneo, setEstadoFiltroForaneo] = useState<string>("TODOS");
  const [loadingForaneosLista, setLoadingForaneosLista] = useState(false);

  useTurnosStream(
    (data) => {
      setTurnos((prev) => prev.filter((t) => t.id !== data.id));
    },
    (data) => {
      cargarDatos();
    },
    (data) => {
      cargarDatos();
    }
  );

  const cargarForaneosLista = useCallback(async () => {
    if (!profile?.id) return;
    setLoadingForaneosLista(true);
    try {
      const params = new URLSearchParams({ desde, hasta });
      if (estadoFiltroForaneo !== "ALL" && estadoFiltroForaneo !== "TODOS") {
        params.set("estado", estadoFiltroForaneo);
      }
      const res = await fetch(`/api/foraneos?${params}`);
      const raw = await parseResponseJson<ForaneoRow[]>(res);
      setForaneosRows(res.ok && Array.isArray(raw) ? raw : []);
    } catch {
      setForaneosRows([]);
    } finally {
      setLoadingForaneosLista(false);
    }
  }, [profile?.id, desde, hasta, estadoFiltroForaneo]);

  const cargarDatos = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const [turnosRes, foraneosRes] = await Promise.all([
        fetch(`/api/turnos?desde=${desde}&hasta=${hasta}`),
        fetch(`/api/reportes/foraneos?desde=${desde}&hasta=${hasta}&userId=${profile?.id}`),
      ]);
      const data = await parseResponseJson<TurnoRecord[]>(turnosRes);
      const list = Array.isArray(data) ? data : [];
      setTurnos(list);
      const abierto = list.find((t) => !t.horaSalida);
      setTurnoActivo(
        abierto
          ? { id: abierto.id, horaEntrada: abierto.horaEntrada, userId: profile?.id }
          : null
      );
      const foraneosData = await parseResponseJson<unknown[]>(foraneosRes);
      const listaForaneos = Array.isArray(foraneosData) ? foraneosData : [];
      const miForaneo = listaForaneos.find((f: { userId: string }) => f.userId === profile?.id);
      setForaneosResumen(miForaneo ? { totalKm: miForaneo.totalKm ?? 0, totalPagar: miForaneo.totalPagar ?? 0 } : { totalKm: 0, totalPagar: 0 });

      // Verificar si hoy está bloqueado por malla
      try {
        const mallaRes = await fetch("/api/malla/verificar-hoy");
        if (mallaRes.ok) {
          const mallaData = await parseResponseJson<{ bloqueado: boolean; estado?: string; fecha?: string }>(mallaRes);
          if (mallaData?.bloqueado) {
            setBloqueoMalla({ estado: mallaData.estado ?? "", fecha: mallaData.fecha ?? "" });
          } else {
            setBloqueoMalla(null);
          }
        }
      } catch {
        /* ignorar si falla */
      }
    } catch {
      setTurnos([]);
      setForaneosResumen({ totalKm: 0, totalPagar: 0 });
    } finally {
      setLoading(false);
    }
    void cargarForaneosLista();
  }, [profile?.id, desde, hasta, cargarForaneosLista]);

  useEffect(() => {
    if (profile?.role !== "TECNICO") return;
    void cargarForaneosLista();
  }, [profile?.role, cargarForaneosLista]);

  const filtrar = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/turnos?desde=${desde}&hasta=${hasta}`);
      const data = await parseResponseJson<TurnoRecord[]>(res);
      const list = Array.isArray(data) ? data : [];
      setTurnos(list);
      const abierto = list.find((t) => !t.horaSalida);
      setTurnoActivo(
        abierto
          ? { id: abierto.id, horaEntrada: abierto.horaEntrada, userId: profile?.id }
          : null
      );
      const foraneosRes = await fetch(`/api/reportes/foraneos?desde=${desde}&hasta=${hasta}&userId=${profile?.id}`);
      const foraneosData = await parseResponseJson<unknown[]>(foraneosRes);
      const listaForaneos = Array.isArray(foraneosData) ? foraneosData : [];
      const miForaneo = listaForaneos.find((f: { userId: string }) => f.userId === profile?.id);
      setForaneosResumen(miForaneo ? { totalKm: miForaneo.totalKm ?? 0, totalPagar: miForaneo.totalPagar ?? 0 } : { totalKm: 0, totalPagar: 0 });
    } catch {
      setTurnos([]);
      setForaneosResumen({ totalKm: 0, totalPagar: 0 });
    } finally {
      setLoading(false);
    }
    void cargarForaneosLista();
  }, [profile?.id, desde, hasta, cargarForaneosLista]);

  useEffect(() => {
    if (!profile) return;
    if (profile.role !== "TECNICO") {
      if (profile.role === "COORDINADOR") router.replace("/coordinador");
      else if (["MANAGER", "ADMIN"].includes(profile.role)) router.replace("/manager");
      return;
    }
    cargarDatos();
  }, [profile, router, cargarDatos]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        cargarDatos();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [cargarDatos]);

  const totalHE = turnos.reduce((s, t) => s + t.heDiurna + t.heNocturna + t.heDominical + t.heNoctDominical, 0);
  const totalRecargos = turnos.reduce((s, t) => s + t.recNocturno + t.recDominical + t.recNoctDominical, 0);
  const totalOrdinarias = turnos.reduce((s, t) => s + Math.max(0, t.horasOrdinarias), 0);

  const columns = [
    { key: "fecha", label: "Fecha", sortable: true, render: (t: TurnoRecord) => { const fechaStr = t.fecha.split("T")[0]; const [y, m, d] = fechaStr.split("-").map(Number); return format(new Date(y, m - 1, d), "EEE dd MMM", { locale: es }); } },
    { key: "horaEntrada", label: "Entrada", render: (t: TurnoRecord) => new Date(t.horaEntrada).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }) },
    { key: "horaSalida", label: "Salida", render: (t: TurnoRecord) => t.horaSalida ? new Date(t.horaSalida).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }) : "—" },
    { key: "horasOrdinarias", label: "Ord.", sortable: true, render: (t: TurnoRecord) => Math.max(0, t.horasOrdinarias) },
    { key: "heDiurna", label: "HE Día", render: (t: TurnoRecord) => t.heDiurna > 0 ? t.heDiurna : "—" },
    { key: "heNocturna", label: "HE Noc", render: (t: TurnoRecord) => t.heNocturna > 0 ? t.heNocturna : "—" },
    { key: "heDominical", label: "HE Dom/Fest Día", render: (t: TurnoRecord) => t.heDominical > 0 ? t.heDominical : "—" },
    { key: "heNoctDominical", label: "HE Dom/Fest Noc", render: (t: TurnoRecord) => t.heNoctDominical > 0 ? t.heNoctDominical : "—" },
    { key: "recNocturno", label: "Rec. Noc", render: (t: TurnoRecord) => t.recNocturno > 0 ? t.recNocturno : "—" },
    { key: "recDominical", label: "Rec Dom/Fest Día", render: (t: TurnoRecord) => t.recDominical > 0 ? t.recDominical : "—" },
    { key: "recNoctDominical", label: "Rec Dom/Fest Noc", render: (t: TurnoRecord) => t.recNoctDominical > 0 ? t.recNoctDominical : "—" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Mi Dashboard</h2>
          <p className="text-sm text-gray-500 dark:text-[#A0AEC0]">Turnos y horas extras</p>
        </div>
      </div>
      <div className="card p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-[#CBD5E1] mb-1">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-[#CBD5E1] mb-1">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="input-field" />
        </div>
        <div className="sm:col-span-2 flex items-end">
          <button type="button" onClick={() => void filtrar()} disabled={loading} className="btn-primary flex items-center gap-2">
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
            Filtrar período
          </button>
        </div>
      </div>
      <TecnicoPushSetup />
      {bloqueoMalla && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-600 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">⚠️</span>
          <div>
            <h3 className="font-bold text-amber-900 dark:text-amber-100">Hoy estás en &quot;{bloqueoMalla.estado}&quot;</h3>
            <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
              Según la malla de turnos, el día {bloqueoMalla.fecha} no tienes jornada laboral asignada. Si esto es un error,
              comunícale la novedad a tu coordinador.
            </p>
          </div>
        </div>
      )}
      <JornadaAlertaFlow
        turnoActivo={turnoActivo}
        operadorNombre={profile?.nombre ?? ""}
        onAfterReport={cargarDatos}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 order-2 lg:order-1">
          <KPICards data={{
            horasOrdinarias: Math.max(0, Math.round(totalOrdinarias * 100) / 100),
            totalHorasExtra: Math.round(totalHE * 100) / 100,
            totalRecargos: Math.round(totalRecargos * 100) / 100,
            heDiurna: Math.round(turnos.reduce((s, t) => s + t.heDiurna, 0) * 100) / 100,
            heNocturna: Math.round(turnos.reduce((s, t) => s + t.heNocturna, 0) * 100) / 100,
            foraneos: foraneosResumen,
          }} />
        </div>
        <div id="bloque-fichaje" className="flex justify-center order-1 lg:order-2 scroll-mt-24">
          <BotonFichaje
            userId={profile?.id || ""}
            turnoActivo={turnoActivo}
            onFichaje={() => { const h=new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",hour12:true}); const n=profile?.nombre||"Operador"; const eraInicio=!turnoActivo; if(eraInicio){setModalTurno({hora:h,nombre:n,tipo:"inicio"});} else{setModalTurno({hora:h,nombre:n,tipo:"cierre"});} cargarDatos(); }}
            onTurnoFinalizado={cargarDatos}
            mallaBloqueaInicio={!!bloqueoMalla}
          />
        </div>
      </div>
      {turnoActivo && turnos[0]?.latEntrada && turnos[0]?.lngEntrada && (
        <div className="max-w-md">
          <MapaUbicacion lat={turnos[0].latEntrada} lng={turnos[0].lngEntrada} label="Ubicacion de entrada" />
        </div>
      )}
      <div className="min-w-0">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Detalle de turnos</h3>
        <div className="overflow-x-auto w-full">
          <DataTable columns={columns as never} data={turnos as never} emptyMessage="No hay turnos registrados este mes" />
        </div>
      </div>

      <div className="min-w-0 space-y-3">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Mis foráneos (km)</h3>
        <p className="text-sm text-gray-500 dark:text-[#A0AEC0]">
          El coordinador debe aprobar cada registro. En nómina solo cuentan los <strong>aprobados</strong>.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#CBD5E1] mb-1">Estado</label>
            <select
              value={estadoFiltroForaneo}
              onChange={(e) => setEstadoFiltroForaneo(e.target.value)}
              className="input-field"
            >
              <option value="PENDIENTE">Pendientes por autorizar</option>
              <option value="APROBADA">Aprobados</option>
              <option value="NO_APROBADA">No aprobados</option>
              <option value="TODOS">Todos</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => void cargarForaneosLista()}
            disabled={loadingForaneosLista}
            className="btn-secondary text-sm"
          >
            {loadingForaneosLista ? "Cargando…" : "Actualizar lista"}
          </button>
        </div>
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#162035] border-b border-gray-200 dark:border-[#3A4565]">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#A0AEC0] uppercase">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#A0AEC0] uppercase">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#A0AEC0] uppercase">Km rec.</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#A0AEC0] uppercase">Nota coordinador</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-[#1E2A45] bg-white dark:bg-[#1A2340]">
                {loadingForaneosLista && foraneosRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500 dark:text-[#A0AEC0]">
                      <div className="inline-block w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                    </td>
                  </tr>
                ) : foraneosRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500 dark:text-[#A0AEC0]">
                      No hay registros con este filtro
                    </td>
                  </tr>
                ) : (
                  foraneosRows.map((f) => (
                    <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-[#243052]">
                      <td className="px-4 py-3 text-sm text-gray-800 dark:text-white whitespace-nowrap">
                        {f.fecha.split("T")[0]}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {f.estadoAprobacion === "APROBADA" && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200">
                            Aprobada
                          </span>
                        )}
                        {f.estadoAprobacion === "PENDIENTE" && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                            Pendiente por autorizar
                          </span>
                        )}
                        {f.estadoAprobacion === "NO_APROBADA" && (
                          <span
                            className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                            title={f.notaAprobacion ?? undefined}
                          >
                            No aprobada
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-white whitespace-nowrap">
                        {f.kmRecorridos != null ? `${Number(f.kmRecorridos).toFixed(1)} km` : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-[#CBD5E1] max-w-xs">
                        {f.notaAprobacion ? (
                          <span title={f.notaAprobacion}>{f.notaAprobacion}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    
      {modalTurno && (
        <div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px",background:"rgba(0,0,0,0.75)"}}>
          <div style={{background:"#001035",border:"1px solid rgba(8,221,188,0.3)",borderRadius:"16px",padding:"32px",maxWidth:"360px",width:"100%",textAlign:"center"}}>
            <div style={{fontSize:"48px",marginBottom:"16px"}}>{modalTurno.tipo==="inicio" ? "⚡" : "✅"}</div>
            <h2 style={{color:"white",fontWeight:"bold",fontSize:"20px",marginBottom:"8px"}}>{modalTurno.tipo==="inicio" ? "Bienvenido, " : "Buen trabajo, "}{modalTurno.nombre.split(" ")[0]}!</h2>
            <p style={{color:"#08DDBC",fontSize:"16px",fontWeight:"600",marginBottom:"12px"}}>{modalTurno.tipo==="inicio" ? "Turno iniciado a las " : "Turno cerrado a las "}{modalTurno.hora}</p>
            <p style={{color:"#8892A4",fontSize:"13px",marginBottom:"20px"}}>{modalTurno.tipo==="inicio" ? "El equipo cuenta contigo hoy!" : "Descansa bien!"}</p>
            <button onClick={()=>setModalTurno(null)} style={{width:"100%",background:"#08DDBC",color:"#001035",fontWeight:"bold",padding:"12px",borderRadius:"12px",border:"none",cursor:"pointer",fontSize:"15px"}}>{modalTurno.tipo==="inicio" ? "Vamos! 🚀" : "Entendido ✅"}</button>
          </div>
        </div>
      )}
    </div>
  );
}