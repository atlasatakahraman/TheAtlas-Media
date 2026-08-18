import { NAV_FLAT, navById, routeOf } from "./index";

/**
 * Every nav id that should read as active for `pathname` — the deepest entry
 * whose route matches, plus its ancestors so the branches containing it are
 * highlighted and auto-expanded.
 *
 * Two things the previous implementation got wrong, both fixed here:
 *
 *   - it compared against the raw `url`, so any entry with a fragment
 *     ("/youtube/download/video#url") could never match a bare pathname;
 *   - it matched with a plain `startsWith`, so "/youtube/downloads" would light
 *     up "/youtube/download". Matching is segment-aligned instead.
 */
export function activeNavIds(pathname: string): Set<string> {
	const active = new Set<string>();

	const route = routeOf(pathname) ?? "/";
	let bestId: string | null = null;
	let bestLength = -1;

	for (const entry of NAV_FLAT) {
		const candidate = routeOf(entry.item.url);
		if (candidate === null || candidate === "/") continue;
		if (!isRoutePrefix(candidate, route)) continue;

		// Deepest wins: /youtube/download/video beats /youtube/download.
		if (candidate.length > bestLength) {
			bestLength = candidate.length;
			bestId = entry.item.id;
		}
	}

	let cursor = bestId;
	while (cursor !== null) {
		if (active.has(cursor)) break;
		active.add(cursor);
		cursor = navById.get(cursor)?.parentId ?? null;
	}

	return active;
}

/** True when `route` equals `candidate` or sits directly beneath it. */
function isRoutePrefix(candidate: string, route: string): boolean {
	if (route === candidate) return true;
	return route.startsWith(candidate) && route.charCodeAt(candidate.length) === 47; // "/"
}
