"use client";

import { cn } from "@/lib/utils";
import type { MetaRowProps } from "./types";

/** One labelled field in a tool card's metadata list. */
export default function MetaRow({ icon: Icon, label, children, verified }: MetaRowProps) {
	return (
		<div
			className={cn(
				"flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 py-2 min-w-0",
				verified && "**:text-chart-1"
			)}
		>
			<div className="flex items-center gap-1.5 shrink-0 max-w-3xl">
				<Icon className="w-3.5 h-3.5 text-primary/70 shrink-0" />
				<span className="text-xs font-medium text-foreground">{label}:</span>
			</div>
			<div className="flex-1 min-w-0 text-xs text-muted-foreground">{children}</div>
		</div>
	);
}
