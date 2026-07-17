export type MenuItem = {
	title: string;
	url?: string;
	short_url?: string;
	icon?: React.ComponentType<{ className?: string }>;
	items?: MenuItem[];
	action?: () => void;
	badge?: string | number;
}

export type MenuGroup = {
	label: string;
	items: MenuItem[];
}

export interface RenderMenuItemProps {
	item: MenuItem;
	level?: number;
	parentPath?: string;
	searchQuery?: string;
	// Items present in this set (or `undefined` for "no filter active") are shown;
	// everything else collapses using the same transition as group expand/collapse
	// instead of being unmounted instantly.
	visibleItems?: Set<MenuItem>;
}
