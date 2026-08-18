// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-06-21

"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { IS_DEBUG_MODE } from "@/lib/debug-env";
import { runQuery } from "@/lib/search/query";
import { openLink } from "@/lib/utils";
import { NAV_FLAT, NAV_GROUPS, NAV_INDEX, navByShortcut } from "@/registry/nav";
import { activeNavIds } from "@/registry/nav/active";
import { visibleNavIds } from "@/registry/nav/visibility";
import RenderMenuItem from "./render-menu-item";

export default function Appbar() {
	const [searchQuery, setSearchQuery] = useState("");
	const router = useRouter();
	const pathname = usePathname();

	// The heavy pass is deferred so keystrokes never feel blocked; the input
	// itself always reflects `searchQuery` immediately.
	const deferredQuery = useDeferredValue(searchQuery);

	// `runQuery` remembers its own last result per index, so extending the query
	// refines the previous match set instead of rescanning — with no ref to read
	// during render.
	const result = useMemo(() => runQuery(NAV_INDEX, deferredQuery), [deferredQuery]);

	const visibleIds = useMemo(() => visibleNavIds(result), [result]);

	const fullTitleIds = useMemo(() => {
		if (!result.query) return undefined;
		const ids = new Set<string>();
		for (let i = 0; i < result.matched; i++) {
			const offset = result.order[i];
			if (result.fullTitle[offset]) ids.add(NAV_FLAT[offset].item.id);
		}
		return ids;
	}, [result]);

	const activeIds = useMemo(() => activeNavIds(pathname), [pathname]);

	function handleSearchEnter() {
		const trimmed = searchQuery.trim().toLowerCase();
		if (!trimmed) return;

		if (trimmed.includes("home")) {
			router.replace("/");
			setSearchQuery("");
			return;
		}

		const matched = navByShortcut.get(trimmed);
		if (matched?.item.url) {
			router.push(matched.item.url);
			setSearchQuery("");
		}
	}

	return (
		<Sidebar className="border-none no-scrollbar" collapsible="icon" variant="sidebar" side="left">
			<SidebarHeader className="bg-secondary h-16 p-0">
				<div className="h-full w-full flex items-center justify-center gap-2 overflow-hidden px-2">
					<button
						onClick={() => openLink("https://github.com/atlasatakahraman/TheAtlas")}
						className="hover:cursor-pointer text-foreground text-2xl font-serif whitespace-nowrap"
					>
						TheAtlas
					</button>
					<span className="text-muted-foreground">—</span>
					<Badge
						onClick={() => openLink("https://github.com/atlasatakahraman/TheAtlas-Media")}
						className="hover:cursor-pointer font-sans text-sm p-3 shrink-0"
					>
						Media
					</Badge>
				</div>
			</SidebarHeader>

			<SidebarContent className="bg-secondary flex-1 text-start **:whitespace-nowrap border-r border-sidebar-border">
				<div className="px-3 py-2">
					<div className="relative">
						<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							autoComplete="off"
							type="text"
							id="sidebar-search"
							placeholder="Search tools..."
							className="w-full bg-background/50 pl-9 border-none focus-visible:ring-1 focus-visible:ring-primary/80 shadow-xs rounded-md h-9"
							value={searchQuery}
							onKeyUp={(e) => {
								if (e.key === "Enter") handleSearchEnter();
							}}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
					</div>
				</div>

				<ScrollArea className="h-full w-full no-scrollbar **:data-[slot=scroll-area-scrollbar]:hidden">
					<div className="pl-2 pr-3 pb-4">
						{NAV_GROUPS.map((group) => (
							<SidebarGroup key={group.id}>
								<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
								<SidebarGroupContent className="text-primary">
									<SidebarMenu>
										{group.items.map((item) => (
											<SidebarMenuItem key={item.id}>
												<RenderMenuItem
													item={item}
													level={0}
													searchQuery={deferredQuery}
													visibleIds={visibleIds}
													activeIds={activeIds}
													fullTitleIds={fullTitleIds}
												/>
											</SidebarMenuItem>
										))}
									</SidebarMenu>
								</SidebarGroupContent>
							</SidebarGroup>
						))}
					</div>
				</ScrollArea>
			</SidebarContent>

			{IS_DEBUG_MODE && (
				<SidebarFooter className="bg-secondary border-r border-sidebar-border p-3 flex items-center justify-center">
					<Badge
						variant="outline"
						className="px-2.5 py-1 text-xs font-medium border-debug/40 text-debug bg-debug/10 rounded-full shadow-xs flex items-center justify-center cursor-default select-none group-data-[collapsible=icon]:hidden"
					>
						Debug Mode Enabled
					</Badge>
				</SidebarFooter>
			)}
		</Sidebar>
	);
}
