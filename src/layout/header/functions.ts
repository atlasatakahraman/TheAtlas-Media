import { navByUrl, routeOf } from "@/registry/nav";
import type { FlatNavItem } from "@/registry/nav/types";
import { HEADER_SLOTS } from "./data";
import type { HeaderArea, HeaderSlot, HeaderSlotContext } from "./types";

export type ResolvedTitle = {
	title: string;
	breadcrumb: readonly string[];
	entry: FlatNavItem | undefined;
};

const ROOT_TITLE = "Home";

/**
 * Derives the page title and breadcrumb from the nav registry.
 *
 * Exact route first, then successively shorter ancestors — so a route the
 * registry does not name individually (`/youtube/download/video/advanced`)
 * still inherits a sensible title from its nearest declared parent instead of
 * falling back to a bare pathname.
 */
export function resolvePageTitle(pathname: string): ResolvedTitle {
	const route = routeOf(pathname) ?? "/";

	if (route === "/") {
		return { title: ROOT_TITLE, breadcrumb: [], entry: undefined };
	}

	let candidate = route;
	while (candidate.length > 1) {
		const entry = navByUrl.get(candidate);
		if (entry) {
			return { title: entry.item.title, breadcrumb: entry.trail, entry };
		}
		const slash = candidate.lastIndexOf("/");
		if (slash <= 0) break;
		candidate = candidate.slice(0, slash);
	}

	// Nothing in the registry covers this route — title it from the last path
	// segment rather than showing an empty header.
	const segment = route.slice(route.lastIndexOf("/") + 1);
	return { title: segment ? titleCase(segment) : ROOT_TITLE, breadcrumb: [], entry: undefined };
}

function titleCase(segment: string): string {
	return segment
		.split(/[-_]/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/** Slots for one area, filtered by `when` and sorted by `order`. */
export function resolveHeaderSlots(
	area: HeaderArea,
	ctx: HeaderSlotContext
): HeaderSlot[] {
	return HEADER_SLOTS.filter(
		(slot) => slot.area === area && (slot.when === undefined || slot.when(ctx))
	).sort((a, b) => a.order - b.order);
}
