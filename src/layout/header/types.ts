import type { ComponentType } from "react";
import type { FlatNavItem } from "@/registry/nav/types";

export type HeaderArea = "left" | "center" | "right";

/** What every slot is told about the current page. */
export type HeaderSlotContext = {
	pathname: string;
	/** Runtime override if a page set one, otherwise the registry title. */
	title: string;
	/** Ancestor titles, outermost first. Excludes `title`. */
	breadcrumb: readonly string[];
	/** The registry entry behind this route, if any. */
	entry: FlatNavItem | undefined;
};

export type HeaderSlotProps = {
	ctx: HeaderSlotContext;
};

/**
 * One registered piece of header UI.
 *
 * Adding a header widget is appending an entry to `HEADER_SLOTS` — no edit to
 * `Header.tsx`. `when` keeps conditional widgets declarative rather than
 * becoming another `&&` inside the layout.
 */
export type HeaderSlot = {
	id: string;
	area: HeaderArea;
	/** Ascending. Ties fall back to declaration order. */
	order: number;
	when?: (ctx: HeaderSlotContext) => boolean;
	Component: ComponentType<HeaderSlotProps>;
};

/** Runtime header state a page can push, e.g. "Downloading — 42%". */
export type PageHeaderOverride = {
	title?: string;
	breadcrumb?: readonly string[];
};
