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
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { HighlightText } from "@/lib/search/highlight";
import { resolveShortcut } from "@/lib/search/query";
import NavIcon from "@/registry/icon";
import type { FlatNavItem } from "@/registry/nav/types";
import { MAX_VISIBLE_ROWS, PALETTE_INDEX, queryPalette, rowValue } from "./functions";

/**
 * Ctrl/Cmd+K palette over the nav registry.
 *
 * Results are ranked, not source-ordered — an exact shortcut beats an exact
 * title beats a prefix, and so on down the ladder in `lib/search/query`. That
 * is why rows are a flat list rather than grouped: grouping would reassert
 * declaration order over the ranking. The group is still visible, as the first
 * segment of each row's breadcrumb.
 */
export default function CommandPalette() {
	const [open, setOpen] = React.useState(false);
	const [searchQuery, setSearchQuery] = React.useState("");
	const router = useRouter();

	// Refinement memory lives inside the search engine, keyed by index — no ref
	// to read during render.
	const { rows, overflow } = React.useMemo(() => queryPalette(searchQuery), [searchQuery]);

	React.useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const isCtrlOrCmd = e.ctrlKey || e.metaKey;
			const isSpace = e.code === "Space" || e.key === " " || e.key === "Spacebar";
			const isK = e.key === "k" || e.key === "K";

			if (isCtrlOrCmd && (isSpace || isK)) {
				e.preventDefault();
				setOpen((previous) => !previous);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	const handleSelect = React.useCallback(
		(entry: FlatNavItem) => {
			setOpen(false);
			setSearchQuery("");
			if (entry.item.url) router.push(entry.item.url);
			else entry.item.action?.();
		},
		[router]
	);

	const handleOpenChange = React.useCallback((nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) setSearchQuery("");
	}, []);

	return (
		<CommandDialog
			open={open}
			onOpenChange={handleOpenChange}
			// Ranking and filtering are ours; cmdk must not reorder or hide.
			filter={() => 1}
			title="Command Palette"
			description="Search tools, commands, and shortcuts..."
		>
			<CommandInput
				value={searchQuery}
				onValueChange={setSearchQuery}
				onKeyDown={(e) => {
					// Enter on a complete shortcut jumps straight there, without
					// requiring the user to arrow down onto the row first.
					if (e.key !== "Enter" || !searchQuery.trim()) return;
					const matched = resolveShortcut(PALETTE_INDEX, searchQuery);
					if (matched) {
						e.preventDefault();
						handleSelect(matched);
					}
				}}
				placeholder="Search tools or type shortcut (e.g. ytdv)..."
			/>

			<CommandList className="max-h-[380px] p-1">
				{rows.length === 0 && <CommandEmpty>No tools or commands found.</CommandEmpty>}

				<CommandGroup>
					{rows.map((row) => {
						const { entry, fullTitle } = row;
						const planned = entry.item.status !== "ready";

						return (
							<CommandItem
								key={entry.item.id}
								value={rowValue(row)}
								onSelect={() => handleSelect(entry)}
								className="flex items-center gap-2.5 px-3 py-2 cursor-pointer group transition-opacity duration-150 ease-out"
							>
								<NavIcon
									name={entry.item.icon}
									className="h-4 w-4 text-muted-foreground transition-transform duration-200 ease-out group-hover:scale-115 group-data-selected:scale-115 group-data-selected:text-foreground shrink-0"
								/>

								<div className="flex flex-col min-w-0 flex-1">
									<span className="text-sm font-medium text-foreground truncate">
										<HighlightText
											text={entry.item.title}
											query={searchQuery}
											fullMatch={fullTitle}
										/>
									</span>
									<span className="text-[10px] text-muted-foreground truncate">
										<HighlightText text={entry.breadcrumb} query={searchQuery} />
									</span>
								</div>

								{planned && (
									<Badge
										variant="outline"
										className="text-[10px] px-1.5 py-0 rounded-full shrink-0 text-muted-foreground"
									>
										Planned
									</Badge>
								)}

								{entry.item.badge && (
									<Badge
										variant="secondary"
										className="text-[10px] px-1.5 py-0 rounded-full shrink-0"
									>
										{entry.item.badge}
									</Badge>
								)}

								{entry.item.shortcut && (
									<CommandShortcut>
										<Kbd>
											<HighlightText text={entry.item.shortcut} query={searchQuery} />
										</Kbd>
									</CommandShortcut>
								)}
							</CommandItem>
						);
					})}
				</CommandGroup>

				{overflow > 0 && (
					<div className="px-3 py-2 text-[10px] text-muted-foreground select-none">
						{overflow} more {overflow === 1 ? "result" : "results"} — showing the top{" "}
						{MAX_VISIBLE_ROWS}. Keep typing to narrow.
					</div>
				)}
			</CommandList>
		</CommandDialog>
	);
}
