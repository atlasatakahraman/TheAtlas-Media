---
type: doc
project: theatlas-media
tags: [theatlas-media, docs]
created: 2026-08-20
updated: 2026-08-20
status: active
---

# Appbar Search Bar — Structure & Logic

Source: `src/layout/sidebar/Appbar.tsx` (UI shell + filtering)
Supporting: `src/layout/sidebar/render-menu-item.tsx` (highlighting + expand behavior)
Data: `src/layout/sidebar/data.ts` (`getSidebarMenuGroups()`), `src/layout/sidebar/types.d.ts`
Utils: `src/lib/utils.ts` (`replaceTurkishLetters`)

## 1. Overview

The search bar lives inside the sidebar (`Appbar.tsx`), not a separate header component. It performs a **client-side, in-memory tree filter** over the static sidebar menu data (`MenuGroup[]` → `MenuItem[]`, arbitrarily nested via `item.items`). There is no debounce and no async call — filtering re-runs synchronously on every keystroke via `useMemo`.

## 2. State

```ts
const sidebarMenuGroups = useMemo(() => getSidebarMenuGroups(), []);   // static source data, computed once
const [searchQuery, setSearchQuery] = useState("");                    // raw input value
const [shortItem, setShortItem] = useState<MenuItem | null>(null);     // last item matched by short_url
```

- `sidebarMenuGroups` is the full, unfiltered tree — computed once (empty dep array) since `getSidebarMenuGroups()` returns a static structure with no external inputs.
- `shortItem` is a side-effect artifact of filtering (see §4) used later by the Enter-key handler (§5).

## 3. Data Shape

```ts
type MenuItem = {
	title: string;
	url?: string;
	short_url?: string;   // quick-jump code, e.g. "ytdv" for "Single Video"
	icon?: React.ComponentType<{ className?: string }>;
	items?: MenuItem[];   // nested children -> recursive tree
	action?: () => void;
	badge?: string | number;
}

type MenuGroup = {
	label: string;
	items: MenuItem[];
}
```

`short_url` values are short mnemonic codes assigned to leaf items (e.g. `ytdv` = YouTube → Download → Single Video, `ytf4k` = YouTube → Format → By Resolution → 4K). They act as a typed shortcut path independent of the visible title.

## 4. Filtering Algorithm (`filteredMenuGroups`)

Recomputed via `useMemo` whenever `searchQuery` or `sidebarMenuGroups` changes.

**Step 1 — short-circuit:**
If `searchQuery.trim()` is empty, return `sidebarMenuGroups` unchanged (no filtering pass).

**Step 2 — normalize:**
```ts
const query = replaceTurkishLetters(searchQuery.trim().toLowerCase());
```
Turkish-specific characters (ğ, ü, ş, ı, İ, ö, ç and their uppercase forms) are folded to their ASCII Latin equivalents before comparison, so a user typing `sarki` matches `şarkı`-type titles regardless of keyboard/locale.

**Step 3 — recursive `filterItem(item)`:**
For each item in the tree, in this order:
1. **Short-url exact match side effect:** if `item.short_url?.toLowerCase() === query`, call `setShortItem(item)`. This is a state write happening *during render* (inside the `useMemo` callback) — a deliberate but fragile pattern (see §7 Caveats).
2. **Match test:** the item is kept if `query` is a substring of `item.title` (lowercased), `item.url` (lowercased), **or** `item.short_url` (lowercased). Note: title comparison does *not* go through `replaceTurkishLetters` — only `query` is normalized, so a literal Turkish title containing `ş` will not match an ASCII-typed `s` unless the title itself is ASCII. (Highlighting in `render-menu-item.tsx` does the fold on both sides — see §6 — so this is an asymmetry between the filter pass and the highlight pass.)
3. **Recurse into children:** if the item has `items`, each child is passed through `filterItem`. Children that survive are kept; if the item itself didn't match by title/url but has ≥1 surviving child, a **shallow copy** of the item is returned with `items` replaced by the filtered children (`{ ...item, items: filteredChildren }`). This is what allows a parent group to remain visible purely because a descendant matches.
4. Otherwise return `null` (pruned).

**Step 4 — group-level pass:**
```ts
sidebarMenuGroups.map(group => {
  if (group.label.toLowerCase().includes(query)) return group;   // whole group kept as-is
  const filteredItems = group.items.map(filterItem).filter(nonNull);
  return { ...group, items: filteredItems };
});
```
If the **group label itself** matches the query, the entire group (all items, unfiltered) passes through untouched. Otherwise each top-level item runs through `filterItem` individually and the group is rebuilt with only the surviving items (which may themselves be pruned sub-trees per Step 3). Groups with zero surviving items still render (with an empty `SidebarGroupContent`) — there's no group-level removal, only item-level.

