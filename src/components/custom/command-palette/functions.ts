import { buildSearchIndex } from "@/lib/search/build-index";
import { runQuery } from "@/lib/search/query";
import type { QueryResult, SearchIndex } from "@/lib/search/types";
import { NAV_FLAT } from "@/registry/nav";
import type { FlatNavItem } from "@/registry/nav/types";
import type { PaletteRow } from "./types";

/**
 * Only invokable entries. A branch node with no url and no action is a heading
 * in the tree, not something the palette can take you to.
 */
export const PALETTE_ENTRIES: readonly FlatNavItem[] = NAV_FLAT.filter(
	(entry) => !!entry.item.url || !!entry.item.action
);

/**
 * The palette's own index, built once at module scope.
 *
 * Kept separate from `NAV_INDEX` rather than filtering its results: offsets are
 * positional, so an index over a different item set has to be its own index.
 */
export const PALETTE_INDEX: SearchIndex<FlatNavItem> = buildSearchIndex(
	PALETTE_ENTRIES,
	(entry) => ({
		id: entry.item.id,
		title: entry.item.title,
		shortcut: entry.item.shortcut,
		breadcrumb: entry.breadcrumb,
		group: entry.group.label,
		keywords: entry.item.url
			? [...(entry.item.keywords ?? []), entry.item.url]
			: entry.item.keywords,
	})
);

/**
 * How many rows are rendered at once.
 *
 * The palette is a ranked list, so anything past the first screenful is
 * effectively unreachable by reading — and cmdk needs every selectable row
 * mounted for arrow-key navigation, which rules out windowing. Capping keeps
 * the mounted count bounded without breaking keyboard traversal.
 */
export const MAX_VISIBLE_ROWS = 60;

export type PaletteResult = {
	rows: PaletteRow[];
	/** Matches beyond `MAX_VISIBLE_ROWS`, reported rather than silently dropped. */
	overflow: number;
	result: QueryResult;
};

export function queryPalette(query: string, previous?: QueryResult): PaletteResult {
	const result = runQuery(PALETTE_INDEX, query, previous);
	const limit = Math.min(result.matched, MAX_VISIBLE_ROWS);

	const rows: PaletteRow[] = new Array(limit);
	for (let i = 0; i < limit; i++) {
		const offset = result.order[i];
		rows[i] = {
			entry: PALETTE_ENTRIES[offset],
			fullTitle: result.fullTitle[offset] === 1,
		};
	}

	return { rows, overflow: result.matched - limit, result };
}

/** Stable cmdk value for a row. Must be unique and stable across renders. */
export function rowValue(row: PaletteRow): string {
	return row.entry.item.id;
}
