// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-06-21
"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useWindow } from "@/hooks/use-window";
import { resolveHeaderSlots, resolvePageTitle } from "./functions";
import { usePageHeaderOverride } from "./use-page-header";
import type { HeaderArea, HeaderSlotContext } from "./types";

/**
 * The header renders whatever `HEADER_SLOTS` declares — it holds no widget
 * logic of its own. The dependency badge, theme toggle, and window controls
 * that used to be inlined here now live in `src/components/header/*` and are
 * registered as slots.
 */
export default function Header() {
	const pathname = usePathname();
	const override = usePageHeaderOverride();
	const windowState = useWindow();

	// Wayland cannot move a window by dragging its chrome, so the drag region is
	// only claimed where the capability actually exists.
	const isDragRegion =
		windowState.status === "loading" || windowState.caps.canSetPosition;

	const ctx = useMemo<HeaderSlotContext>(() => {
		const resolved = resolvePageTitle(pathname);
		return {
			pathname,
			title: override.title ?? resolved.title,
			breadcrumb: override.breadcrumb ?? resolved.breadcrumb,
			entry: resolved.entry,
		};
	}, [pathname, override.title, override.breadcrumb]);

	return (
		<div
			className="flex-1 bg-secondary flex w-full min-h-16 max-h-16 select-none"
			data-tauri-drag-region={isDragRegion}
		>
			<div
				className="sticky flex-1 flex items-center gap-2 text-sm px-2 select-none border-b border-sidebar-border"
				data-tauri-drag-region={isDragRegion}
			>
				<div
					className="flex shrink-0 justify-start items-center gap-2 duration-500 animate-in slide-in-from-top-9 fade-in-0 transition-[opacity,transform] ease-out"
					data-tauri-drag-region
				>
					<Area area="left" ctx={ctx} />
				</div>

				<div
					className="flex-1 min-w-0 flex justify-center items-center gap-2"
					data-tauri-drag-region
				>
					<Area area="center" ctx={ctx} />
				</div>

				<div className="flex shrink-0 justify-end items-center" data-tauri-drag-region>
					<Area area="right" ctx={ctx} />
				</div>
			</div>
		</div>
	);
}

function Area({ area, ctx }: { area: HeaderArea; ctx: HeaderSlotContext }) {
	const slots = useMemo(() => resolveHeaderSlots(area, ctx), [area, ctx]);

	return (
		<>
			{slots.map(({ id, Component }) => (
				<Component key={id} ctx={ctx} />
			))}
		</>
	);
}
