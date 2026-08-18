"use client";

import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import type { HeaderSlotProps } from "@/layout/header/types";

/**
 * Registry-driven page title. Nothing here knows what pages exist — the title
 * and breadcrumb come from whichever nav entry owns the current route, or from
 * a runtime override a page pushed with `usePageHeader`.
 */
export default function PageTitle({ ctx }: HeaderSlotProps) {
	return (
		<div
			className="flex min-w-0 items-center gap-1 text-sm select-none"
			data-tauri-drag-region
		>
			{ctx.breadcrumb.map((crumb) => (
				<Fragment key={crumb}>
					<span className="truncate text-muted-foreground hidden lg:inline">{crumb}</span>
					<ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60 hidden lg:inline" />
				</Fragment>
			))}
			<span className="truncate font-medium text-foreground">{ctx.title}</span>
		</div>
	);
}
