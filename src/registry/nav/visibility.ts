import type { QueryResult } from "@/lib/search/types";
import { descendantsOf, NAV_FLAT, NAV_INDEX } from "./index";

/**
 * Expands a flat ranked query result into the set of tree node ids the sidebar
 * should show.
 *
 * The flat ladder answers "does this node match?". A tree needs two more rules,
 * both carried over from the pre-refactor sidebar:
 *
 *   - a matched branch reveals its whole subtree, so children that don't match
 *     individually still appear under a matched parent;
 *   - a matched node reveals its ancestors, so it isn't stranded inside a
 *     collapsed parent that has nothing to show for itself.
 *
 * Returns `undefined` for an empty query, meaning "no filter — show everything".
 * That distinction matters: an empty Set means "nothing matched".
 */
export function visibleNavIds(result: QueryResult): Set<string> | undefined {
	if (!result.query) return undefined;

	const visible = new Set<string>();

	for (let i = 0; i < result.matched; i++) {
		const offset = result.order[i];
		const entry = NAV_FLAT[offset];
		const id = entry.item.id;

		if (visible.has(id)) continue;
		visible.add(id);

		// Subtree.
		const descendants = descendantsOf.get(id);
		if (descendants) for (const child of descendants) visible.add(child);

		// Ancestors, walking up until we hit one already added — everything above
		// an added ancestor is added too, so there is no need to keep climbing.
		let parentId = entry.parentId;
		while (parentId !== null && !visible.has(parentId)) {
			visible.add(parentId);
			parentId = NAV_INDEX.byId.has(parentId)
				? NAV_FLAT[NAV_INDEX.byId.get(parentId)!].parentId
				: null;
		}
	}

	return visible;
}
