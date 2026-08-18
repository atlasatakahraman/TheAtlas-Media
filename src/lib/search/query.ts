import { fold } from "./normalize";
import {
	MATCH_BREADCRUMB,
	MATCH_GROUP,
	MATCH_KEYWORD,
	MATCH_MULTIWORD,
	MATCH_NONE,
	MATCH_SHORTCUT_EXACT,
	MATCH_SHORTCUT_PREFIX,
	MATCH_TITLE_EXACT,
	MATCH_TITLE_PREFIX,
	MATCH_TITLE_SUBSTRING,
	type QueryResult,
	type SearchIndex,
} from "./types";

/**
 * Last result produced for each index.
 *
 * Kept here rather than in a caller-side ref for two reasons: React forbids
 * reading or writing refs during render, and every consumer of an index wants
 * the same refinement behaviour anyway. Weak so an index built for a
 * short-lived list does not pin its result forever.
 */
const lastResult = new WeakMap<SearchIndex<unknown>, QueryResult>();

/**
 * Runs the ranking ladder over an index.
 *
 * Incremental refinement: when the new query extends the previous one, only the
 * previously-matching offsets are rescanned. That is sound because every match
 * kind is substring-containment, and containment is monotone under extending
 * either the query or its last word — an entry that failed a shorter query
 * cannot pass a longer one.
 *
 * `prev` controls where the previous result comes from:
 *   - omitted: the last result for this index, remembered automatically;
 *   - `null`:  force a cold run (used by the verification script);
 *   - a value: use exactly that.
 */
export function runQuery<T>(
	index: SearchIndex<T>,
	rawQuery: string,
	prev?: QueryResult | null
): QueryResult {
	const previous =
		prev === null
			? undefined
			: (prev ?? lastResult.get(index as SearchIndex<unknown>));

	const result = evaluate(index, rawQuery, previous);
	lastResult.set(index as SearchIndex<unknown>, result);
	return result;
}

function evaluate<T>(
	index: SearchIndex<T>,
	rawQuery: string,
	prev: QueryResult | undefined
): QueryResult {
	const query = fold(rawQuery).trim();
	const size = index.size;

	const kinds = new Int8Array(size).fill(MATCH_NONE);
	const fullTitle = new Uint8Array(size);

	// Empty query: everything matches, in source order, unranked.
	if (!query) {
		const order = new Int32Array(size);
		for (let i = 0; i < size; i++) order[i] = i;
		kinds.fill(MATCH_MULTIWORD);
		return { query, order, kinds, fullTitle, matched: size };
	}

	const candidates = selectCandidates(index, query, prev);
	const words = query.includes(" ") ? query.split(/\s+/).filter(Boolean) : null;

	const matches: number[] = [];

	for (let c = 0; c < candidates.length; c++) {
		const i = candidates[c];

		const title = index.titles[i];
		const shortcut = index.shortcuts[i];

		let kind = MATCH_NONE;
		let wholeTitle = false;

		if (shortcut && shortcut === query) {
			kind = MATCH_SHORTCUT_EXACT;
			wholeTitle = true;
		} else if (title === query) {
			kind = MATCH_TITLE_EXACT;
		} else if (shortcut && shortcut.startsWith(query)) {
			kind = MATCH_SHORTCUT_PREFIX;
			// Only light up the whole title when the title itself has no literal
			// occurrence to underline.
			wholeTitle = !title.includes(query);
		} else if (title.startsWith(query)) {
			kind = MATCH_TITLE_PREFIX;
		} else if (title.includes(query)) {
			kind = MATCH_TITLE_SUBSTRING;
		} else if (index.breadcrumbs[i].includes(query)) {
			kind = MATCH_BREADCRUMB;
		} else if (index.groups[i].includes(query)) {
			kind = MATCH_GROUP;
		} else if (index.combined[i].includes(query)) {
			// Every displayed field was checked above, so reaching here means the
			// hit lives somewhere non-displayed: a keyword synonym, or a shortcut
			// matched mid-string rather than by prefix.
			kind = MATCH_KEYWORD;
			wholeTitle = true;
		} else if (words !== null && words.length > 1) {
			const haystack = index.combined[i];
			let all = true;
			for (let w = 0; w < words.length; w++) {
				if (!haystack.includes(words[w])) {
					all = false;
					break;
				}
			}
			if (all) {
				kind = MATCH_MULTIWORD;
				wholeTitle = true;
			}
		}

		if (kind !== MATCH_NONE) {
			kinds[i] = kind;
			if (wholeTitle) fullTitle[i] = 1;
			matches.push(i);
		}
	}

	// Rank desc, then source order — stable, so equally-scored siblings keep the
	// order the registry declares them in.
	matches.sort((a, b) => (kinds[b] - kinds[a]) || (a - b));

	return {
		query,
		order: Int32Array.from(matches),
		kinds,
		fullTitle,
		matched: matches.length,
	};
}

/**
 * Narrows the scan set, cheapest viable source first:
 *   1. the previous result, when this query extends it;
 *   2. the 2-gram bucket for the query's first two characters;
 *   3. everything.
 *
 * The bucket is only valid when the query's first two characters are also the
 * first two characters of its first word — otherwise a one-character leading
 * word ("y down") would look up a bucket key of "y " that the haystack need not
 * contain even though the word matches.
 */
function selectCandidates<T>(
	index: SearchIndex<T>,
	query: string,
	prev?: QueryResult
): Int32Array {
	const refinable =
		prev !== undefined && prev.query.length > 0 && query.startsWith(prev.query);

	const bucketable = query.length >= 2 && query[0] !== " " && query[1] !== " ";
	// A missing bucket is a definitive miss, not a reason to fall back to a scan.
	const bucket = bucketable
		? (index.prefixBuckets.get(query.slice(0, 2)) ?? EMPTY)
		: null;

	if (refinable && bucket !== null) {
		// Both are sound supersets, and which one is smaller is not fixed: a
		// broad one-character previous query can carry far more entries than a
		// selective bigram bucket, while a long refined query carries far fewer.
		return prev.order.length <= bucket.length ? prev.order : bucket;
	}
	if (refinable) return prev.order;
	if (bucket !== null) return bucket;

	const all = new Int32Array(index.size);
	for (let i = 0; i < index.size; i++) all[i] = i;
	return all;
}

const EMPTY = new Int32Array(0);

/** O(1) exact-shortcut jump, for Enter-to-navigate without ranking. */
export function resolveShortcut<T>(
	index: SearchIndex<T>,
	rawQuery: string
): T | undefined {
	const offset = index.byShortcut.get(fold(rawQuery).trim());
	return offset === undefined ? undefined : index.items[offset];
}
