"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HiHome, HiCalendar, HiCamera, HiUserGroup, HiChartBar, HiDocumentReport, HiCog, HiX, HiClock, HiTruck } from "react-icons/hi";

// Componente del logo Bia con rayo
function BiaLogo({ size = "sm" }: { size?: "sm" | "md" }) {
  const rayoSize = size === "sm" ? { w: 16, h: 20 } : { w: 24, h: 30 };
  const textSize = size === "sm" ? "text-lg" : "text-2xl";
  
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
  { label: "Mi Dashboard", href: "/tecnico", icon: HiHome, roles: ["TECNICO"] },
  { label: "Mi Calendario", href: "/tecnico/calendario", icon: HiCalendar, roles: ["TECNICO"] },
  { label: "Fotos / Foráneos", href: "/tecnico/fotos", icon: HiCamera, roles: ["TECNICO"] },
  { label: "Dashboard Equipo", href: "/coordinador", icon: HiUserGroup, roles: ["COORDINADOR"] },
  { label: "Turnos Equipo", href: "/coordinador/turnos", icon: HiClock, roles: ["COORDINADOR"] },
  { label: "Mi Equipo", href: "/coordinador/equipo", icon: HiUserGroup, roles: ["COORDINADOR"] },
  { label: "Malla de Turnos", href: "/coordinador/malla", icon: HiCalendar, roles: ["COORDINADOR"] },
  { label: "Foráneos", href: "/coordinador/foraneos", icon: HiTruck, roles: ["COORDINADOR"] },
  { label: "Reportes", href: "/coordinador/reportes", icon: HiDocumentReport, roles: ["COORDINADOR"] },
  { label: "Reportes", href: "/manager/reportes/guardados", icon: HiDocumentReport, roles: ["MANAGER"] },
  { label: "Reportes", href: "/admin/reportes", icon: HiDocumentReport, roles: ["ADMIN"] },
  { label: "Análisis período", href: "/manager/reportes", icon: HiChartBar, roles: ["COORDINADOR", "MANAGER", "ADMIN"] },
  { label: "Dashboard Global", href: "/manager", icon: HiChartBar, roles: ["MANAGER", "ADMIN"] },
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
            <BiaLogo size="sm" />
            <span className="font-semibold text-gray-600 text-sm">App Turnos</span>
          </div>
          <button onClick={onClose} className="lg:hidden text-gray-500 hover:text-gray-700">
            <HiX className="h-5 w-5" />
          </button>
        </div>
        <nav className="p-4 space-y-1">
          {filteredItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
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