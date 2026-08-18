import { replaceTurkishLetters } from "@/lib/utils";

// Folding is the single hottest operation in search: every keystroke used to
// re-fold every title in all three consumers (Appbar, render-menu-item,
// command palette). Titles are a small, fixed vocabulary, so a bounded cache
// turns the per-keystroke cost into map lookups after the first pass.
const FOLD_CACHE_LIMIT = 4096;
const foldCache = new Map<string, string>();

/**
 * Case-folds and strips Turkish diacritics so "Görüntü" and "goruntu" compare
 * equal. Order matters: `toLowerCase()` first (so "İ" decomposes to i + a
 * combining dot), then `replaceTurkishLetters` NFD-strips the marks. This is
 * the same order the pre-refactor call sites used.
 */
export function fold(input: string): string {
	if (!input) return "";

	const hit = foldCache.get(input);
	if (hit !== undefined) return hit;

	const folded = replaceTurkishLetters(input.toLowerCase());

	// Wholesale clear rather than LRU eviction — the working set is bounded by
	// the nav tree, so this should realistically never fire.
	if (foldCache.size >= FOLD_CACHE_LIMIT) foldCache.clear();
	foldCache.set(input, folded);

	return folded;
}

/** Folded, trimmed, split on whitespace. Empty input yields an empty array. */
export function foldWords(input: string): string[] {
	const folded = fold(input).trim();
	return folded ? folded.split(/\s+/) : [];
}

export function clearFoldCache(): void {
	foldCache.clear();
}
