"use client";

import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type RefCallback,
} from "react";

export type VirtualListOptions = {
	count: number;
	/** Row height in px — a constant, or a function of the row index. */
	itemHeight: number | ((index: number) => number);
	/** Rows rendered beyond each edge, to cover fast scrolls. */
	overscan?: number;
	/** Fallback viewport height used before the scroller has been measured. */
	estimatedViewport?: number;
};

export type VirtualRange = { start: number; end: number };

export type VirtualList = {
	/** Attach to the scrolling element. */
	scrollRef: RefCallback<HTMLElement>;
	/** Half-open [start, end) window of indices to render. */
	range: VirtualRange;
	/** Total scrollable height — put this on the spacer element. */
	totalSize: number;
	/** Absolute positioning style for one row. */
	getItemStyle(index: number): CSSProperties;
	scrollToIndex(index: number, align?: "start" | "center" | "auto"): void;
};

const EMPTY_RANGE: VirtualRange = { start: 0, end: 0 };

/**
 * Windowing over a fixed- or measured-height list. No dependency — the project
 * is deliberately lean, and the general-purpose libraries carry far more than
 * a flat ranked list needs.
 *
 * Scroll handling is RAF-coalesced and writes to refs; a state update is issued
 * only when the visible index window actually changes, so scrolling within one
 * row costs zero renders. That keeps the animation rule satisfied in spirit:
 * the per-frame path never touches React state.
 */
export function useVirtualList({
	count,
	itemHeight,
	overscan = 6,
	estimatedViewport = 320,
}: VirtualListOptions): VirtualList {
	// Prefix sums make a variable-height list O(log n) per lookup instead of
	// O(n). For the constant-height case we skip the table entirely.
	const offsets = useMemo(() => {
		if (typeof itemHeight === "number") return null;
		const table = new Float64Array(count + 1);
		for (let i = 0; i < count; i++) {
			table[i + 1] = table[i] + itemHeight(i);
		}
		return table;
	}, [count, itemHeight]);

	const totalSize =
		offsets !== null
			? offsets[count]
			: count * (typeof itemHeight === "number" ? itemHeight : 0);

	const startOf = useCallback(
		(index: number): number =>
			offsets !== null
				? offsets[index]
				: index * (typeof itemHeight === "number" ? itemHeight : 0),
		[offsets, itemHeight]
	);

	const sizeOf = useCallback(
		(index: number): number =>
			offsets !== null
				? offsets[index + 1] - offsets[index]
				: typeof itemHeight === "number"
					? itemHeight
					: 0,
		[offsets, itemHeight]
	);

	/** Largest index whose start offset is <= `position`. */
	const indexAt = useCallback(
		(position: number): number => {
			if (count === 0) return 0;
			if (offsets === null) {
				const height = typeof itemHeight === "number" ? itemHeight : 1;
				return clamp(Math.floor(position / height), 0, count - 1);
			}
			let low = 0;
			let high = count - 1;
			while (low < high) {
				const mid = (low + high + 1) >> 1;
				if (offsets[mid] <= position) low = mid;
				else high = mid - 1;
			}
			return low;
		},
		[count, offsets, itemHeight]
	);

	const [range, setRange] = useState<VirtualRange>(EMPTY_RANGE);

	const elementRef = useRef<HTMLElement | null>(null);
	const frameRef = useRef(0);
	// Mirrors `range` without participating in render, so the scroll handler can
	// compare against it without re-subscribing on every window change.
	const rangeRef = useRef<VirtualRange>(EMPTY_RANGE);
	const viewportRef = useRef(estimatedViewport);

	const recompute = useCallback(() => {
		const element = elementRef.current;
		const scrollTop = element ? element.scrollTop : 0;
		const viewport = element ? element.clientHeight : viewportRef.current;
		viewportRef.current = viewport || estimatedViewport;

		if (count === 0) {
			if (rangeRef.current.end !== 0) {
				rangeRef.current = EMPTY_RANGE;
				setRange(EMPTY_RANGE);
			}
			return;
		}

		const first = indexAt(scrollTop);
		const last = indexAt(scrollTop + viewportRef.current);

		const start = Math.max(0, first - overscan);
		const end = Math.min(count, last + overscan + 1);

		// The whole point: only pay a render when the window moves.
		if (rangeRef.current.start === start && rangeRef.current.end === end) return;

		rangeRef.current = { start, end };
		setRange(rangeRef.current);
	}, [count, indexAt, overscan, estimatedViewport]);

	const onScroll = useCallback(() => {
		if (frameRef.current) return;
		frameRef.current = requestAnimationFrame(() => {
			frameRef.current = 0;
			recompute();
		});
	}, [recompute]);

	const scrollRef = useCallback<RefCallback<HTMLElement>>(
		(element) => {
			const previous = elementRef.current;
			if (previous) previous.removeEventListener("scroll", onScroll);

			elementRef.current = element;
			if (element) {
				element.addEventListener("scroll", onScroll, { passive: true });
				recompute();
			}
		},
		[onScroll, recompute]
	);

	// Re-window when the item count or metrics change under a static scroll
	// position — e.g. the query narrowed the list while the user sat still.
	useLayoutEffect(() => {
		recompute();
	}, [recompute]);

	useEffect(() => {
		const element = elementRef.current;
		if (!element || typeof ResizeObserver === "undefined") return;

		const observer = new ResizeObserver(() => recompute());
		observer.observe(element);
		return () => observer.disconnect();
	}, [recompute]);

	useEffect(() => {
		return () => {
			if (frameRef.current) cancelAnimationFrame(frameRef.current);
		};
	}, []);

	const getItemStyle = useCallback(
		(index: number): CSSProperties => ({
			position: "absolute",
			top: 0,
			left: 0,
			width: "100%",
			height: sizeOf(index),
			// translate rather than `top` — this is the property that moves on
			// every frame, and only transform/opacity may.
			transform: `translateY(${startOf(index)}px)`,
		}),
		[sizeOf, startOf]
	);

	const scrollToIndex = useCallback(
		(index: number, align: "start" | "center" | "auto" = "auto") => {
			const element = elementRef.current;
			if (!element || count === 0) return;

			const target = clamp(index, 0, count - 1);
			const top = startOf(target);
			const bottom = top + sizeOf(target);
			const viewTop = element.scrollTop;
			const viewBottom = viewTop + element.clientHeight;

			if (align === "start") {
				element.scrollTop = top;
			} else if (align === "center") {
				element.scrollTop = top - (element.clientHeight - sizeOf(target)) / 2;
			} else if (top < viewTop) {
				element.scrollTop = top;
			} else if (bottom > viewBottom) {
				element.scrollTop = bottom - element.clientHeight;
			} else {
				return;
			}

			recompute();
		},
		[count, startOf, sizeOf, recompute]
	);

	return { scrollRef, range, totalSize, getItemStyle, scrollToIndex };
}

function clamp(value: number, min: number, max: number): number {
	return value < min ? min : value > max ? max : value;
}
