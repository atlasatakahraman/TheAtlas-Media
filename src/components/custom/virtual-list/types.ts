import type { ReactNode } from "react";

export type VirtualListProps<T> = {
	items: readonly T[];
	/** Row height in px — constant, or a function of the row index. */
	itemHeight: number | ((index: number) => number);
	renderItem: (item: T, index: number) => ReactNode;
	/** Stable key per row. Defaults to the index, which is fine for a list that
	 *  is only ever re-ordered wholesale (a ranked search result). */
	getKey?: (item: T, index: number) => string | number;
	overscan?: number;
	/** Rendered instead of the scroller when `items` is empty. */
	empty?: ReactNode;
	className?: string;
	/** Applied to the absolutely-positioned row wrapper. */
	itemClassName?: string;
	"aria-label"?: string;
};
