// next@16.2.6 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-05-31
'use client';

import { Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenuItem, SidebarMenu } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { openLink, replaceTurkishLetters } from "@/lib/utils";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { getSidebarMenuGroups } from "./sidebar/data";
import RenderMenuItem from "./sidebar/render-menu-item";
import type { MenuItem } from "./sidebar/types";
import { useRouter } from "next/navigation";

export default function Appbar() {

	const sidebarMenuGroups = useMemo(() => getSidebarMenuGroups(), []);
	const [searchQuery, setSearchQuery] = useState("");
	const [shortItem, setShortItem] = useState<MenuItem | null>(null);

	const router = useRouter();

	const filteredMenuGroups = useMemo(() => {
		if (!searchQuery.trim()) return sidebarMenuGroups;

		const query = replaceTurkishLetters(searchQuery.toLowerCase());

		const filterItem = (item: MenuItem): MenuItem | null => {

			if (item.short_url?.toLocaleLowerCase() === query) setShortItem(item);

			if (item.title.toLowerCase().includes(query) || item.url?.toLocaleLowerCase().includes(query) || item.short_url?.toLocaleLowerCase().includes(query)) {
				return item;
			}

			if (item.items && item.items.length > 0) {
				const filteredChildren = item.items
					.map(filterItem)
					.filter((child): child is MenuItem => child !== null);

				if (filteredChildren.length > 0) {
					return { ...item, items: filteredChildren };
				}

			}
			return null;
		};

		return sidebarMenuGroups.map(group => {
			if (group.label.toLowerCase().includes(query)) {
				return group;
			}

			const filteredItems = group.items
				.map(filterItem)
				.filter((item): item is MenuItem => item !== null);

			return { ...group, items: filteredItems };
		});
	}, [sidebarMenuGroups, searchQuery]);

	return (
		<Sidebar className="flex-1 min-w-16 border-none" collapsible="icon" side="left">
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
			<SidebarContent className='bg-secondary flex-1 text-start **:whitespace-nowrap border-r border-sidebar-border'>
				<div className="px-3 py-2">
					<div className="relative">
						<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							type="text"
							id="sidebar-search"
							placeholder="Search tools..."
							className="w-full bg-background/50 pl-9 border-none focus-visible:ring-1 focus-visible:ring-primary/80 shadow-xs rounded-md h-9"
							value={searchQuery}
							onKeyUp={(e) => {
								if (e.key === 'Enter') {
									if (searchQuery.toLocaleLowerCase().includes("home")) { router.replace("/"); setSearchQuery(""); }
									else if (shortItem?.url !== undefined && shortItem.short_url === searchQuery) {
										router.push(shortItem.url);
										setSearchQuery("");
									}

								}

							}}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
					</div>
				</div>
				<ScrollArea className="h-full w-full **:data-[slot=scroll-area-scrollbar]:hidden">
					<div className="pl-2 pr-3 pb-4">
						{filteredMenuGroups.map((group) => (
							<SidebarGroup key={group.label}>
								<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
								<SidebarGroupContent className="text-primary">
									<SidebarMenu>
										{group.items.map((item) => (
											<SidebarMenuItem key={item.title}>
												<RenderMenuItem item={item} level={0} searchQuery={searchQuery} />
											</SidebarMenuItem>
										))}
									</SidebarMenu>
								</SidebarGroupContent>
							</SidebarGroup>
						))}
					</div>
				</ScrollArea>
			</SidebarContent>
		</Sidebar >
	)
}
