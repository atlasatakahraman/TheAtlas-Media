/**
 * The searchable projection of one item. Everything except `id` and `title` is
 * optional, so a consumer with only titles can still build an index.
 */
export type SearchRecord = {
	id: string;
	title: string;
	/** Typed shortcut, e.g. "ytdv". Was `short_url` in the pre-refactor tree. */
	shortcut?: string;
	/** Ancestor titles joined for display, e.g. "YouTube › Download". */
	breadcrumb?: string;
	/** Top-level group label the item lives under. */
	group?: string;
	/** Extra synonyms that should match but are never displayed. */
	keywords?: string[];
};

/**
 * Struct-of-arrays index. Parallel arrays (not an array of objects) so a query
 * scan touches one contiguous string array per field instead of chasing an
 * object pointer per entry.
 */
export type SearchIndex<T> = {
	/** Original items, index-aligned with every array below. */
	items: readonly T[];
	size: number;

	ids: string[];
	/** Folded fields. Absent values are "" rather than undefined so the scan
	 *  never has to branch on nullishness. */
	titles: string[];
	shortcuts: string[];
	breadcrumbs: string[];
	groups: string[];
	/** All folded fields concatenated — the haystack for multi-word matching. */
	combined: string[];

	byId: Map<string, number>;
	byShortcut: Map<string, number>;

	/**
	 * Folded 2-gram → offsets whose `combined` contains it. Every match kind is
	 * substring-based over `combined`, so the bigram bucket for a query's first
	 * two characters is a guaranteed superset of its match set.
	 */
	prefixBuckets: Map<string, Int32Array>;
};

/** Ranking ladder. Higher wins; `MATCH_NONE` means the entry did not match. */
export const MATCH_NONE = -1;
export const MATCH_MULTIWORD = 0;
export const MATCH_GROUP = 1;
export const MATCH_BREADCRUMB = 2;
export const MATCH_KEYWORD = 3;
export const MATCH_TITLE_SUBSTRING = 4;
export const MATCH_TITLE_PREFIX = 5;
export const MATCH_SHORTCUT_PREFIX = 6;
export const MATCH_TITLE_EXACT = 7;
export const MATCH_SHORTCUT_EXACT = 8;

export type QueryResult = {
	/** The folded, trimmed query this result was produced from. */
	query: string;
	/** Matched offsets, ranked. Length is `matched`. */
	order: Int32Array;
	/** Per-offset match kind, length `index.size`. `MATCH_NONE` for misses. */
	kinds: Int8Array;
	/**
	 * Per-offset flag: the query matched via shortcut only, so there is no
	 * literal substring position in the title to underline — highlight all of
	 * it instead to signal "this is the match".
	 */
	fullTitle: Uint8Array;
	matched: number;
};
