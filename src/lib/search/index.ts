export { fold, foldWords, clearFoldCache } from "./normalize";
export { buildSearchIndex, itemAt } from "./build-index";
export { runQuery, resolveShortcut } from "./query";
export { HighlightText, getHighlightRegex } from "./highlight";
export type { HighlightTextProps } from "./highlight";
export {
	MATCH_NONE,
	MATCH_MULTIWORD,
	MATCH_GROUP,
	MATCH_BREADCRUMB,
	MATCH_KEYWORD,
	MATCH_TITLE_SUBSTRING,
	MATCH_TITLE_PREFIX,
	MATCH_SHORTCUT_PREFIX,
	MATCH_TITLE_EXACT,
	MATCH_SHORTCUT_EXACT,
} from "./types";
export type { SearchRecord, SearchIndex, QueryResult } from "./types";
