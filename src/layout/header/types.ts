import type { MenuGroup, MenuItem, RenderMenuItemProps } from "../sidebar/types";

export type { MenuGroup, MenuItem, RenderMenuItemProps };

export type HeadItem = {
	label: string,
	href: string,
	action?: () => void,
	content?: HeadItem[]
}

export interface HeaderProps {
	title: string,
	items: HeadItem[],
}
