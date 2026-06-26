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
}
