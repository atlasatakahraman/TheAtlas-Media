import type { FlatNavItem } from "@/registry/nav/types";

export type PlannedFeatureProps = {
	/**
	 * Nav id to describe. Omit and the component resolves the current route
	 * from the registry — which is what every generated stub does, so a stub
	 * page never has to repeat what the registry already says.
	 */
	navId?: string;
	/** Overrides the registry title. Rarely needed. */
	title?: string;
};

/** Everything the view needs, resolved in one pass. See `resolvePlannedView`. */
export type PlannedView = {
	entry: FlatNavItem | undefined;
	title: string;
	breadcrumb: readonly string[];
	/** Routes near this one that are actually built, most-related first. */
	suggestions: readonly FlatNavItem[];
};
