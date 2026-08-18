/**
 * How a route's layout frames its page.
 *
 * - `page`   — a normal scrolling document. The page owns its padding, usually
 *              by rendering `PageShell`.
 * - `center` — content centred in the viewport. For single-input screens like
 *              the download form, which look wrong pinned to the top-left.
 * - `flush`  — no wrapper element at all. For a page that measures itself
 *              against the scroll container (`h-full`, `flex-1`); an extra
 *              div between them silently collapses that height to content.
 */
export type PageLayoutVariant = "page" | "center" | "flush";

export type PageLayoutOptions = {
	variant?: PageLayoutVariant;
	/** Extra classes on the wrapper. Ignored by `flush`, which has none. */
	className?: string;
};
