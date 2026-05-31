# Animation contract (R1–R4)

| Rule | What | Lint enforced |
|---|---|---|
| **R1** | Animate only `transform` and `opacity` via CSS transitions | ESLint + `scripts/check-animation-rules.sh` |
| **R2** | Height/width via CSS Grid `grid-template-rows: 0fr ↔ 1fr`. Never animate `max-height`, `height`, `top`, `left`, `padding`, `margin`. | Review |
| **R3** | Big animated containers carry `will-change: transform`. Toggle on/off — never leave permanent. | Review |
| **R4** | Animation loops use `useRef` + `requestAnimationFrame` + direct DOM mutation. **Never `useState`** in a RAF loop. | Custom ESLint rule |

`prefers-reduced-motion: reduce` overrides everything — collapsibles instant, custom carets fall back to native.

If you find yourself reaching for `transition: all`, stop and re-read this file.

**Tailwind v4 gotcha:** `transition-[transform,opacity]` does NOT pick
up `duration-*` / `ease-*` utilities — duration defaults to 0s, animation
is invisible. Use bare `transition duration-X ease-Y` instead — it
covers both transform and opacity (and other GPU-cheap properties)
correctly. For single-property animations, `transition-transform` and
`transition-opacity` are also fine. Lint allows all three.
