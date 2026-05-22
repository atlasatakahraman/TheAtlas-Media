"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { MenuGroup, MenuItem } from "./types";

const STORAGE_KEY = "atlas_recent_pages";
const MAX_RECENT = 3;

export interface RecentPage {
  url: string;
  title: string;
  visitedAt: number;
}

function findMenuItemByUrl(groups: MenuGroup[], url: string): MenuItem | null {
  for (const group of groups) {
    const found = findInItems(group.items, url);
    if (found) return found;
  }
  return null;
}

function findInItems(items: MenuItem[], url: string): MenuItem | null {
  for (const item of items) {
    if (item.url === url) return item;
    if (item.items) {
      const found = findInItems(item.items, url);
      if (found) return found;
    }
  }
  return null;
}

function getStoredRecent(): RecentPage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecent(pages: RecentPage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  } catch {
    /* quota exceeded */
  }
}

export function useRecentPages(sidebarGroups: MenuGroup[]) {
  const pathname = usePathname();
  const [recentPages, setRecentPages] = useState<RecentPage[]>(() =>
    getStoredRecent(),
  );

  // Record current page visit
  useEffect(() => {
    if (!pathname || pathname === "/") return;

    const menuItem = findMenuItemByUrl(sidebarGroups, pathname);
    if (!menuItem || !menuItem.url) return;

    setRecentPages((prev) => {
      const filtered = prev.filter((p) => p.url !== pathname);
      const updated = [
        { url: pathname, title: menuItem.title, visitedAt: Date.now() },
        ...filtered,
      ].slice(0, MAX_RECENT);
      saveRecent(updated);
      return updated;
    });
  }, [pathname, sidebarGroups]);

  // Build MenuItem[] from recent pages
  const recentMenuItems: MenuItem[] = recentPages.map((page) => {
    const menuItem = findMenuItemByUrl(sidebarGroups, page.url);
    return {
      title: page.title,
      url: page.url,
      icon: menuItem?.icon,
    };
  });

  const clearRecent = useCallback(() => {
    setRecentPages([]);
    saveRecent([]);
  }, []);

  return { recentMenuItems, clearRecent };
}
