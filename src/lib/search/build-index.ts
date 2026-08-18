import { fold } from "./normalize";
import type { SearchIndex, SearchRecord } from "./types";

/**
 * Builds the struct-of-arrays index once, at module scope, for a fixed item
 * list. Everything the query scan needs is pre-folded here so a keystroke never
 * pays normalization cost.
 *
 * `project` maps an item to its searchable fields. It runs exactly once per
 * item, so it is free to be expensive (walking ancestors for a breadcrumb, etc).
 */
export function buildSearchIndex<T>(
	items: readonly T[],
	project: (item: T, index: number) => SearchRecord
): SearchIndex<T> {
	const size = items.length;

	const ids: string[] = new Array(size);
	const titles: string[] = new Array(size);
	const shortcuts: string[] = new Array(size);
	const breadcrumbs: string[] = new Array(size);
	const groups: string[] = new Array(size);
	const combined: string[] = new Array(size);

	const byId = new Map<string, number>();
	const byShortcut = new Map<string, number>();
	const buckets = new Map<string, number[]>();

	for (let i = 0; i < size; i++) {
		const record = project(items[i], i);

		const title = fold(record.title);
		const shortcut = record.shortcut ? fold(record.shortcut) : "";
		const breadcrumb = record.breadcrumb ? fold(record.breadcrumb) : "";
		const group = record.group ? fold(record.group) : "";
		const keywords = record.keywords?.length
			? record.keywords.map(fold).join(" ")
			: "";

		ids[i] = record.id;
		titles[i] = title;
		shortcuts[i] = shortcut;
		breadcrumbs[i] = breadcrumb;
		groups[i] = group;

		// Space-joined so a multi-word scan can never match across a field
		// boundary as if it were one token.
		const haystack = `${title} ${breadcrumb} ${group} ${shortcut} ${keywords}`;
		combined[i] = haystack;

		// First writer wins for both maps — a duplicate id or shortcut is a
		// registry authoring bug, and P1's nav registry throws on it in dev.
		if (!byId.has(record.id)) byId.set(record.id, i);
		if (shortcut && !byShortcut.has(shortcut)) byShortcut.set(shortcut, i);

		// 2-gram buckets over the full haystack, including bigrams that span a
		// space — a query is trimmed but may contain interior spaces, and the
		// bucket must stay a strict superset of the match set.
		let seen: Set<string> | null = null;
		for (let p = 0; p + 1 < haystack.length; p++) {
			const key = haystack.slice(p, p + 2);
			if (seen === null) seen = new Set<string>();
			if (seen.has(key)) continue;
			seen.add(key);

			const bucket = buckets.get(key);
			if (bucket) bucket.push(i);
			else buckets.set(key, [i]);
		}
	}

	// Freeze the buckets into typed arrays: they are read on every keystroke and
	// never mutated again.
	const prefixBuckets = new Map<string, Int32Array>();
	for (const [key, offsets] of buckets) {
		prefixBuckets.set(key, Int32Array.from(offsets));
	}

	return {
		items,
		size,
		ids,
		titles,
		shortcuts,
		breadcrumbs,
		groups,
		combined,
		byId,
		byShortcut,
		prefixBuckets,
	};
}

/** Convenience for the common "look up the item behind an offset" step. */
export function itemAt<T>(index: SearchIndex<T>, offset: number): T {
	return index.items[offset];
}
