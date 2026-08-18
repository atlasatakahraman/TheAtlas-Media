"use client";

import { useCallback } from "react";
import { useOptimisticAction } from "@/lib/optimistic/use-optimistic-action";
import { useOverlaidValue } from "@/lib/optimistic/optimistic-store";
import { cn } from "@/lib/utils";
import { invert, resolveToggleLabel, toggleOverlay } from "./functions";
import type { OptimisticToggleProps } from "./types";

/**
 * A like/favourite-shaped button that paints on click, not on IPC completion.
 *
 * `pending` drives opacity only. Nothing here animates geometry — the pending
 * affordance is a dim, not a spinner that reflows the row.
 */
export default function OptimisticToggle({
	pressed,
	onCommit,
	iconOn: IconOn,
	iconOff,
	labelOn,
	labelOff,
	showLabel = false,
	overlayKey,
	onError,
	disabled = false,
	className,
	children,
}: OptimisticToggleProps) {
	// When an overlayKey is given, the authoritative value is first read through
	// the shared overlay so sibling components already reflect an in-flight
	// change made elsewhere.
	const base = useOverlaidValue(toggleOverlay, overlayKey ?? "", pressed);

	const commit = useCallback(
		async (next: boolean) => {
			if (overlayKey) toggleOverlay.set(overlayKey, next);
			try {
				await onCommit(next);
			} finally {
				// Either way the authoritative value is now the source of truth:
				// on success the caller's store has it, on failure we must stop
				// masking the real value with a stale optimistic one.
				if (overlayKey) toggleOverlay.clear(overlayKey);
			}
		},
		[overlayKey, onCommit]
	);

	const { value, pending, run } = useOptimisticAction<boolean>({
		current: base,
		project: invert,
		commit,
		onError: (error) => onError?.(error),
	});

	const Icon = value ? IconOn : (iconOff ?? IconOn);
	const label = resolveToggleLabel(value, labelOn, labelOff);

	return (
		<button
			type="button"
			aria-pressed={value}
			aria-label={showLabel ? undefined : label}
			disabled={disabled}
			onClick={() => run()}
			className={cn(
				"group/toggle inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm",
				"cursor-pointer select-none",
				"transition-opacity duration-150 ease-out",
				"hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50",
				pending && "opacity-60",
				className
			)}
		>
			<Icon
				className={cn(
					"h-4 w-4 transition-transform duration-200 ease-out",
					"group-hover/toggle:scale-110",
					value && "fill-current"
				)}
			/>
			{showLabel && <span>{label}</span>}
			{children}
		</button>
	);
}
