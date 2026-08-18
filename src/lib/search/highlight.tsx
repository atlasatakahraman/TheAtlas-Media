"use client";

import * as React from "react";
import { fold } from "./normalize";

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// One regex per distinct query, shared by every rendered row. Building a fresh
// regex per row per keystroke was the single largest avoidable cost in the old
// sidebar; the palette already had this cache, the sidebar did not.
const REGEX_CACHE_LIMIT = 200;
const regexCache = new Map<string, RegExp>();

/**
 * Builds a regex that matches the query while tolerating Turkish diacritics in
 * the *source* text — the query is folded, but the text being highlighted is
 * not, so each folded character has to match its accented variants too.
 */
export function getHighlightRegex(query: string): RegExp {
	const cached = regexCache.get(query);
	if (cached) return cached;

	const pattern = fold(query)
		.split("")
		.map((char) => {
			const escaped = escapeRegExp(char);
			if (escaped === "g") return "[gğĞ]";
			if (escaped === "u") return "[uüÜ]";
			if (escaped === "s") return "[sşŞ]";
			if (escaped === "i") return "[ıiİI]";
			if (escaped === "o") return "[oöÖ]";
			if (escaped === "c") return "[cçÇ]";
			return escaped;
		})
		.join("");

	const regex = new RegExp(`(${pattern})`, "gi");

	if (regexCache.size >= REGEX_CACHE_LIMIT) regexCache.clear();
	regexCache.set(query, regex);

	return regex;
}

export type HighlightTextProps = {
	text: string;
	query?: string;
	/**
	 * The query matched through a field that is not rendered (a shortcut or a
	 * keyword), so there is no substring position to underline — emphasise the
	 * whole string instead.
	 */
	fullMatch?: boolean;
	className?: string;
};

/**
 * The single highlighter. Replaces the three near-identical copies that lived
 * in `Appbar`, `render-menu-item`, and the command palette.
 */
export const HighlightText = React.memo(function HighlightText({
	text,
	query,
	fullMatch,
	className = "font-semibold text-primary",
}: HighlightTextProps) {
	const trimmed = query?.trim();

	const parts = React.useMemo(() => {
		if (!trimmed) return null;
		if (fullMatch) return [{ key: 0, part: text, match: true }];

		const folded = fold(trimmed);
		// `split` on a capturing regex interleaves the matched separators back
		// into the result, so the odd entries are the hits.
		return text.split(getHighlightRegex(trimmed)).map((part, i) => ({
			key: i,
			part,
			match: part.length > 0 && fold(part) === folded,
		}));
	}, [text, trimmed, fullMatch]);

	if (!parts) return <>{text}</>;

	return (
		<>
			{parts.map(({ key, part, match }) =>
				match ? (
					<span key={key} className={className}>
						{part}
					</span>
				) : (
					<span key={key}>{part}</span>
				)
			)}
		</>
	);
});
