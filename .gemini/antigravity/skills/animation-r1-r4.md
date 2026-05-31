# Skill: Animation rules R1–R4 (enforce before writing CSS/Tailwind)

Before writing any animated style, check:

| Refuse to write | Replace with |
|---|---|
| `transition: all` | `transition: transform 200ms ease-out` or `transition: opacity 200ms ease-out` |
| `transition-all` (Tailwind) | `transition-transform` or `transition-opacity` |
| `transition: height/width/top/left/padding/margin` | CSS Grid trick (`.collapsible[data-open]`) for height; refuse the rest |
| `useState` inside a `requestAnimationFrame` loop | `useRef` + direct DOM mutation via `el.style.transform = ...` |
| `max-height: 1000px` collapse hack | `.collapsible` Grid pattern |
| Permanent `will-change: transform` | Toggle on for the animation, off after |

When in doubt: GPU-only properties are `transform` and `opacity`. Everything else hits the CPU.

If a designer asks for an animation that requires animating geometry, the answer is "use Grid + `data-open`" or "redesign the interaction".
