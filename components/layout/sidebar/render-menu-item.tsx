"use client";

import {
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MenuItem, RenderMenuItemProps } from "./types";

function containsActiveUrl(item: MenuItem, pathname: string): boolean {
  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  if (item.url && normalized.startsWith(item.url)) return true;
  if (item.items) {
    return item.items.some((child) => containsActiveUrl(child, pathname));
  }
  return false;
}

const RenderMenuItem = ({
  item,
  level = 0,
  parentPath = "",
}: RenderMenuItemProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const itemPath = `${parentPath}-${item.title}`;
  const { open: sidebarOpen } = useSidebar();
  const navigatingRef = useRef(false);

  useEffect(() => {
    navigatingRef.current = false;
  }, [pathname]);

  const isActive = useMemo(
    () => (item.items ? containsActiveUrl(item, pathname) : false),
    [item, pathname],
  );

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    isActive ? { [itemPath]: true } : {},
  );

  useEffect(() => {
    const handle = () => {
      if (isActive) {
        setOpenGroups((prev) => ({ ...prev, [itemPath]: true }));
      }
    };
    handle();
  }, [isActive, itemPath]);

  const toggleGroup = useCallback((path: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  }, []);

  const hasChildren = item.items && item.items.length > 0;
  if (hasChildren) {
    const SubMenuComponent = level === 0 ? SidebarMenuSub : "div";
    const SubItemComponent = level === 0 ? SidebarMenuSubItem : "div";
    const SubButtonComponent =
      level === 0 ? SidebarMenuSubButton : SidebarMenuButton;

    return (
      <>
        {level === 0 ? (
          <SidebarMenuButton
            onClick={sidebarOpen ? () => toggleGroup(itemPath) : undefined}
            aria-expanded={openGroups[itemPath]}
            aria-controls={`submenu-${itemPath}`}
            className={cn(
              "group/menu-button cursor-default",
              !sidebarOpen && "pointer-events-none",
              !sidebarOpen && "opacity-50",
            )}
          >
            {item.icon && <item.icon className="h-4 w-4" />}
            <span className="flex-1 text-left">{item.title}</span>
            {item.badge && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground ml-auto mr-2">
                {item.badge}
              </span>
            )}
            <ChevronRight
              className={cn(
                "ml-auto h-4 w-4 transition-transform duration-200",
                openGroups[itemPath] && "rotate-90",
              )}
            />
          </SidebarMenuButton>
        ) : (
          <SubButtonComponent
            onClick={() => toggleGroup(itemPath)}
            aria-expanded={openGroups[itemPath]}
            aria-controls={`submenu-${itemPath}`}
            className="justify-between w-full cursor-default"
          >
            <div className="flex items-center gap-2">
              {item.icon && <item.icon className="h-4 w-4" />}
              <span>{item.title}</span>
              {item.badge && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                  {item.badge}
                </span>
              )}
            </div>
            <ChevronRight
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                openGroups[itemPath] && "rotate-90",
              )}
            />
          </SubButtonComponent>
        )}
        <div
          id={`submenu-${itemPath}`}
          className={cn(
            "overflow-hidden transition-all duration-300 ease-in-out",
            openGroups[itemPath] && sidebarOpen
              ? "max-h-75 opacity-100"
              : "max-h-0 opacity-0",
          )}
          role="region"
          aria-labelledby={`button-${itemPath}`}
        >
          <SubMenuComponent className={level > 0 ? "ml-4 border-l pl-2" : ""}>
            {item.items!.map((subItem, subIndex) => (
              <SubItemComponent
                key={`${subItem.title}-${subIndex}`}
                className={cn(
                  "transform transition-all duration-200 ease-in-out",
                  openGroups[itemPath] && sidebarOpen
                    ? "translate-x-0 opacity-100"
                    : "-translate-x-4 opacity-0",
                )}
                style={{
                  transitionDelay:
                    openGroups[itemPath] && sidebarOpen
                      ? `${subIndex * 50}ms`
                      : "0ms",
                }}
              >
                <RenderMenuItem
                  item={subItem}
                  level={level + 1}
                  parentPath={itemPath}
                />
              </SubItemComponent>
            ))}
          </SubMenuComponent>
        </div>
      </>
    );
  }
  const MenuComponent = level === 0 ? SidebarMenuButton : SidebarMenuSubButton;

  if (item.url) {
    const handleNavigation = () => {
      if (navigatingRef.current) return;
      navigatingRef.current = true;
      router.push(item.url!);
    };
    return (
      <MenuComponent onClick={handleNavigation} className="cursor-pointer">
        {item.icon && <item.icon className="h-4 w-4" />}
        <span className="flex-1">{item.title}</span>
        {item.badge && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground ml-auto">
            {item.badge}
          </span>
        )}
      </MenuComponent>
    );
  }

  return (
    <MenuComponent onClick={item.action} className="cursor-pointer">
      {item.icon && <item.icon className="h-4 w-4" />}
      <span className="flex-1">{item.title}</span>
      {item.badge && (
        <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground ml-auto">
          {item.badge}
        </span>
      )}
    </MenuComponent>
  );
};

export default RenderMenuItem;
