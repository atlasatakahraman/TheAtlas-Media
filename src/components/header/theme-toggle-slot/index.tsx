"use client";

import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Slot wrapper around the existing `ThemeToggle`, carrying the header's
 * entrance animation so the underlying component stays presentation-only.
 */
export default function ThemeToggleSlot() {
	return (
		<div className="duration-500 animate-in slide-in-from-top-9 fade-in-0 transition-[opacity,transform] ease-out">
			<ThemeToggle />
		</div>
	);
}
