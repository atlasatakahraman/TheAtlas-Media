import type { FlatNavItem } from "@/registry/nav/types";

/** A nav entry that can actually be invoked — it has a url or an action. */
export type PaletteEntry = FlatNavItem & {
	item: FlatNavItem["item"] & ({ url: string } | { action: () => void });
};

export type PaletteRow = {
	entry: FlatNavItem;
	/** Highlight the whole title: the match came through a hidden field. */
	fullTitle: boolean;
};
