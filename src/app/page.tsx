"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-provider";

export default function OpsHomePage() {
  const router = useRouter();
  const { profile, loading } = useAuth();

  useEffect(() => {
    if (!loading && !profile) router.replace("/login");
  }, [loading, profile, router]);

  if (loading || !profile) return null;

  function getDashboardUrl() {
    const rol = String(profile?.role || "").toUpperCase();
    if (rol === "ADMIN") return "/admin";
    if (rol === "COORDINADOR") return "/coordinador";
    if (rol === "COORDINADOR_INTERIOR") return "/coordinador-interior";
    if (rol === "MANAGER") return "/manager";
    if (rol === "SUPPLY") return "/supply";
    return "/tecnico";
  }

  const nombre = profile?.fullName || profile?.email || "Usuario";
  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos dias" : hora < 18 ? "Buenas tardes" : "Buenas noches";

  return (
    <div style={{minHeight:"100vh",background:"#000B1E",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"16px"}}>
      <div style={{textAlign:"center",marginBottom:"48px"}}>
        <div style={{display:"flex",gap:"8px",justifyContent:"center",marginBottom:"8px"}}>
          <span style={{fontSize:"48px",fontWeight:900,color:"white"}}>Ops</span>
          <span style={{fontSize:"48px",fontWeight:900,color:"#08DDBC"}}>BIA</span>
        </div>
        <p style={{color:"#8892A4",fontSize:"12px",letterSpacing:"3px"}}>BIA Energy SAS ESP - Plataforma Operacional</p>
        <p style={{color:"#525A72",fontSize:"13px",marginTop:"8px"}}>{saludo}, {nombre.split(" ")[0]} 👋</p>
      </div>
      <p style={{color:"#525A72",fontSize:"11px",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"24px"}}>Selecciona un modulo</p>
      <div style={{display:"flex",gap:"16px",flexWrap:"wrap",justifyContent:"center"}}>
        <button onClick={() => router.push(getDashboardUrl())} style={{background:"#001035",border:"1px solid rgba(8,221,188,0.3)",borderRadius:"16px",padding:"40px 32px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px",minWidth:"180px"}}>
          <span style={{fontSize:"40px"}}>📋</span>
          <div>
            <p style={{color:"white",fontWeight:"bold",fontSize:"18px",margin:0}}>App Turnos</p>
            <p style={{color:"#525A72",fontSize:"12px",margin:"4px 0 0"}}>Gestion de turnos y horas</p>
          </div>
          <span style={{color:"#08DDBC",fontSize:"12px",border:"1px solid rgba(8,221,188,0.2)",borderRadius:"999px",padding:"2px 12px"}}>Ingresar</span>
        </button>
        <a href="https://micaja3-one.vercel.app" target="_blank" rel="noopener noreferrer" style={{background:"#001035",border:"1px solid rgba(82,90,114,0.3)",borderRadius:"16px",padding:"40px 32px",display:"flex",flexDirection:"column",alignItems:"center",gap:"12px",textDecoration:"none",minWidth:"180px"}}>
          <span style={{fontSize:"40px"}}>💰</span>
          <div>
            <p style={{color:"white",fontWeight:"bold",fontSize:"18px",margin:0}}>MiCaja</p>
            <p style={{color:"#525A72",fontSize:"12px",margin:"4px 0 0"}}>Caja menor y legalizaciones</p>
          </div>
          <span style={{color:"#525A72",fontSize:"12px",border:"1px solid rgba(82,90,114,0.3)",borderRadius:"999px",padding:"2px 12px"}}>Abrir</span>
        </a>
      </div>
    </div>
  );
}
