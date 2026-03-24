"use client";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { HiMenu, HiLogout, HiUser, HiSun, HiMoon, HiKey } from "react-icons/hi";
import CambiarPinModal from "@/components/shared/CambiarPinModal";
import { useTheme } from "@/hooks/useTheme";
import { getRoleLabel, getZonaLabel } from "@/lib/roleLabels";

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
      <span className={`font-black ${textSize} text-gray-900 dark:text-white`} style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
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

const zonaBadgeClasses: Record<string, string> = {
  BOGOTA: "badge-blue",
  COSTA: "badge-green",
  INTERIOR: "badge-zona-interior",
};

const rolBadgeClasses: Record<string, string> = {
  TECNICO: "bia-badge-tecnico",
  COORDINADOR: "bia-badge-coordinador",
  COORDINADOR_INTERIOR: "bia-badge-coord-interior",
  MANAGER: "bia-badge-manager",
  ADMIN: "bia-badge-admin",
};

export default function Navbar({ nombre, role, zona, onMenuClick }: NavbarProps) {
  const { theme, toggleTheme } = useTheme();
  const [showCambiarPin, setShowCambiarPin] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-[#1A2340] border-b border-gray-200 dark:border-[#3A4565] dark:shadow-black/40 shadow-sm">
      <div className="flex items-center justify-between h-14 sm:h-16 px-2 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={onMenuClick} className="lg:hidden p-3 sm:p-2 rounded-lg text-gray-500 dark:text-[#A0AEC0] hover:bg-gray-100 dark:hover:bg-[#243052] hover:text-gray-700 dark:hover:text-white touch-manipulation" aria-label="Abrir menú">
            <HiMenu className="h-6 w-6 sm:h-5 sm:w-5" />
          </button>
          {/* Logo + App Turnos en desktop */}
          <div className="hidden sm:flex items-center gap-2">
            <BiaLogo size="sm" />
            <span className="text-gray-400 dark:text-bia-muted font-light">|</span>
            <span className="text-sm font-medium text-gray-600 dark:text-[#A0AEC0]">App Turnos</span>
          </div>
          {/* Logo compacto en mobile */}
          <div className="sm:hidden">
            <BiaLogo size="sm" />
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            type="button"
            onClick={() => setShowCambiarPin(true)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#243052] transition-colors"
            title="Cambiar PIN"
            aria-label="Cambiar PIN"
          >
            <HiKey className="h-5 w-5 text-gray-500 dark:text-[#A0AEC0]" />
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#243052] transition-colors"
            title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
            aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
          >
            {theme === "dark" ? (
              <HiSun className="h-5 w-5 text-yellow-400" />
            ) : (
              <HiMoon className="h-5 w-5 text-gray-500 dark:text-[#A0AEC0]" />
            )}
          </button>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{nombre}</p>
              <div className="flex items-center gap-2 justify-end">
                <span className={rolBadgeClasses[role] || "bia-badge-coordinador"}>{getRoleLabel(role)}</span>
                <span className={zonaBadgeClasses[zona] || "badge-blue"}>{getZonaLabel(zona)}</span>
              </div>
            </div>
            <div className="w-9 h-9 bg-primary-100 dark:bg-bia-teal/20 rounded-full flex items-center justify-center">
              <HiUser className="h-5 w-5 text-primary-600 dark:text-bia-teal" />
            </div>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/login" })}
            className="p-2 rounded-lg text-gray-500 dark:text-bia-muted hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-[#F87171] transition-colors" title="Cerrar sesión">
            <HiLogout className="h-5 w-5" />
          </button>
        </div>
      </div>
      <CambiarPinModal open={showCambiarPin} onClose={() => setShowCambiarPin(false)} />
    </header>
  );
}