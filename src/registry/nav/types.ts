import type { IconName } from "@/registry/icons";

/**
 * Whether the route behind this entry exists.
 *
 * The sidebar declares roughly 97 routes and about five are built. `status` is
 * what lets the tree stay an honest product map: "planned" entries render a
 * PlannedFeature page instead of a silent 404, and the structure check refuses
 * to let a "ready" entry point at a route with no page.
 */
export type NavStatus = "ready" | "planned" | "experimental";

export type NavItem = {
	/** Stable, dotted, human-readable — e.g. "yt.download.single-video".
	 *  Used as a store key, so renaming one resets that node's UI state. */
	id: string;
	title: string;
	icon?: IconName;
	url?: string;
	/** Typed jump code, e.g. "ytdv". Was `short_url`. */
	shortcut?: string;
	/** Searchable synonyms that are never displayed. */
	keywords?: string[];
	badge?: string | number;
	status: NavStatus;
	items?: NavItem[];
	/** Leaf action for entries that do something instead of navigating. */
	action?: () => void;
};

export type NavGroup = {
	id: string;
	label: string;
	items: NavItem[];
};

/** A leaf or branch flattened out of the tree, with its ancestry resolved. */
export type FlatNavItem = {
	item: NavItem;
	group: NavGroup;
	/** Ancestor titles, outermost first. Excludes the item's own title. */
	trail: string[];
	/** `trail` joined for display, e.g. "YouTube Tools › Download". */
	breadcrumb: string;
	/** Depth in the tree; 0 for a group's direct children. */
	level: number;
	parentId: string | null;
};