## 5. Enter-Key Behavior (Quick Navigation)

```ts
onKeyUp={(e) => {
  if (e.key === 'Enter') {
    if (searchQuery.toLowerCase().includes("home")) {
      router.replace("/");
      setSearchQuery("");
    } else if (shortItem?.url !== undefined && shortItem.short_url === searchQuery) {
      router.push(shortItem.url);
      setSearchQuery("");
    }
  }
}}
```

Two special-cased shortcuts, checked in order:
1. **"home" keyword** — if the raw (non-normalized) query contains the substring `home`, replace the route to `/` and clear the box. `router.replace` (not `push`) so it doesn't add a history entry.
2. **Exact short_url match** — if `shortItem` was set during the last filter pass (§4 Step 3.1) *and* its `short_url` equals the **current** `searchQuery` exactly (case-sensitive, unnormalized), navigate via `router.push(shortItem.url)` and clear the box.

Typing the search box is therefore dual-purpose: it drives the visible filtered list *and* doubles as a command-palette-style "type a code, hit Enter" jump.

## 6. Result Highlighting (`render-menu-item.tsx`)

Separate from the filter pass — every rendered `MenuItem` title goes through `<HighlightText text={item.title} query={searchQuery} />` regardless of whether that particular item matched (it may be visible only because a sibling/child matched).

- `makeTurkishRegex(query)` builds a regex where each character of the (already Turkish-folded) query is expanded into a character class covering all Turkish variants, e.g. `s` → `[sşŞ]`, `i` → `[ıiİI]`, `u` → `[uüÜ]`, `g` → `[gğĞ]`, `o` → `[oöÖ]`, `c` → `[cçÇ]`. Other characters are regex-escaped via `escapeRegExp`.
- The title is split on this regex (capturing group keeps the matched substrings in the split array) and each fragment is compared (after folding) to the folded query to decide whether to wrap it in a `<span className="font-semibold text-primary">`.
- This means highlighting is Turkish-aware in both directions (query↔title), whereas the filter step in `Appbar.tsx` only folds the query side (§4 Step 3.2) — an intentional-looking but easy-to-miss inconsistency between the two files.
- `Logging.info(...)` calls fire on every `HighlightText` render when a query is active — verbose console noise during typing, presumably left in from debugging.

## 7. Auto-Expand on Search

```ts
const isExpanded = (searchQuery && searchQuery.trim().length > 0) ? true : openGroups[itemPath];
```
Whenever there's an active query, every group with children is force-expanded regardless of its normal open/closed toggle state, so nested matches are always visible without manual clicking. When the query is cleared, expansion falls back to `openGroups` (user-toggled state, with active-route groups defaulting open — unrelated to search).

## 8. UI Shell

- Icon: static `<Search>` (lucide-react) absolutely positioned inside the input, not interactive.
- Input: the shared `@/components/ui/input` `Input` component — a custom implementation with a physics-based (lerp) animated text caret rendered via canvas text measurement, not a plain `<input>`. Functionally it behaves like a controlled text input (`value`/`onChange`), the animation is purely cosmetic.
- No search button — filtering is live on every `onChange`; Enter only triggers the two shortcut behaviors in §5.

## 9. Known Caveats / Fragile Points

- `setShortItem` is invoked as a side effect **inside** a `useMemo` computation. This works today because React tolerates state updates during render in this pattern (batched, triggers a re-render), but it's not the idiomatic place for it — a `useEffect` keyed on `searchQuery`/`filteredMenuGroups` would be the conventional approach.
- `shortItem` is never reset when a search no longer matches any `short_url` — it persists the last match, so the Enter-key shortcut in §5 could theoretically fire against a stale `shortItem` if `searchQuery` happens to re-equal an old `short_url` after intermediate edits without a fresh match occurring (unlikely in practice but not structurally prevented).
- Turkish folding is asymmetric between the filter (`Appbar.tsx`, query-only fold) and the highlighter (`render-menu-item.tsx`, both-sides fold via regex). Titles are all-ASCII in the current `data.ts`, so this hasn't surfaced as a bug, but it's a latent inconsistency if a Turkish-lettered title is ever added.
- "home" keyword match is a plain substring test on the raw query (not normalized, not exact) — typing `chrome` would also match and redirect to `/`.
