"use client";

import { useAuth } from "@/auth/hooks";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { LogOutIcon, LucidePanelLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";
import { getSidebarMenuGroups } from "./data";
import RenderMenuItem from "./render-menu-item";
import type { MenuItem } from "./types";
import { useRecentPages } from "./use-recent-pages";

export default function AppBar() {
  const { isAuthenticated, signOut } = useAuth();
  const { open, toggleSidebar } = useSidebar();
  const router = useRouter();

  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  useEffect(() => {
    if (!open) {
      setTimeout(() => setIsCollapsed(true), 150);
    } else {
      setIsCollapsed(false);
    }
  }, [open]);

  const sidebarMenuGroups = useMemo(() => getSidebarMenuGroups(), []);
  const { recentMenuItems } = useRecentPages(sidebarMenuGroups);

  const logoutItem: MenuItem = useMemo(
    () => ({
      title: "Sign Out",
      icon: LogOutIcon,
      action: async () => {
        try {
          await signOut();
        } catch (error) {
          console.error("Logout failed:", error);
        }
      },
    }),
    [signOut],
  );

  if (!isAuthenticated) return <div className="pl-2"></div>;

  return (
    <Sidebar
      className={cn("overflow-clip  **:text-nowrap")}
      side="left"
      variant="sidebar"
      collapsible="icon"
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className={cn("flex justify-between flex-1")}>
              <div
                className={cn(
                  "flex leading-none cursor-pointer pl-2 pr-4 py-1 opacity-100",
                  !open &&
                    "opacity-0 transition-all duration-150 ease-out delay-75",
                  isCollapsed && "hidden",
                )}
                aria-label="TheAtlas YouTube Home"
                onClick={() => router.replace("/home")}
              >
                <span className="text-foreground font-medium text-2xl font-serif">
                  TheAtlas
                </span>
              </div>
              <SidebarMenuButton
                className="w-fit text-muted-foreground! mt-1"
                size={"sm"}
                onClick={() => toggleSidebar()}
              >
                <LucidePanelLeft className="w-5 h-5" />
              </SidebarMenuButton>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarGroup className="p-0 pt-1">
          <SidebarGroupLabel
            className={cn(
              "opacity-100 text-xs font-medium text-sidebar-foreground/70",
              !open && "opacity-0 pointer-events-none select-none",
              isCollapsed && "group-data-[collapsible=icon]:-mt-8",
            )}
          >
            Recently Visited
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {recentMenuItems.length > 0 ? (
                recentMenuItems.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <RenderMenuItem item={item} level={0} />
                  </SidebarMenuItem>
                ))
              ) : (
                <p
                  className={cn(
                    "px-3 py-1.5 text-xs text-muted-foreground/60 italic",
                    !open &&
                      "opacity-0 transition-all duration-150 ease-out delay-75",
                    isCollapsed && "hidden",
                  )}
                >
                  No pages visited yet..
                </p>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarHeader>

      <SidebarContent className="overflow-x-hidden">
        {sidebarMenuGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel
              className={cn(
                "opacity-100 text-xs font-medium text-sidebar-foreground/70",
                !open && "opacity-0 pointer-events-none select-none",
                isCollapsed && "group-data-[collapsible=icon]:-mt-8",
              )}
            >
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <RenderMenuItem item={item} level={0} />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="overflow-x-hidden">
        <SidebarMenu>
          <SidebarMenuItem key="logout">
            <RenderMenuItem item={logoutItem} level={0}></RenderMenuItem>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
