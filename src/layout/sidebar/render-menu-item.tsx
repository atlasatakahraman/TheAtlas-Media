// next@16.2.6 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-05-31
'use client';

import {
	SidebarMenuButton,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { cn, replaceTurkishLetters } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { MenuItem, RenderMenuItemProps } from "./types";
import { useRouter } from "next/navigation";

function containsActiveUrl(item: MenuItem, pathname: string): boolean {
	const normalized = pathname.length > 1 && pathname.endsWith("/")
		? pathname.slice(0, -1)
		: pathname;
	if (item.url && normalized.startsWith(item.url)) return true;
	if (item.items) {
		return item.items.some((child) => containsActiveUrl(child, pathname));
	}
	return false;
}

function escapeRegExp(string: string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeTurkishRegex(query: string): RegExp {
	const normalizedQuery = replaceTurkishLetters(query.toLowerCase());
	const regexPattern = normalizedQuery
		.split('')
		.map(char => {
			const escaped = escapeRegExp(char);
			if (escaped === 'g') return '[gğĞ]';
			if (escaped === 'u') return '[uüÜ]';
			if (escaped === 's') return '[sşŞ]';
			if (escaped === 'i') return '[ıiİI]';
			if (escaped === 'o') return '[oöÖ]';
			if (escaped === 'c') return '[cçÇ]';
			return escaped;
		})
		.join('');
	return new RegExp(`(${regexPattern})`, 'gi');
}

const HighlightText = ({ text, query }: { text: string; query?: string }) => {
	if (!query || !query.trim()) return <>{text}</>;
	if (makeTurkishRegex(query) && text.split(makeTurkishRegex(query)) && replaceTurkishLetters(query.toLowerCase())) {
		const regex = makeTurkishRegex(query);
		const parts = text.split(regex);
		const normalizedQuery = replaceTurkishLetters(query.toLowerCase());
		return (
			<>
				{parts.map((part, i) =>
					replaceTurkishLetters(part.toLowerCase()) === normalizedQuery ? (
						<span key={i} className="font-semibold text-primary">
							{part}
						</span>
					) : (
						<span key={i}>{part}</span>
					)
				)}
			</>
		);
	} else {
		return <>{text}</>;
	}
};

const RenderMenuItem = ({
	item,
	level = 0,
	parentPath = "",
	searchQuery,
}: RenderMenuItemProps) => {
	const itemPath = `${parentPath}-${item.title}`;
	const { open: sidebarOpen } = useSidebar();
	const router = useRouter();

	const isActive = useMemo(
		() => item.items ? containsActiveUrl(item, "") : false,
		[item]
	);

	const [userToggledGroups, setUserToggledGroups] = useState<Record<string, boolean>>({});

	const openGroups = useMemo(
		() => ({
			...(isActive ? { [itemPath]: true } : {}),
			...userToggledGroups,
		}),
		[isActive, itemPath, userToggledGroups]
	);

	const toggleGroup = useCallback((path: string) => {
		setUserToggledGroups((prev) => {
			const currentState = prev[path] !== undefined ? prev[path] : (isActive && path === itemPath);
			return {
				...prev,
				[path]: !currentState,
			};
		});
	}, [isActive, itemPath]);

	const hasChildren = item.items && item.items.length > 0;
	const isExpanded = (searchQuery && searchQuery.trim().length > 0) ? true : openGroups[itemPath];

	if (hasChildren) {
		const SubMenuComponent = level === 0 ? SidebarMenuSub : "div";
		const SubItemComponent = level === 0 ? SidebarMenuSubItem : "div";
		const SubButtonComponent = level === 0 ? SidebarMenuButton : SidebarMenuSubButton;

		return (
			<>
				{level === 0 ? (
					<SidebarMenuButton
						onClick={sidebarOpen ? () => toggleGroup(itemPath) : undefined}
						aria-expanded={isExpanded}
						aria-controls={`submenu-${itemPath}`}
						className={cn(
							"group/menu-button",
							!sidebarOpen && "pointer-events-none",
							!sidebarOpen && "opacity-50"
						)}
					>
						{item.icon && <item.icon className="h-4 w-4" />}
						<span className="flex-1 text-left">
							<HighlightText text={item.title} query={searchQuery} />
						</span>
						{item.badge && (
							<span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground ml-auto mr-2">
								{item.badge}
							</span>
						)}
						<ChevronRight
							className={cn(
								"ml-auto h-4 w-4 transition-transform duration-200",
								isExpanded && "rotate-90"
							)}
						/>
					</SidebarMenuButton>
				) : (
					<SubButtonComponent
						onClick={() => toggleGroup(itemPath)}
						aria-expanded={isExpanded}
						aria-controls={`submenu-${itemPath}`}
						className="justify-between w-full"
					>
						<div className="flex items-center gap-2">
							{item.icon && <item.icon className="h-4 w-4" />}
							<span>
								<HighlightText text={item.title} query={searchQuery} />
							</span>
							{item.badge && (
								<span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
									{item.badge}
								</span>
							)}
						</div>
						<ChevronRight
							className={cn(
								"h-4 w-4 transition-transform duration-200",
								isExpanded && "rotate-90"
							)}
						/>
					</SubButtonComponent>
				)}
				<div
					id={`submenu-${itemPath}`}
					data-state={isExpanded && sidebarOpen ? "open" : "closed"}
					className={cn(
						"grid grid-rows-[0fr] data-[state=open]:grid-rows-[1fr] transition-[grid-template-rows, opacity] duration-300 ease-in-out",
						isExpanded && sidebarOpen
							? "opacity-100"
							: "opacity-0"
					)}
					role="region"
					aria-labelledby={`button-${itemPath}`}
				>
					<div className="overflow-hidden min-h-0">
						<SubMenuComponent className={level > 0 ? "ml-4 border-l pl-2" : ""}>
							{item.items!.map((subItem, subIndex) => (
								<SubItemComponent
									key={`${subItem.title}-${subIndex}`}
									className={cn(
										"transition duration-200 ease-in-out",
										isExpanded && sidebarOpen
											? "translate-x-0 opacity-100"
											: "-translate-x-4 opacity-0"
									)}
									style={{
										transitionDelay: isExpanded && sidebarOpen
											? `${subIndex * 50}ms`
											: "0ms",
									}}
								>
									<RenderMenuItem
										item={subItem}
										level={level + 1}
										parentPath={itemPath}
										searchQuery={searchQuery}
									/>
								</SubItemComponent>
							))}
						</SubMenuComponent>
					</div>
				</div>
			</>
		);
	}

	const MenuComponent = level === 0 ? SidebarMenuButton : SidebarMenuSubButton;


	if (item.url) {

		return (
			<MenuComponent onClick={() => router.push(item.url!)} className="cursor-pointer">
				{item.icon && <item.icon className="h-4 w-4" />}
				<span className="flex-1">
					<HighlightText text={item.title} query={searchQuery} />
				</span>
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
			<span className="flex-1">
				<HighlightText text={item.title} query={searchQuery} />
			</span>
			{item.badge && (
				<span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground ml-auto">
					{item.badge}
				</span>
			)}
		</MenuComponent>
	);
};

export default RenderMenuItem;
