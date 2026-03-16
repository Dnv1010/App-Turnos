"use client";

import { signOut } from "next-auth/react";
import { HiMenu, HiLogout, HiUser } from "react-icons/hi";

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
      <div className="flex items-center justify-between h-16 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button onClick={onMenuClick} className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700">
            <HiMenu className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 hidden sm:block">App Turnos BIA</h1>
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
