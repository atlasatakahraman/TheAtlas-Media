import type { NavItem } from "@/registry/nav/types";

export type RenderMenuItemProps = {
	item: NavItem;
	level?: number;
	searchQuery?: string;
	/**
	 * Ids present in this set are shown; everything else collapses using the
	 * same transition as an expand/collapse instead of unmounting. `undefined`
	 * means no filter is active, so everything is visible.
	 */
	visibleIds?: Set<string>;
	/** Ids on the path to the current route — auto-expanded and highlighted. */
	activeIds: Set<string>;
	/** Ids whose match came through a non-displayed field; highlight the whole
	 *  title rather than a substring. */
	fullTitleIds?: Set<string>;
};
