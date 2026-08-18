// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-06-21
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

const HighlightText = ({ text, query, fullMatch }: { text: string; query?: string; fullMatch?: boolean }) => {
	const trimmedQuery = query?.trim().toLowerCase();

	// Memoized per (text, query, fullMatch) — this renders once per menu item,
	// so avoiding a fresh regex + split on every unrelated re-render (sibling
	// expand/collapse, etc.) matters at tree scale.
	const parts = useMemo(() => {
		if (!trimmedQuery) return null;

		// The query matched this item only through its short_url (not through the
		// title itself) — there's no literal substring position to highlight, so
		// the whole title is highlighted to signal "this is the match".
		if (fullMatch) return [{ key: 0, part: text, match: true }];

		const queryRegex = makeTurkishRegex(trimmedQuery);
		const normalizedQuery = replaceTurkishLetters(trimmedQuery);

		return text.split(queryRegex).map((part, i) => ({
			key: i,
			part,
			match: replaceTurkishLetters(part.toLowerCase()) === normalizedQuery,
		}));
	}, [text, trimmedQuery, fullMatch]);

	if (!parts) return <>{text}</>;

	return (
		<>
			{parts.map(({ key, part, match }) =>
				match ? (
					<span key={key} className="font-semibold text-primary">
						{part}
					</span>
				) : (
					<span key={key}>{part}</span>
				)
			)}
		</>
	);
};

// Shared collapse primitive — a height+opacity transition via CSS grid rows.
// Content stays mounted in both states; only the grid track animates, which is
// what makes the transition possible (an unmounted node can't animate out).
// Used both for a group's own expand/collapse toggle and — now — for hiding an
// item that no longer matches an active search, so both cases animate identically.
const Collapse = ({
	open,
	id,
	ariaLabelledBy,
	className,
	children,
}: {
	open: boolean;
	id?: string;
	ariaLabelledBy?: string;
	className?: string;
	children: React.ReactNode;
}) => (
	<div
		id={id}
		data-state={open ? "open" : "closed"}
		role={id ? "region" : undefined}
		aria-labelledby={ariaLabelledBy}
		className={cn(
			"grid grid-rows-[0fr] data-[state=open]:grid-rows-[1fr] transition-[grid-template-rows,opacity] duration-300 ease-in-out",
			open ? "opacity-100" : "opacity-0",
			className
		)}
	>
		<div className="overflow-hidden min-h-0">
			{children}
		</div>
	</div>
);

const RenderMenuItem = ({
	item,
	level = 0,
	parentPath = "",
	searchQuery,
	visibleItems,
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

	// Whether THIS item (title row + its whole subtree) should be shown at all.
	// `visibleItems` undefined means no filter is active — everything is visible.
	// This is independent from `isExpanded`, which only governs whether an
	// already-visible group's children are expanded or collapsed.
	const visible = !visibleItems || visibleItems.has(item);

	// True when the active query matched this leaf item's short_url but not its
	// title — the title still needs to light up so the match is visible even
	// though no short_url badge is shown.
	const highlightWholeTitle = useMemo(() => {
		if (hasChildren || !searchQuery) return false;
		const query = replaceTurkishLetters(searchQuery.trim().toLowerCase());
		if (!query) return false;

		const titleMatches = replaceTurkishLetters(item.title.toLowerCase()).includes(query);
		if (titleMatches) return false;

		return !!item.short_url && replaceTurkishLetters(item.short_url.toLowerCase()).includes(query);
	}, [hasChildren, item.title, item.short_url, searchQuery]);

	let content: React.ReactNode;

	if (hasChildren) {
		const SubMenuComponent = level === 0 ? SidebarMenuSub : "div";
		const SubItemComponent = level === 0 ? SidebarMenuSubItem : "div";
		const SubButtonComponent = level === 0 ? SidebarMenuButton : SidebarMenuSubButton;

		content = (
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
						{item.icon && (
							<item.icon className="h-4 w-4 transition-transform duration-200 ease-out group-hover/menu-button:scale-115 group-hover/menu-button:-rotate-6" />
						)}
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
								"ml-auto h-4 w-4 transition-transform duration-200 ease-out",
								isExpanded && "rotate-90"
							)}
						/>
					</SidebarMenuButton>
				) : (
					<SubButtonComponent
						onClick={() => toggleGroup(itemPath)}
						aria-expanded={isExpanded}
						aria-controls={`submenu-${itemPath}`}
						className="justify-between w-full group/sub-button"
					>
						<div className="flex items-center gap-2">
							{item.icon && (
								<item.icon className="h-4 w-4 transition-transform duration-200 ease-out group-hover/sub-button:scale-115 group-hover/sub-button:-rotate-6" />
							)}
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
								"h-4 w-4 transition-transform duration-200 ease-out",
								isExpanded && "rotate-90"
							)}
						/>
					</SubButtonComponent>
				)}
				<Collapse
					open={isExpanded && sidebarOpen}
					id={`submenu-${itemPath}`}
					ariaLabelledBy={`button-${itemPath}`}
				>
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
									visibleItems={visibleItems}
								/>
							</SubItemComponent>
						))}
					</SubMenuComponent>
				</Collapse>
			</>
		);
	} else {
		const MenuComponent = level === 0 ? SidebarMenuButton : SidebarMenuSubButton;

		content = item.url ? (
			<MenuComponent onClick={() => router.push(item.url!)} className="cursor-pointer group/menu-button">
				{item.icon && (
					<item.icon className="h-4 w-4 transition-transform duration-200 ease-out group-hover/menu-button:scale-115 group-hover/menu-button:-rotate-6" />
				)}
				<span className="flex-1">
					<HighlightText text={item.title} query={searchQuery} fullMatch={highlightWholeTitle} />
				</span>
				{item.badge && (
					<span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground ml-auto">
						{item.badge}
					</span>
				)}
			</MenuComponent>
		) : (
			<MenuComponent onClick={item.action} className="cursor-pointer group/menu-button">
				{item.icon && (
					<item.icon className="h-4 w-4 transition-transform duration-200 ease-out group-hover/menu-button:scale-115 group-hover/menu-button:-rotate-6" />
				)}
				<span className="flex-1">
					<HighlightText text={item.title} query={searchQuery} fullMatch={highlightWholeTitle} />
				</span>
				{item.badge && (
					<span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground ml-auto">
						{item.badge}
					</span>
				)}
			</MenuComponent>
		);
	}

	// Everything renders through this same Collapse — a filtered-out item closes
	// with the identical grid-rows/opacity transition a group uses when you
	// manually collapse it, instead of disappearing the instant it stops matching.
	return <Collapse open={visible}>{content}</Collapse>;
};

export default RenderMenuItem;
