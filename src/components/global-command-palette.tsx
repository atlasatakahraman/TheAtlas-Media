"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { Badge } from "@/components/ui/badge";
import { getSidebarMenuGroups } from "@/layout/sidebar/data";
import type { MenuGroup, MenuItem } from "@/layout/sidebar/types";
import { cn, replaceTurkishLetters } from "@/lib/utils";

type FlattenedCommandItem = {
	id: string;
	title: string;
	breadcrumb: string;
	icon?: React.ComponentType<{ className?: string }>;
	url?: string;
	short_url?: string;
	badge?: string | number;
	action?: () => void;
};

type SearchIndexEntry = {
	id: string;
	item: FlattenedCommandItem;
	groupLabel: string;
	normTitle: string;
	normBreadcrumb: string;
	normShortUrl: string;
	normGroup: string;
	normCombined: string;
};

function escapeRegExp(string: string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const turkishRegexCache = new Map<string, RegExp>();

function getCachedTurkishRegex(query: string): RegExp {
	const cached = turkishRegexCache.get(query);
	if (cached) return cached;

	const normalizedQuery = replaceTurkishLetters(query.toLowerCase());
	const regexPattern = normalizedQuery
		.split("")
		.map((char) => {
			const escaped = escapeRegExp(char);
			if (escaped === "g") return "[gğĞ]";
			if (escaped === "u") return "[uüÜ]";
			if (escaped === "s") return "[sşŞ]";
			if (escaped === "i") return "[ıiİI]";
			if (escaped === "o") return "[oöÖ]";
			if (escaped === "c") return "[cçÇ]";
			return escaped;
		})
		.join("");

	const re = new RegExp(`(${regexPattern})`, "gi");
	// Cap cache size to avoid memory leaks
	if (turkishRegexCache.size > 200) {
		turkishRegexCache.clear();
	}
	turkishRegexCache.set(query, re);
	return re;
}

const HighlightText = React.memo(function HighlightText({
	text,
	query,
	fullMatch,
}: {
	text: string;
	query?: string;
	fullMatch?: boolean;
}) {
	const trimmedQuery = query?.trim().toLowerCase();

	const parts = React.useMemo(() => {
		if (!trimmedQuery) return null;
		if (fullMatch) return [{ key: 0, part: text, match: true }];

		const queryRegex = getCachedTurkishRegex(trimmedQuery);
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
					<span key={key} className="font-semibold text-primary transition-colors duration-150">
						{part}
					</span>
				) : (
					<span key={key}>{part}</span>
				)
			)}
		</>
	);
});

function flattenGroup(group: MenuGroup): FlattenedCommandItem[] {
	const result: FlattenedCommandItem[] = [];

	function walk(item: MenuItem, parentBreadcrumb: string) {
		const currentBreadcrumb = parentBreadcrumb
			? `${parentBreadcrumb} › ${item.title}`
			: item.title;

		if (item.url || item.action) {
			result.push({
				id: `${group.label}-${currentBreadcrumb}-${item.short_url || ""}`,
				title: item.title,
				breadcrumb: currentBreadcrumb,
				icon: item.icon,
				url: item.url,
				short_url: item.short_url,
				badge: item.badge,
				action: item.action,
			});
		}

		if (item.items && item.items.length > 0) {
			item.items.forEach((child) => walk(child, currentBreadcrumb));
		}
	}

	group.items.forEach((item) => walk(item, ""));
	return result;
}

const Collapse = ({
	open,
	className,
	children,
}: {
	open: boolean;
	className?: string;
	children: React.ReactNode;
}) => (
	<div
		data-state={open ? "open" : "closed"}
		className={cn(
			"grid grid-rows-[0fr] data-[state=open]:grid-rows-[1fr] transition-[grid-template-rows,opacity] duration-300 ease-in-out",
			open ? "opacity-100" : "opacity-0 pointer-events-none",
			className
		)}
	>
		<div className="overflow-hidden min-h-0">
			{children}
		</div>
	</div>
);

