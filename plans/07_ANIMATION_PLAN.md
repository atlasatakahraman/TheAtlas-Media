# Plan 07 — ANIMATION.md → High-Performance UI Contract

> **Source:** `documentation/ANIMATION.md`
> **Scope:** Every animated surface (modals, sidebars, popovers, search input, progress bars, queue items).

This plan turns the four animation rules + Appbar/Jelly-Cursor architecture into concrete components, ESLint rules, and review gates.

---

## 1. The contract (one screenful)

| Rule | What | Enforcement |
|---|---|---|
| **R1** | Animate **only** `transform` and `opacity` via CSS transitions | ESLint rule + grep CI step |
| **R2** | Height/width changes use **CSS Grid** `grid-template-rows: 0fr ↔ 1fr` (or `1fr 0fr` for columns) | Component library + review |
| **R3** | Big animated containers carry `will-change: transform` (toggle on/off, don't leave permanent) | Review checklist |
| **R4** | Animation loops use **`useRef` + `requestAnimationFrame` + direct DOM mutation**. **Never `useState`** in a RAF loop | Custom ESLint rule |

> Violations of R1/R2/R4 are blocking PR review comments. Violations of R3 are nits.

## 2. ESLint custom rules to add

`eslint.config.mjs` (additions):

```js
// 1) Forbid transitions/animations of non-GPU properties in inline styles & Tailwind arbitrary values.
{
    rules: {
        "no-restricted-syntax": [
            "error",
            {
                selector: "JSXAttribute[name.name='style'] Property[key.name=/^(transition|animation)$/] Literal[value=/(?:width|height|top|left|right|bottom|padding|margin|border-width)/]",
                message: "ANIMATION.md R1: animate only transform/opacity. See plans/07_ANIMATION_PLAN.md.",
            },
            {
                selector: "Literal[value=/transition-(?:all|width|height|top|left|right|bottom|padding|margin|spacing)/]",
                message: "ANIMATION.md R1: animate only transform/opacity. Replace with transition-transform or transition-opacity.",
            },
        ],
    },
},
```

`scripts/check-animation-rules.sh`:
```bash
#!/usr/bin/env bash
set -e
rg -n 'transition-(all|width|height|top|left|right|bottom|padding|margin)' app components && {
  echo "ANIMATION.md R1 violation — replace with transition-transform / transition-opacity"; exit 1; } || true
rg -n 'requestAnimationFrame' app components | while read -r line; do
  file="${line%%:*}"
  rg -q "useState" "$file" || continue
  rg -nq 'useState[^;]+(?:setX|setY|setPosition|setProgress)' "$file" && {
    echo "ANIMATION.md R4 potential violation in $file — confirm RAF loops use refs only"; exit 1; }
done
```

Wired into `npm run check`.

## 3. Tailwind / global CSS additions

`globals.css` already imports `tw-animate-css`. Add helpers:

```css
@layer utilities {
    /* R3: opt-in GPU hint, scoped — pair with on/off toggling in JS */
    .gpu-transform { will-change: transform; transform: translateZ(0); }
    .gpu-opacity   { will-change: opacity; }

    /* R2: grid-based height collapse */
    .collapsible {
        display: grid;
        grid-template-rows: 0fr;
        transition: grid-template-rows 220ms cubic-bezier(0.2, 0, 0, 1);
    }
    .collapsible[data-open="true"] { grid-template-rows: 1fr; }
    .collapsible > * { overflow: hidden; min-height: 0; }
}
```

> ### Aside — Tailwind v4 quirk with arbitrary transition lists
>
> `transition-[transform,opacity]` does NOT pick up `duration-*` and
> `ease-*` utility classes in Tailwind v4. The property changes but
> the duration defaults to 0s — the animation is invisible.
>
> Use one of these instead:
>
> ```tsx
> // For multiple GPU-cheap properties (preferred):
> "transition duration-200 ease-in-out"
>
> // For a single property:
> "transition-transform duration-200"
> "transition-opacity duration-200"
>
> // For full explicit control (verbose, rarely needed):
> "[transition:transform_200ms_ease-in-out,opacity_200ms_ease-in-out]"
> ```
>
> The bare `transition` class is the right answer for "animate both
> transform and opacity together" — it includes the curated GPU-friendly
> property set and wires duration/easing correctly. Lint allows it.

## 4. The Jelly Cursor input — concrete component

`src/components/jelly-input.tsx` implements §2 of ANIMATION.md.

### 4.1 Measurement (Canvas, zero layout thrash)

```ts
// src/lib/text-metrics.ts
let cached: CanvasRenderingContext2D | null = null;
function ctx(font: string): CanvasRenderingContext2D {
    if (!cached) {
        const c = document.createElement("canvas");
        cached = c.getContext("2d", { willReadFrequently: false })!;
    }
    if (cached.font !== font) cached.font = font;
    return cached;
}
export function measureText(text: string, font: string): number {
    return ctx(font).measureText(text).width;
}
```

### 4.2 Physics loop (refs only — R4)

```tsx
// src/components/jelly-input.tsx
'use client';
// next@16.2.6 — verified against node_modules/next/dist/docs/src/app/client-components.md on 2026-05-31
import { useEffect, useRef, useState } from "react";
import { measureText } from "@/src/lib/text-metrics";

const LERP = 0.75;          // ANIMATION.md §2 "Exponential Lerp"
const SNAP_PADDING = 2;     // visual padding on the trailing edge
const FONT = "16px var(--font-sans), system-ui";

export function JellyInput({ value, onChange, placeholder }:
    { value: string; onChange: (v: string) => void; placeholder?: string }) {

    const inputRef  = useRef<HTMLInputElement>(null);
    const cursorRef = useRef<HTMLSpanElement>(null);
    const stateRef  = useRef({ currentX: 0, targetX: 0, rafId: 0, lastTs: 0 });
    const [focused, setFocused] = useState(false);

    // Measure target X every time selection or value changes.
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        const pos = el.selectionStart ?? value.length;
        stateRef.current.targetX = measureText(value.slice(0, pos), FONT);
        kick();
    });

    function kick() {
        if (stateRef.current.rafId) return;
        const tick = (ts: number) => {
            const s = stateRef.current;
            const dt = s.lastTs ? Math.min(ts - s.lastTs, 32) : 16;
            s.lastTs = ts;
            const diff = s.targetX - s.currentX;
            s.currentX += diff * LERP;
            const left  = Math.min(s.currentX, s.targetX);
            const right = Math.max(s.currentX, s.targetX) + SNAP_PADDING;
            const c = cursorRef.current;
            if (c) {
                c.style.transform = `translateX(${left.toFixed(2)}px)`;
                c.style.width = `${Math.max(2, right - left).toFixed(2)}px`;
            }
            if (Math.abs(diff) > 0.1) {
                s.rafId = requestAnimationFrame(tick);
            } else {
                s.rafId = 0; s.lastTs = 0;       // R3: auto-pause to conserve CPU
                if (c) { c.style.willChange = "auto"; }
            }
        };
        if (cursorRef.current) cursorRef.current.style.willChange = "transform";
        stateRef.current.rafId = requestAnimationFrame(tick);
    }

    useEffect(() => () => { if (stateRef.current.rafId) cancelAnimationFrame(stateRef.current.rafId); }, []);

    return (
        <div className="relative inline-block">
            <input
                ref={inputRef}
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                onSelect={() => kick()}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                className="bg-transparent outline-none caret-transparent"
                style={{ font: FONT }}
            />
            <span
                ref={cursorRef}
                aria-hidden
                className="pointer-events-none absolute top-0 bottom-0 bg-primary opacity-80"
                style={{ width: 2, transform: "translateX(0)", willChange: "auto", opacity: focused ? 0.8 : 0 }}
            />
        </div>
    );
}
```

Used by the Appbar `<SearchField/>` (§5).

## 5. Appbar + Sidebar architecture (search wiring)

Per ANIMATION.md §1:

```
AppbarContext  (React context)
  ├─ searchQuery, setSearchQuery
  └─ forceExpandedGroups (Set<string>)  // populated by RenderMenuItem when a descendant matches

Appbar.tsx
  └─ <SearchField/> → uses JellyInput (§4)

Sidebar.tsx
  └─ <RenderMenuItem item={…} query={searchQuery} />
       ├─ Highlight component splits on substring match (font-semibold + text-primary)
       ├─ If item.title matches → render
       ├─ If item.children any-match → auto-expand parent group
       └─ Group open animation uses `.collapsible[data-open]` (R2)
```

Highlight component:
```tsx
export function Highlight({ text, query }: { text: string; query: string }) {
    if (!query) return <>{text}</>;
    const i = text.toLowerCase().indexOf(query.toLowerCase());
    if (i === -1) return <span className="text-muted-foreground">{text}</span>;
    return (
        <>
            <span className="text-muted-foreground">{text.slice(0, i)}</span>
            <span className="font-semibold text-primary">{text.slice(i, i + query.length)}</span>
            <span className="text-muted-foreground">{text.slice(i + query.length)}</span>
        </>
    );
}
```

> **Performance note (R4 implication):** `searchQuery` lives in the AppbarContext but **downloads list state does NOT** live there. Two contexts, two re-render scopes. Keeps Plan 05 §9 valid.

## 6. Progress bar (Plan 05 calls into this)

`src/components/progress-bar.tsx`:

```tsx
'use client';
import { memo, useEffect, useRef } from "react";

export const ProgressBar = memo(function ProgressBar({ percent }: { percent: number }) {
    const fillRef = useRef<HTMLDivElement>(null);

    // R1+R4: never re-render the component for sub-percent updates — mutate transform via ref.
    useEffect(() => {
        const el = fillRef.current; if (!el) return;
        el.style.transform = `scaleX(${Math.max(0, Math.min(100, percent)) / 100})`;
    }, [percent]);

    return (
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
                ref={fillRef}
                className="absolute inset-0 origin-left bg-primary"
                style={{ transform: "scaleX(0)", transition: "transform 120ms linear", willChange: "transform" }}
                aria-hidden
            />
        </div>
    );
});
```

Plan 05 §9 wires it: `<ProgressBar percent={item.percent} />` where `item.percent` arrives via the queue reducer.

For *extreme* smoothness (60 fps from 10 Hz IPC), we run interpolation inside the component using `requestAnimationFrame` between successive `percent` props — but only if profiling shows the linear CSS transition is visibly insufficient. Default is the simpler version above.

## 7. Modals / sidebars / popovers

- Use Base UI / Radix primitives that already animate `transform` + `opacity` (Tailwind data-state utilities). No manual height transitions.
- Wrap content in `.collapsible` from §3 if a height collapse is needed.
- Toggle `will-change: transform` on the root when the element is mounted/visible; remove it after the animation finishes. Helper:

```ts
// src/lib/will-change.ts
export function withGpuHint(el: HTMLElement, ms: number) {
    el.classList.add("gpu-transform");
    const t = setTimeout(() => el.classList.remove("gpu-transform"), ms + 50);
    return () => clearTimeout(t);
}
```

## 8. Profiling & acceptance

- Use **React DevTools Profiler** for any new animation: record a 5 s interaction, confirm only the animated component commits.
- Use **Chrome DevTools → Performance → Frames** with 6× CPU throttling, confirm ≥ 55 fps during active animations.
- For the Jelly cursor specifically: capture a Performance trace and confirm zero "Recalculate Style" entries in the RAF range (proves Canvas measurement worked — no DOM reads).

Failure of any of these on a touched animation is a release blocker for that feature.

## 9. Accessibility

- All cursor / progress / collapse animations respect `prefers-reduced-motion`:
  ```css
  @media (prefers-reduced-motion: reduce) {
      .collapsible { transition-duration: 1ms; }
      .gpu-transform, .gpu-opacity { will-change: auto; }
  }
  ```
- `<JellyInput>` falls back to the native caret when `prefers-reduced-motion: reduce` is set (skip the RAF loop, render the cursor at `targetX` immediately, hide the custom one).
- Progress bars expose `role="progressbar"` + `aria-valuenow` (re-rendered via React for screen readers — that one's fine because it's text content, not a 60 fps property).

## 10. Execution checklist

- [ ] **N-1** Add the ESLint rule from §2 to `eslint.config.mjs`.
- [ ] **N-2** Add `scripts/check-animation-rules.sh` and wire into `npm run check`.
- [ ] **N-3** Add the `.collapsible`, `.gpu-transform`, `.gpu-opacity` utilities to `globals.css` (§3).
- [ ] **N-4** Add `src/lib/text-metrics.ts` (§4.1) and `src/lib/will-change.ts` (§7).
- [ ] **N-5** Implement `src/components/jelly-input.tsx` (§4.2) and a Storybook-style demo route under `src/app/_dev/jelly/` (dev-only, behind `NEXT_PUBLIC_THEATLAS_DEBUG`).
- [ ] **N-6** Implement `src/components/progress-bar.tsx` (§6); wire from `src/components/download-queue-item.tsx`.
- [ ] **N-7** Implement Appbar + Sidebar search wiring (§5) with `<Highlight>` and auto-expand.
- [ ] **N-8** Add `prefers-reduced-motion` overrides (§9).
- [ ] **N-9** Record a baseline DevTools Profiler trace of the queue with 5 active downloads → store in `docs/perf/baseline-queue.json` and a screenshot.
- [ ] **N-10** PR review checklist item: "Animations comply with ANIMATION.md R1–R4?"

## 11. Acceptance criteria

1. The four-rule contract (§1) is enforced by lint + scripts; CI fails on violations.
2. `JellyInput` runs at ≥ 55 fps during fast typing on a 6× throttled trace.
3. `ProgressBar` updates do **not** cause `DownloadQueueItem` to re-render (Profiler proof).
4. Sidebar group expand/collapse uses the Grid trick (no `max-height` anywhere in `src/app/`/`src/components/`).
5. Reduced-motion users see static progress bars and a native caret.
