/**
 * RAF-coalesced writes: at most one flush per animation frame, whatever the
 * caller's actual write rate.
 *
 * Extracted from the scroll-handling idiom inlined in
 * `src/lib/list/use-virtual-list.ts` (`onScroll`'s `frameRef` guard) — a
 * second copy of the same pattern belonged in a shared utility instead of
 * being retyped.
 */
export function createFrameBatcher<T>(flush: (latest: T) => void): {
	push(value: T): void;
	cancel(): void;
} {
	let latest: T;
	let frameId = 0;

	return {
		push(value: T) {
			latest = value;
			if (frameId) return;
			frameId = requestAnimationFrame(() => {
				frameId = 0;
				flush(latest);
			});
		},
		cancel() {
			if (frameId) cancelAnimationFrame(frameId);
			frameId = 0;
		},
	};
}
