"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HiHome, HiCalendar, HiCamera, HiUserGroup, HiChartBar, HiDocumentReport, HiCog, HiX } from "react-icons/hi";

interface SidebarProps {
  role: string;
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
}

const navItems: NavItem[] = [
  { label: "Mi Dashboard", href: "/tecnico", icon: HiHome, roles: ["TECNICO", "COORDINADOR", "MANAGER", "ADMIN"] },
  { label: "Calendario", href: "/tecnico/calendario", icon: HiCalendar, roles: ["TECNICO", "COORDINADOR", "MANAGER", "ADMIN"] },
  { label: "Fotos", href: "/tecnico/fotos", icon: HiCamera, roles: ["TECNICO"] },
  { label: "Mi Equipo", href: "/coordinador", icon: HiUserGroup, roles: ["COORDINADOR"] },
  { label: "Dashboard Global", href: "/manager", icon: HiChartBar, roles: ["MANAGER", "ADMIN"] },
  { label: "Reportes", href: "/manager/reportes", icon: HiDocumentReport, roles: ["MANAGER", "ADMIN", "COORDINADOR"] },
  { label: "Usuarios", href: "/admin/usuarios", icon: HiCog, roles: ["ADMIN"] },
];

export default function Sidebar({ role, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const filteredItems = navItems.filter((item) => item.roles.includes(role));

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={onClose} />}
      <aside className={`fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-auto ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">BIA</span>
            </div>
            <span className="font-bold text-gray-900">App Turnos</span>
          </div>
          <button onClick={onClose} className="lg:hidden text-gray-500 hover:text-gray-700">
            <HiX className="h-5 w-5" />
          </button>
        </div>
        <nav className="p-4 space-y-1">
          {filteredItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? "bg-primary-50 text-primary-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}>
                <item.icon className={`h-5 w-5 ${isActive ? "text-primary-600" : "text-gray-400"}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-gray-500">Conectado</span>
          </div>
        </div>
      </aside>
    </>
  );
}
