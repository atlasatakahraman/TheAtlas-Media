"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Hammer, House } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import NavIcon from "@/registry/icon";
import { resolvePlannedView } from "./functions";
import type { PlannedFeatureProps } from "./types";

/**
 * Stand-in for a route the nav registry declares but nobody has built yet.
 *
 * The sidebar is a product map — around a hundred of its entries are ahead of
 * the implementation. Before this existed they all led to a bare 404, which
 * reads as "this app is broken" rather than "this part is not finished".
 */
export default function PlannedFeature({ navId, title }: PlannedFeatureProps) {
	const pathname = usePathname();
	const view = useMemo(() => resolvePlannedView(pathname, navId), [pathname, navId]);

	const heading = title ?? view.title;

	return (
		<div className="flex h-full min-h-[60vh] w-full items-center justify-center p-6 select-none">
			<div className="w-full max-w-md space-y-6 text-center">
				<div className="flex flex-col items-center gap-3">
					<div className="rounded-xl border border-border bg-muted/40 p-3">
						{view.entry?.item.icon ? (
							<NavIcon
								name={view.entry.item.icon}
								className="h-6 w-6 text-muted-foreground"
							/>
						) : (
							<Hammer className="h-6 w-6 text-muted-foreground" />
						)}
					</div>

					<div className="space-y-1">
						{view.breadcrumb.length > 0 ? (
							<p className="text-xs text-muted-foreground">
								{view.breadcrumb.join(" › ")}
							</p>
						) : null}
						<h1 className="font-serif text-2xl font-normal text-foreground">
							{heading}
						</h1>
					</div>

					<Badge variant="secondary">Planned</Badge>
				</div>

				<p className="text-sm text-muted-foreground">
					This part of TheAtlas Media is mapped out but not built yet. It is listed in
					the sidebar so the plan stays visible — nothing here is broken.
				</p>

				{view.suggestions.length > 0 ? (
					<div className="space-y-2 text-left">
						<p className="text-xs font-medium text-muted-foreground">
							Available now
						</p>
						<div className="flex flex-col gap-1">
							{view.suggestions.map((suggestion) => (
								<Link
									key={suggestion.item.id}
									href={suggestion.item.url!}
									className="group/suggestion flex items-center gap-2 rounded-md border border-transparent px-3 py-2 text-sm text-foreground transition-colors hover:border-border hover:bg-muted/50"
								>
									<NavIcon
										name={suggestion.item.icon}
										className="h-4 w-4 shrink-0 text-muted-foreground"
									/>
									<span className="truncate">{suggestion.item.title}</span>
									<ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/suggestion:opacity-100" />
								</Link>
							))}
						</div>
					</div>
				) : null}

				<Button asChild variant="outline" size="sm">
					<Link href="/">
						<House className="h-4 w-4" />
						Back to home
					</Link>
				</Button>
			</div>
		</div>
	);
}