export function GlobalCommandPalette() {
	const [open, setOpen] = React.useState(false);
	const [searchQuery, setSearchQuery] = React.useState("");
	const router = useRouter();

	// 1. Static menu structure
	const menuGroups = React.useMemo(() => getSidebarMenuGroups(), []);

	// 2. Flattened groups
	const flattenedGroups = React.useMemo(() => {
		return menuGroups.map((group) => ({
			label: group.label,
			items: flattenGroup(group),
		}));
	}, [menuGroups]);

	// 3. Precomputed Turkish-folded Search Index (built once from static data)
	const searchIndex = React.useMemo(() => {
		const entries: SearchIndexEntry[] = [];
		flattenedGroups.forEach((group) => {
			const normGroup = replaceTurkishLetters(group.label.toLowerCase());
			group.items.forEach((item) => {
				const normTitle = replaceTurkishLetters(item.title.toLowerCase());
				const normBreadcrumb = replaceTurkishLetters(item.breadcrumb.toLowerCase());
				const normShortUrl = item.short_url
					? replaceTurkishLetters(item.short_url.toLowerCase())
					: "";
				entries.push({
					id: item.id,
					item,
					groupLabel: group.label,
					normTitle,
					normBreadcrumb,
					normShortUrl,
					normGroup,
					normCombined: `${normTitle} ${normBreadcrumb} ${normGroup} ${normShortUrl}`,
				});
			});
		});
		return entries;
	}, [flattenedGroups]);

	// 4. Precomputed O(1) short_url lookup
	const shortUrlIndex = React.useMemo(() => {
		const map = new Map<string, FlattenedCommandItem>();
		searchIndex.forEach((entry) => {
			if (entry.normShortUrl) {
				map.set(entry.normShortUrl, entry.item);
			}
		});
		return map;
	}, [searchIndex]);

	// 5. Deferred query so typing input stays at instantaneous 60fps
	const deferredQuery = React.useDeferredValue(searchQuery);

	// 6. Highly optimized visibility map evaluation
	const { itemVisibility, highlightWholeTitleMap, hasAnyVisible } = React.useMemo(() => {
		const trimmed = deferredQuery.trim();
		const visMap = new Map<string, boolean>();
		const highlightMap = new Map<string, boolean>();

		if (!trimmed) {
			searchIndex.forEach((entry) => {
				visMap.set(entry.id, true);
				highlightMap.set(entry.id, false);
			});
			return {
				itemVisibility: visMap,
				highlightWholeTitleMap: highlightMap,
				hasAnyVisible: true,
			};
		}

		const query = replaceTurkishLetters(trimmed.toLowerCase());
		const words = query.split(/\s+/).filter(Boolean);
		let visibleCount = 0;

		searchIndex.forEach((entry) => {
			let isVisible = false;
			let isFullTitleHighlight = false;

			// Priority 1: Exact short_url match (e.g. 'ytdv')
			if (entry.normShortUrl && entry.normShortUrl === query) {
				isVisible = true;
				isFullTitleHighlight = true;
			}
			// Priority 2: Title exact match
			else if (entry.normTitle === query) {
				isVisible = true;
			}
			// Priority 3: Short_url starts with query (e.g. 'ytd' -> 'ytdv', 'ytdp')
			else if (entry.normShortUrl && entry.normShortUrl.startsWith(query)) {
				isVisible = true;
				isFullTitleHighlight = !entry.normTitle.includes(query);
			}
			// Priority 4: Title starts with / includes query
			else if (entry.normTitle.includes(query)) {
				isVisible = true;
			}
			// Priority 5: Breadcrumb includes query
			else if (entry.normBreadcrumb.includes(query)) {
				isVisible = true;
			}
			// Priority 6: Group label includes query
			else if (entry.normGroup.includes(query)) {
				isVisible = true;
			}
			// Priority 7: Multi-word query where all words exist in combined text
			else if (words.length > 1 && words.every((w) => entry.normCombined.includes(w))) {
				isVisible = true;
			}

			if (isVisible) visibleCount++;
			visMap.set(entry.id, isVisible);
			highlightMap.set(entry.id, isFullTitleHighlight);
		});

		return {
			itemVisibility: visMap,
			highlightWholeTitleMap: highlightMap,
			hasAnyVisible: visibleCount > 0,
		};
	}, [searchIndex, deferredQuery]);

	// Keyboard shortcut listener
	React.useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const isCtrlOrCmd = e.ctrlKey || e.metaKey;
			const isSpace = e.code === "Space" || e.key === " " || e.key === "Spacebar";
			const isK = e.key === "k" || e.key === "K";

			if (isCtrlOrCmd && (isSpace || isK)) {
				e.preventDefault();
				setOpen((prev) => !prev);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	const handleSelectItem = React.useCallback(
		(item: FlattenedCommandItem) => {
			setOpen(false);
			if (item.url) {
				router.push(item.url);
			} else if (item.action) {
				item.action();
			}
		},
		[router]
	);

	const handleOpenChange = React.useCallback((nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) {
			setSearchQuery("");
		}
	}, []);

	return (
		<CommandDialog
			open={open}
			onOpenChange={handleOpenChange}
			filter={() => 1}
			title="Command Palette"
			description="Search tools, commands, and shortcuts..."
		>
			<CommandInput
				value={searchQuery}
				onValueChange={setSearchQuery}
				onKeyDown={(e) => {
					if (e.key === "Enter" && searchQuery.trim()) {
						const trimmed = replaceTurkishLetters(searchQuery.trim().toLowerCase());
						const matched = shortUrlIndex.get(trimmed);
						if (matched) {
							e.preventDefault();
							handleSelectItem(matched);
						}
					}
				}}
				placeholder="Search tools or type shortcut (e.g. ytdv)..."
			/>
			<CommandList className="max-h-[380px] p-1">
				{!hasAnyVisible && (
					<CommandEmpty>No tools or commands found.</CommandEmpty>
				)}
				{flattenedGroups.map((group) => {
					const groupHasVisible = group.items.some((i) => itemVisibility.get(i.id));
					return (
						<Collapse key={group.label} open={groupHasVisible}>
							<CommandGroup heading={group.label}>
								{group.items.map((item) => {
									const isVisible = itemVisibility.get(item.id) ?? false;
									const highlightWholeTitle =
										highlightWholeTitleMap.get(item.id) ?? false;

									return (
										<Collapse key={item.id} open={isVisible}>
											<CommandItem
												disabled={!isVisible}
												value={`${item.short_url || ""}::${item.title}::${item.breadcrumb}::${group.label}`}
												onSelect={() => handleSelectItem(item)}
												className="flex items-center gap-2.5 px-3 py-2 cursor-pointer group"
											>
												{item.icon && (
													<item.icon className="h-4 w-4 text-muted-foreground transition-transform duration-200 ease-out group-hover:scale-115 group-data-selected:scale-115 group-data-selected:text-foreground shrink-0" />
												)}
												<div className="flex flex-col min-w-0 flex-1">
													<span className="text-sm font-medium text-foreground truncate">
														<HighlightText
															text={item.title}
															query={searchQuery}
															fullMatch={highlightWholeTitle}
														/>
													</span>
													{item.breadcrumb !== item.title && (
														<span className="text-[10px] text-muted-foreground truncate">
															<HighlightText text={item.breadcrumb} query={searchQuery} />
														</span>
													)}
												</div>
												{item.badge && (
													<Badge
														variant="secondary"
														className="text-[10px] px-1.5 py-0 rounded-full shrink-0"
													>
														{item.badge}
													</Badge>
												)}
												{item.short_url && (
													<CommandShortcut>
														<Kbd>
															<HighlightText text={item.short_url} query={searchQuery} />
														</Kbd>
													</CommandShortcut>
												)}
											</CommandItem>
										</Collapse>
									);
								})}
							</CommandGroup>
						</Collapse>
					);
				})}
			</CommandList>
		</CommandDialog>
	);
}
