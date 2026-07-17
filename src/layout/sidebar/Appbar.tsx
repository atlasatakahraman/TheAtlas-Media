// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-06-21

'use client';

import { Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenuItem, SidebarMenu } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { openLink, replaceTurkishLetters } from "@/lib/utils";
import { useDeferredValue, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { getSidebarMenuGroups } from "./data";
import RenderMenuItem from "./render-menu-item";
import type { MenuItem } from "./types";
import { useRouter } from "next/navigation";

type SearchIndexEntry = {
	normTitle: string;
	normUrl: string;
	normShortUrl: string;
};

export default function Appbar() {

	const sidebarMenuGroups = useMemo(() => getSidebarMenuGroups(), []);
	const [searchQuery, setSearchQuery] = useState("");

	const router = useRouter();

	// Precomputed, lowercase + Turkish-folded lookup fields for every item in the
	// tree. Built once from the static menu data instead of re-normalizing every
	// item's title/url/short_url on every keystroke.
	const searchIndex = useMemo(() => {
		const index = new Map<MenuItem, SearchIndexEntry>();
		const walk = (item: MenuItem) => {
			index.set(item, {
				normTitle: replaceTurkishLetters(item.title.toLowerCase()),
				normUrl: item.url ? replaceTurkishLetters(item.url.toLowerCase()) : "",
				normShortUrl: item.short_url ? replaceTurkishLetters(item.short_url.toLowerCase()) : "",
			});
			item.items?.forEach(walk);
		};
		sidebarMenuGroups.forEach((group) => group.items.forEach(walk));
		return index;
	}, [sidebarMenuGroups]);

	// O(1) short_url -> item lookup for the Enter-key quick-jump shortcut.
	// Kept fully independent from search-result visibility so the shortcut always
	// resolves against the exact current query, with no state write during render.
	const shortUrlIndex = useMemo(() => {
		const map = new Map<string, MenuItem>();
		const walk = (item: MenuItem) => {
			if (item.short_url) map.set(item.short_url.toLowerCase(), item);
			item.items?.forEach(walk);
		};
		sidebarMenuGroups.forEach((group) => group.items.forEach(walk));
		return map;
	}, [sidebarMenuGroups]);

	// The heavy tree-matching pass is deferred so keystrokes never feel blocked;
	// the input field itself always reflects `searchQuery` immediately.
	const deferredQuery = useDeferredValue(searchQuery);

	// The full, unfiltered tree is always rendered (see below) — matching no
	// longer removes items from the array. Instead this Set says which items are
	// currently visible; RenderMenuItem collapses everything else with a
	// transition instead of unmounting it instantly. `undefined` means no active
	// search, i.e. everything is visible.
	const visibleItems = useMemo(() => {
		const trimmed = deferredQuery.trim();
		if (!trimmed) return undefined;

		const query = replaceTurkishLetters(trimmed.toLowerCase());
		const visible = new Set<MenuItem>();

		const markSubtreeVisible = (item: MenuItem) => {
			visible.add(item);
			item.items?.forEach(markSubtreeVisible);
		};

		// Returns true if `item` (or any descendant) matches, in which case it's
		// added to `visible`. A direct match marks the item's whole subtree
		// visible (so children that don't individually match still show up under
		// a matched parent) — matching the original pruning behavior.
		const walk = (item: MenuItem): boolean => {
			const entry = searchIndex.get(item);
			const isDirectMatch = !!entry && (
				entry.normTitle.includes(query) ||
				(!!entry.normUrl && entry.normUrl.includes(query)) ||
				(!!entry.normShortUrl && entry.normShortUrl.includes(query))
			);

			if (isDirectMatch) {
				markSubtreeVisible(item);
				return true;
			}

			let anyChildVisible = false;
			if (item.items) {
				for (const child of item.items) {
					if (walk(child)) anyChildVisible = true;
				}
			}

			if (anyChildVisible) {
				visible.add(item);
				return true;
			}

			return false;
		};

		sidebarMenuGroups.forEach((group) => {
			if (replaceTurkishLetters(group.label.toLowerCase()).includes(query)) {
				group.items.forEach(markSubtreeVisible);
			} else {
				group.items.forEach(walk);
			}
		});

		return visible;
	}, [sidebarMenuGroups, searchIndex, deferredQuery]);

	return (
		<Sidebar className="border-none no-scrollbar" collapsible="icon" variant="sidebar" side="left">
			<SidebarHeader className="bg-secondary h-16 p-0">
				<div className="h-full w-full flex items-center justify-center gap-2 overflow-hidden px-2">
					<button onClick={() => openLink("https://github.com/atlasatakahraman/TheAtlas")}
						className="hover:cursor-pointer text-foreground text-2xl font-serif whitespace-nowrap"
					>
						TheAtlas
					</button>
					<span className="text-muted-foreground">—</span>
					<Badge
						onClick={() => openLink("https://github.com/atlasatakahraman/TheAtlas-Media")}
						className="hover:cursor-pointer font-sans text-sm p-3 shrink-0">Media</Badge>
				</div>
			</SidebarHeader>
			<SidebarContent className='bg-secondary  flex-1 text-start **:whitespace-nowrap border-r border-sidebar-border'>
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
								if (e.key === 'Enter') {
									if (searchQuery.toLowerCase().includes("home")) {
										router.replace("/");
										setSearchQuery("");
										return;
									}

									const matched = shortUrlIndex.get(searchQuery.trim().toLowerCase());
									if (matched?.url !== undefined) {
										router.push(matched.url);
										setSearchQuery("");
									}
								}
							}}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
					</div>
				</div>
				<ScrollArea className="h-full w-full no-scrollbar **:data-[slot=scroll-area-scrollbar]:hidden">
					<div className="pl-2 pr-3 pb-4">
						{sidebarMenuGroups.map((group) => (
							<SidebarGroup key={group.label}>
								<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
								<SidebarGroupContent className="text-primary">
									<SidebarMenu>
										{group.items.map((item) => (
											<SidebarMenuItem key={item.title}>
												<RenderMenuItem
													item={item}
													level={0}
													searchQuery={deferredQuery}
													visibleItems={visibleItems}
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
		</Sidebar>
	)
}
