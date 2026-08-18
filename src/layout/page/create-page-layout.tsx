// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-08-19

import { cn } from "@/lib/utils";
import type { PageLayoutOptions, PageLayoutVariant } from "./types";

/**
 * Builds a route's `layout.tsx` default export.
 *
 * Every page needs a layout — it is how the App Router scopes error and
 * loading boundaries, and this project requires one per route. Hand-writing
 * them produced two subtly different wrappers for what should be one decision:
 * how this page sits in the frame. That decision is now a named variant.
 *
 * Called at module scope, never during render, so the returned component's
 * identity is stable and React keeps the subtree mounted across re-renders.
 *
 *   export default createPageLayout({ variant: "center" });
 *
 * None of these variants own scrolling. `#page-content-container` in `AppView`
 * is already the scroll container, and a second one nests two scrollbars.
 */
export function createPageLayout(options: PageLayoutOptions = {}) {
	const { variant = "page", className } = options;

	function PageLayout({ children }: React.PropsWithChildren) {
		if (variant === "center") {
			return (
				<div className={cn("flex-1 h-full w-full px-2 py-1", className)}>
					<div className="flex-1 h-full flex justify-center items-center">
						{children}
					</div>
				</div>
			);
		}

		if (variant === "flush") return <>{children}</>;

		return <div className={cn("flex-1 min-w-0", className)}>{children}</div>;
	}

	PageLayout.displayName = `PageLayout(${variant})`;
	return PageLayout;
}

export type { PageLayoutOptions, PageLayoutVariant };
