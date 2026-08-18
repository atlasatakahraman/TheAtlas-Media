import { buildSearchIndex } from "@/lib/search/build-index";
import type { SearchIndex } from "@/lib/search/types";
import { CONVERT_GROUP } from "./convert";
import { MEDIA_GROUP } from "./media";
import { SYSTEM_GROUP } from "./system";
import { YOUTUBE_GROUP } from "./youtube";
import type { FlatNavItem, NavGroup, NavItem } from "./types";

/**
 * The nav tree, assembled from one file per product domain.
 *
 * Adding a page is an edit to exactly one of those files plus (if it uses a new
 * icon) one line in `registry/icons.ts`. Nothing here needs to change.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
	YOUTUBE_GROUP,
	CONVERT_GROUP,
	MEDIA_GROUP,
	SYSTEM_GROUP,
];

/** Every node in the tree, ancestry resolved, in depth-first declaration order. */
export const NAV_FLAT: readonly FlatNavItem[] = flatten(NAV_GROUPS);

function flatten(groups: readonly NavGroup[]): FlatNavItem[] {
	const flat: FlatNavItem[] = [];

	for (const group of groups) {
		const walk = (item: NavItem, trail: string[], level: number, parentId: string | null) => {
			flat.push({
				item,
				group,
				trail,
				breadcrumb: trail.join(" › "),
				level,
				parentId,
			});

			if (item.items) {
				const childTrail = [...trail, item.title];
				for (const child of item.items) {
					walk(child, childTrail, level + 1, item.id);
				}
			}
		};

		for (const item of group.items) walk(item, [group.label], 0, null);
	}

	return flat;
}

// ── Lookups ──────────────────────────────────────────────────────────────────

export const navById: ReadonlyMap<string, FlatNavItem> = new Map(
	NAV_FLAT.map((entry) => [entry.item.id, entry])
);

/** Keyed by pathname with any `#fragment` stripped and trailing slash removed. */
export const navByUrl: ReadonlyMap<string, FlatNavItem> = buildUrlMap();

export const navByShortcut: ReadonlyMap<string, FlatNavItem> = new Map(
	NAV_FLAT.filter((entry) => entry.item.shortcut).map((entry) => [
		entry.item.shortcut!.toLowerCase(),
		entry,
	])
);

function buildUrlMap(): Map<string, FlatNavItem> {
	const map = new Map<string, FlatNavItem>();
	for (const entry of NAV_FLAT) {
		const route = routeOf(entry.item.url);
		if (route !== null && !map.has(route)) map.set(route, entry);
	}
	return map;
}

/** Normalises a nav `url` to a comparable route: no fragment, no trailing slash. */
export function routeOf(url: string | undefined): string | null {
	if (!url) return null;
	const hash = url.indexOf("#");
	const bare = hash === -1 ? url : url.slice(0, hash);
	return bare.length > 1 && bare.endsWith("/") ? bare.slice(0, -1) : bare;
}

// ── Tree relationships ───────────────────────────────────────────────────────

/** id → ids of every descendant, so a matched branch can reveal its subtree. */
export const descendantsOf: ReadonlyMap<string, readonly string[]> = buildDescendants();

function buildDescendants(): Map<string, string[]> {
	const map = new Map<string, string[]>();

	const collect = (item: NavItem): string[] => {
		const out: string[] = [];
		if (item.items) {
			for (const child of item.items) {
				out.push(child.id, ...collect(child));
			}
		}
		map.set(item.id, out);
		return out;
	};

	for (const group of NAV_GROUPS) for (const item of group.items) collect(item);
	return map;
}

// ── Search ───────────────────────────────────────────────────────────────────

/**
 * The one shared index. Built at module scope, so the sidebar, the command
 * palette, and anything added later all query the same pre-folded data rather
 * than each building their own on mount.
 */
export const NAV_INDEX: SearchIndex<FlatNavItem> = buildSearchIndex(
	NAV_FLAT,
	(entry) => ({
		id: entry.item.id,
		title: entry.item.title,
		shortcut: entry.item.shortcut,
		breadcrumb: entry.breadcrumb,
		group: entry.group.label,
		// The URL is searchable but never displayed — the pre-refactor sidebar
		// matched on it, and dropping that would be a silent regression.
		keywords: entry.item.url
			? [...(entry.item.keywords ?? []), entry.item.url]
			: entry.item.keywords,
	})
);

// ── Dev-time validation ──────────────────────────────────────────────────────

/**
 * Authoring mistakes in the registry are silent at runtime and painful to
 * debug — a duplicate shortcut just means one of them never fires. Fail loudly
 * in development; stay silent in the shipped build.
 */
function validateRegistry(): void {
	const problems: string[] = [];

	const ids = new Set<string>();
	const urls = new Map<string, string>();
	const shortcuts = new Map<string, string>();

	for (const entry of NAV_FLAT) {
		const { id, url, shortcut, items } = entry.item;

		if (ids.has(id)) problems.push(`duplicate id "${id}"`);
		ids.add(id);

		// Keyed on the full url, fragment included: several entries deliberately
		// share one page and differ only by anchor (/youtube/format#1080p vs
		// #720p). Two entries pointing at the identical anchor is the real bug.
		if (url) {
			const owner = urls.get(url);
			if (owner) problems.push(`duplicate url "${url}" on "${id}" and "${owner}"`);
			else urls.set(url, id);
		}

		if (shortcut) {
			const key = shortcut.toLowerCase();
			const owner = shortcuts.get(key);
			if (owner) problems.push(`duplicate shortcut "${shortcut}" on "${id}" and "${owner}"`);
			else shortcuts.set(key, id);
		}

		if (!url && !items?.length && !entry.item.action) {
			problems.push(`"${id}" is a leaf with no url and no action — it does nothing`);
		}
	}

	if (problems.length) {
		throw new Error(
			`Nav registry is invalid:\n${problems.map((p) => `  - ${p}`).join("\n")}`
		);
	}
}

if (process.env.NODE_ENV !== "production") {
	validateRegistry();
}

export type { FlatNavItem, NavGroup, NavItem, NavStatus } from "./types";
