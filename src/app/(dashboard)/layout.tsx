"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Navbar from "@/components/layout/Navbar";
import { getPostLoginPath } from "@/lib/postLoginPath";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    const role = session.user.role;
    if (role === "COORDINADOR_INTERIOR" && !pathname.startsWith("/coordinador-interior")) {
      router.replace("/coordinador-interior");
      return;
    }
    if (role !== "COORDINADOR_INTERIOR" && pathname.startsWith("/coordinador-interior")) {
      router.replace(getPostLoginPath(role));
    }
  }, [status, session, pathname, router]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    router.push("/login");
    return null;
  }

  const role = session.user.role;
  if (role === "COORDINADOR_INTERIOR" && !pathname.startsWith("/coordinador-interior")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (role !== "COORDINADOR_INTERIOR" && pathname.startsWith("/coordinador-interior")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role={session.user.role} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar nombre={session.user.nombre || session.user.email || ""} role={session.user.role} zona={session.user.zona}
          onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto w-full min-w-0 p-2 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
