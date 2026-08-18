// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-06-21
"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
	SidebarMenuButton,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { HighlightText } from "@/lib/search/highlight";
import { cn } from "@/lib/utils";
import NavIcon from "@/registry/icon";
import Collapse from "./collapse";
import { toggleGroup, useGroupExpanded } from "./store";
import type { RenderMenuItemProps } from "./types";

export default function RenderMenuItem({
	item,
	level = 0,
	searchQuery,
	visibleIds,
	activeIds,
	fullTitleIds,
}: RenderMenuItemProps) {
	const { open: sidebarOpen } = useSidebar();
	const router = useRouter();

	const hasChildren = !!item.items?.length;
	const isActive = activeIds.has(item.id);

	// Groups on the path to the current route open by default; an explicit
	// toggle overrides that. A live search force-expands everything so matches
	// deep in the tree are reachable without clicking through.
	const searching = !!searchQuery && searchQuery.trim().length > 0;
	const userExpanded = useGroupExpanded(item.id, isActive);
	const isExpanded = searching || userExpanded;

	const onToggle = useCallback(() => toggleGroup(item.id, isActive), [item.id, isActive]);

	// Independent from `isExpanded`: this governs whether the item exists in the
	// filtered view at all, not whether its children are showing.
	const visible = !visibleIds || visibleIds.has(item.id);
	const highlightWholeTitle = !!fullTitleIds?.has(item.id);

	const submenuId = `submenu-${item.id}`;

	const label = (
		<HighlightText
			text={item.title}
			query={searchQuery}
			fullMatch={highlightWholeTitle}
		/>
	);

	const badge = item.badge ? (
		<span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
			{item.badge}
		</span>
	) : null;

	let content: React.ReactNode;

	if (hasChildren) {
		const SubMenuComponent = level === 0 ? SidebarMenuSub : "div";
		const SubItemComponent = level === 0 ? SidebarMenuSubItem : "div";
		const SubButtonComponent = level === 0 ? SidebarMenuButton : SidebarMenuSubButton;

		content = (
			<>
				{level === 0 ? (
					<SidebarMenuButton
						onClick={sidebarOpen ? onToggle : undefined}
						aria-expanded={isExpanded}
						aria-controls={submenuId}
						data-active={isActive || undefined}
						className={cn(
							"group/menu-button",
							!sidebarOpen && "pointer-events-none opacity-50"
						)}
					>
						<NavIcon
							name={item.icon}
							className="h-4 w-4 transition-transform duration-200 ease-out group-hover/menu-button:scale-115 group-hover/menu-button:-rotate-6"
						/>
						<span className="flex-1 text-left">{label}</span>
						{badge && <span className="ml-auto mr-2">{badge}</span>}
						<ChevronRight
							className={cn(
								"ml-auto h-4 w-4 transition-transform duration-200 ease-out",
								isExpanded && "rotate-90"
							)}
						/>
					</SidebarMenuButton>
				) : (
					<SubButtonComponent
						onClick={onToggle}
						aria-expanded={isExpanded}
						aria-controls={submenuId}
						data-active={isActive || undefined}
						className="justify-between w-full group/sub-button"
					>
						<div className="flex items-center gap-2">
							<NavIcon
								name={item.icon}
								className="h-4 w-4 transition-transform duration-200 ease-out group-hover/sub-button:scale-115 group-hover/sub-button:-rotate-6"
							/>
							<span>{label}</span>
							{badge}
						</div>
						<ChevronRight
							className={cn(
								"h-4 w-4 transition-transform duration-200 ease-out",
								isExpanded && "rotate-90"
							)}
						/>
					</SubButtonComponent>
				)}
				<Collapse open={isExpanded && sidebarOpen} id={submenuId}>
					<SubMenuComponent className={level > 0 ? "ml-4 border-l pl-2" : ""}>
						{item.items!.map((subItem, subIndex) => (
							<SubItemComponent
								key={subItem.id}
								className={cn(
									"transition duration-200 ease-in-out",
									isExpanded && sidebarOpen
										? "translate-x-0 opacity-100"
										: "-translate-x-4 opacity-0"
								)}
								style={{
									transitionDelay:
										isExpanded && sidebarOpen ? `${subIndex * 50}ms` : "0ms",
								}}
							>
								<RenderMenuItem
									item={subItem}
									level={level + 1}
									searchQuery={searchQuery}
									visibleIds={visibleIds}
									activeIds={activeIds}
									fullTitleIds={fullTitleIds}
								/>
							</SubItemComponent>
						))}
					</SubMenuComponent>
				</Collapse>
			</>
		);
	} else {
		const MenuComponent = level === 0 ? SidebarMenuButton : SidebarMenuSubButton;
		const onSelect = item.url ? () => router.push(item.url!) : item.action;

		content = (
			<MenuComponent
				onClick={onSelect}
				data-active={isActive || undefined}
				className="cursor-pointer group/menu-button"
			>
				<NavIcon
					name={item.icon}
					className="h-4 w-4 transition-transform duration-200 ease-out group-hover/menu-button:scale-115 group-hover/menu-button:-rotate-6"
				/>
				<span className="flex-1">{label}</span>
				{badge && <span className="ml-auto">{badge}</span>}
			</MenuComponent>
		);
	}

	// Everything renders through this Collapse: a filtered-out item closes with
	// the same transition a group uses when manually collapsed, rather than
	// vanishing the instant it stops matching.
	return <Collapse open={visible}>{content}</Collapse>;
}
