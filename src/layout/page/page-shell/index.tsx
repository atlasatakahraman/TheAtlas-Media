// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-08-19

import NavIcon from "@/registry/icon";
import { cn } from "@/lib/utils";
import type { PageShellProps } from "./types";

/**
 * The standard page frame: padding, title row, actions slot, content.
 *
 * Pages compose this instead of hand-rolling a header block, so the rhythm of
 * every screen is defined in one place. It deliberately does *not* read the
 * route — a page passes its own title, because a page often wants a title the
 * nav registry cannot know (a filename, a progress percentage). Routes that
 * only want the registry title can read it from `resolvePageTitle`.
 */
export default function PageShell({
	title,
	description,
	icon,
	actions,
	className,
	children,
}: PageShellProps) {
	return (
		<div className={cn("p-6 md:p-8 space-y-6 select-none max-w-full", className)}>
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
				<div className="space-y-1 min-w-0">
					<div className="flex items-center gap-2.5 text-foreground font-serif font-normal text-2xl">
						<NavIcon name={icon} className="w-5 h-5 text-primary shrink-0" />
						<span className="truncate">{title}</span>
					</div>
					{description ? (
						<p className="text-sm text-muted-foreground">{description}</p>
					) : null}
				</div>

				{actions}
			</div>

			{children}
		</div>
	);
}
