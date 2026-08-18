import { NAV_FLAT, navById, navByUrl, routeOf } from "@/registry/nav";
import type { FlatNavItem } from "@/registry/nav/types";

const MAX_SUGGESTIONS = 4;

/**
 * Resolves what to show for a route that has no implementation yet.
 *
 * The whole point of a stub is that it costs nothing to author, so everything
 * here is derived: the title and breadcrumb come from the nav entry that owns
 * the route, and the suggestions come from walking outward through the tree.
 */
export function resolvePlannedView(pathname: string, navId?: string) {
	const entry = navId ? navById.get(navId) : findByRoute(pathname);

	return {
		entry,
		title: entry?.item.title ?? titleFromRoute(pathname),
		breadcrumb: entry?.trail ?? [],
		suggestions: entry ? suggestFor(entry) : readyIn(undefined).slice(0, MAX_SUGGESTIONS),
	};
}

/**
 * Nav entry for a pathname.
 *
 * Falls back to the nearest declared ancestor, so a route the registry does
 * not name individually still lands on a page titled after its parent rather
 * than a bare path segment.
 */
function findByRoute(pathname: string): FlatNavItem | undefined {
	let candidate = routeOf(pathname) ?? "/";
	while (candidate.length > 1) {
		const entry = navByUrl.get(candidate);
		if (entry) return entry;
		const slash = candidate.lastIndexOf("/");
		if (slash <= 0) break;
		candidate = candidate.slice(0, slash);
	}
	return undefined;
}

/**
 * Built routes worth offering instead, nearest first: siblings under the same
 * parent, then anything ready elsewhere in the same product group.
 */
function suggestFor(entry: FlatNavItem): FlatNavItem[] {
	const seen = new Set<string>([entry.item.id]);
	const out: FlatNavItem[] = [];

	const take = (candidates: readonly FlatNavItem[]) => {
		for (const candidate of candidates) {
			if (out.length >= MAX_SUGGESTIONS) return;
			if (seen.has(candidate.item.id)) continue;
			seen.add(candidate.item.id);
			out.push(candidate);
		}
	};

	take(readyIn(entry.group.id).filter((item) => item.parentId === entry.parentId));
	take(readyIn(entry.group.id));
	take(readyIn(undefined));

	return out;
}

/** Every leaf that is both implemented and navigable, optionally one group only. */
function readyIn(groupId: string | undefined): FlatNavItem[] {
	return NAV_FLAT.filter(
		(candidate) =>
			candidate.item.status === "ready" &&
			Boolean(candidate.item.url) &&
			(groupId === undefined || candidate.group.id === groupId)
	);
}

function titleFromRoute(pathname: string): string {
	const route = routeOf(pathname) ?? "/";
	const segment = route.slice(route.lastIndexOf("/") + 1);
	if (!segment) return "This page";
	return segment
		.split(/[-_]/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}
