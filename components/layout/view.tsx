"use client";

import AppBar from "@/components/layout/sidebar/AppBar";
import { SidebarInset } from "@/components/ui/sidebar";
import { usePathname } from "next/navigation";

export default function AppView({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-1">
      <AppBar />
      <SidebarInset
        key={pathname}
        className="animate-page-in flex-1 overflow-hidden"
      >
        {children}
      </SidebarInset>
    </div>
  );
}
