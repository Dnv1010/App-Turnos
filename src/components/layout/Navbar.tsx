"use client";
import { signOut } from "next-auth/react";
import { HiMenu, HiLogout, HiUser } from "react-icons/hi";

// Componente del logo Bia con rayo
function BiaLogo({ size = "sm" }: { size?: "sm" | "md" }) {
  const rayoSize = size === "sm" ? { w: 14, h: 18 } : { w: 20, h: 24 };
  const textSize = size === "sm" ? "text-base" : "text-xl";
  
  return (
    <div className="flex items-center gap-0.5">
      <svg 
        width={rayoSize.w} 
        height={rayoSize.h} 
        viewBox="0 0 40 48" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M24 0L0 28H16L12 48L40 18H22L24 0Z" fill="#00D4AA"/>
      </svg>
      <span className={`font-black ${textSize} text-gray-900`} style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        Bia
      </span>
    </div>
  );
}

interface NavbarProps {
  nombre: string;
  role: string;
  zona: string;
  onMenuClick: () => void;
}

const rolLabels: Record<string, string> = {
  TECNICO: "Técnico", COORDINADOR: "Coordinador", MANAGER: "Manager", ADMIN: "Administrador",
};

const zonaBadgeClasses: Record<string, string> = {
  BOGOTA: "badge-blue", COSTA: "badge-green",
};

export default function Navbar({ nombre, role, zona, onMenuClick }: NavbarProps) {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
      <div className="flex items-center justify-between h-14 sm:h-16 px-2 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={onMenuClick} className="lg:hidden p-3 sm:p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 touch-manipulation" aria-label="Abrir menú">
            <HiMenu className="h-6 w-6 sm:h-5 sm:w-5" />
          </button>
          {/* Logo + App Turnos en desktop */}
          <div className="hidden sm:flex items-center gap-2">
            <BiaLogo size="sm" />
            <span className="text-gray-400 font-light">|</span>
            <span className="text-sm font-medium text-gray-600">App Turnos</span>
          </div>
          {/* Logo compacto en mobile */}
          <div className="sm:hidden">
            <BiaLogo size="sm" />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900">{nombre}</p>
              <div className="flex items-center gap-2 justify-end">
                <span className="badge-purple">{rolLabels[role] || role}</span>
                <span className={zonaBadgeClasses[zona] || "badge-blue"}>{zona}</span>
              </div>
            </div>
            <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center">
              <HiUser className="h-5 w-5 text-primary-600" />
            </div>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/login" })}
            className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors" title="Cerrar sesión">
            <HiLogout className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}