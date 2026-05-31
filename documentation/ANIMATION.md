# High-Performance UI & Appbar Architecture Guide

This document outlines the core architecture of the Appbar search system, the underlying "File Pilot" style custom physics input, and the universal guidelines for implementing high-performance, butter-smooth animations across the entire application.

---

## 1. Appbar Architecture & Search Logic

The Appbar serves as the primary command center for the application, tightly coupled with the Sidebar navigation via React context.

### The Search Mechanics
The `Appbar.tsx` component manages a local `searchQuery` state. This query is passed down to the Sidebar rendering engine. 
- **Recursive Filtering**: The `RenderMenuItem` component takes this `searchQuery` and recursively checks if the item's title matches. If it's a folder/group, it checks if any of its children match.
- **Auto-Expansion**: If a child item matches the search query, its parent group is automatically forced open by bypassing the standard collapse state, ensuring the user immediately sees the result.
- **Highlighting**: We use a targeted `substring` split to apply `font-semibold` and `text-primary` to the exact characters in the string that match the query, leaving the rest of the string slightly muted.

---

## 2. The Custom "Jelly" Physics Input Engine

To mimic the buttery smooth, C-rendered cursor physics of tools like *File Pilot*, we abandoned the standard HTML caret and built a custom `requestAnimationFrame` physics loop.

### The Problem with CSS
Standard CSS `transition: transform` cannot handle cursor trails dynamically because the distance the cursor travels varies drastically. If you delete a large word, a CSS transition takes the exact same amount of time to travel 100 pixels as it does 10 pixels, which feels sluggish.

### The Zero-Layout-Thrashing Measurement
To animate a cursor, you must know exactly where the caret is in pixels. 
- **The Slow Way**: Injecting text into a hidden `<span>` and reading `offsetWidth`. This causes "Layout Thrashing" (forcing the browser to recalculate the entire DOM geometry on every keystroke), capping performance and dropping frames.
- **The C++ Way (Canvas)**: We use a cached `CanvasRenderingContext2D`. When you type, we pass the text string into the Canvas `measureText()` API. This calculates the exact sub-pixel width in memory via the browser's C++ backend in `< 0.05ms`, resulting in absolute zero DOM reflows.

### The Lerp Physics
Instead of a bouncy spring, we use an **Exponential Lerp (Linear Interpolation)**.
```javascript
const diff = targetX - currentX
currentX += diff * 0.75
```
By multiplying the remaining distance by `0.75` every frame, the cursor covers 75% of the distance instantly, then 75% of the remaining 25%, and so on. This creates an incredibly snappy response (finishing in ~2 frames) but leaves a micro-smear for visual smoothness that feels instantaneous without bouncing.

### Positional Stretching (The Jelly Snap)
When moving, the cursor dynamically stretches its `width` to fill the gap between where it *was* and where it *is going*:
```javascript
const leftEdge = Math.min(currentX, targetX)
const rightEdge = Math.max(currentX, targetX) + 2
const stretch = rightEdge - leftEdge
```
If you highlight a word and press `Backspace`, the destination jumps backwards. The cursor instantly stretches into a wide block covering the entire deleted word, and the Lerp physics organically slide the "tail" inwards until it's a crisp 2px line again.

---

## 3. Guidelines for Smooth Animations Everywhere

If you want to achieve this level of high-performance fluidity across the rest of the application (modals, sidebars, popovers), follow these strict rules:

### Rule 1: Animate Only the "Cheap" Properties
Browsers can only animate two properties using the GPU (Hardware Acceleration) without triggering layout recalculations:
1. `transform` (Translate, Scale, Rotate)
2. `opacity`

> [!WARNING]
> **NEVER animate `width`, `height`, `top`, `left`, `padding`, or `margin` using CSS transitions.** Animating these forces the CPU to redraw the geometry of the entire page 60 times a second.

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
### Rule 2: The Grid Trick for Height Animation
You cannot animate `height: auto` in CSS. The standard hack is animating `max-height: 1000px`, but this creates weird timing issues where the animation finishes too early. 
**The Solution:** Use CSS Grid.
```css
/* Closed State */
.group {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 300ms ease-out;
}
/* Open State */
.group.open {
  grid-template-rows: 1fr;
}
```
This is how the Sidebar accordion menus animate flawlessly without fixed heights.

### Rule 3: `will-change` for Heavy Elements
If you are animating a large container (like sliding in a modal or a sidebar), tell the browser to prepare it for the GPU beforehand:
```css
.sidebar {
  will-change: transform;
}
```

### Rule 4: Decouple Logic from Render Cycles
If you need complex animation logic (like the Jelly Cursor or trailing particles), **do not use React State (`useState`)** inside the animation loop. React's render cycle is too heavy for 60FPS physics.
Instead:
- Use `useRef` to hold the physics state.
- Use `requestAnimationFrame` to run the math loop.
- Mutate the DOM directly via `elementRef.current.style.transform`.
- Auto-pause the loop when the element stops moving to conserve CPU.
