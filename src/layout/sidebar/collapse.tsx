// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-08-19
"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CollapseProps = {
	open: boolean;
	id?: string;
	ariaLabelledBy?: string;
	className?: string;
	children: ReactNode;
};

/**
 * Height + opacity transition via CSS grid rows.
 *
 * Content stays mounted in both states; only the grid track animates, which is
 * what makes the transition possible at all — an unmounted node cannot animate
 * out. Used for a group's own expand/collapse *and* for hiding an item that no
 * longer matches the search, so both read identically.
 *
 * This is also why the sidebar tree is not virtualized: windowing unmounts
 * off-screen rows, which is precisely what this depends on not happening. The
 * node count here is bounded and small, so keeping them mounted is affordable.
 */
export default function Collapse({
	open,
	id,
	ariaLabelledBy,
	className,
	children,
}: CollapseProps) {
	return (
		<div
			id={id}
			data-state={open ? "open" : "closed"}
			role={id ? "region" : undefined}
			aria-labelledby={ariaLabelledBy}
			className={cn(
				"grid grid-rows-[0fr] data-[state=open]:grid-rows-[1fr] transition-[grid-template-rows,opacity] duration-300 ease-in-out",
				open ? "opacity-100" : "opacity-0",
				className
			)}
		>
			<div className="overflow-hidden min-h-0">{children}</div>
		</div>
	);
}
