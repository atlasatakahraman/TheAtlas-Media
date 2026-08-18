import { createOptimisticOverlay } from "@/lib/optimistic/optimistic-store";

/**
 * Shared staging area for toggles that opt in with an `overlayKey`. Module
 * scope on purpose: a favourite flipped in a list row has to read as flipped in
 * the sidebar on the same frame, before the IPC resolves.
 */
export const toggleOverlay = createOptimisticOverlay<boolean>();

export function resolveToggleLabel(
	pressed: boolean,
	labelOn: string,
	labelOff: string
): string {
	return pressed ? labelOn : labelOff;
}

/** The projection a plain toggle applies on click. */
export function invert(value: boolean): boolean {
	return !value;
}
