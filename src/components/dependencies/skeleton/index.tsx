"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { TOOLS } from "@/registry/tools";

/** One metadata row's worth of placeholder, sized to the real thing. */
function MetaRowSkeleton({ labelWidth, valueWidth }: { labelWidth: string; valueWidth: string }) {
	return (
		<div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 py-2">
			<div className="flex items-center gap-1.5 shrink-0">
				<Skeleton className="w-3.5 h-3.5 rounded shrink-0" />
				<Skeleton className={`h-3.5 ${labelWidth} rounded-md`} />
			</div>
			<Skeleton className={`h-[22px] ${valueWidth} rounded-md`} />
		</div>
	);
}

/**
 * Placeholder for a single tool card, pixel-matched to the real layout so the
 * page does not jump when the report lands.
 */
export const ToolCardSkeleton = React.memo(function ToolCardSkeleton({
	showInstalledMetadata = true,
}: {
	showInstalledMetadata?: boolean;
}) {
	return (
		<Card className="bg-sidebar border-sidebar-border shadow-xs py-0 rounded-2xl">
			<CardContent className="p-5 space-y-4">
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
					<div className="flex items-start gap-3 flex-1">
						<Skeleton className="w-[42px] h-[42px] rounded-xl shrink-0" />
						<div className="space-y-1.5 flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<Skeleton className="h-5 w-24 rounded-md" />
								<Skeleton className="h-5 w-20 rounded-full" />
							</div>
							<Skeleton className="h-3.5 w-full max-w-md rounded-md" />
							<div className="flex flex-wrap items-center gap-1.5 pt-1">
								<Skeleton className="h-[22px] w-24 rounded-full" />
								<Skeleton className="h-[22px] w-20 rounded-full" />
								<Skeleton className="h-[22px] w-28 rounded-full" />
							</div>
						</div>
					</div>
					<Skeleton className="h-8 w-28 rounded-md shrink-0 sm:self-start" />
				</div>

				<Separator className="bg-sidebar-border/60" />
				<div className="divide-y divide-sidebar-border/30">
					<MetaRowSkeleton labelWidth="w-14" valueWidth="w-32" />
					<MetaRowSkeleton labelWidth="w-16" valueWidth="w-44" />
					<MetaRowSkeleton labelWidth="w-12" valueWidth="w-28" />

					{showInstalledMetadata && (
						<>
							<MetaRowSkeleton labelWidth="w-14" valueWidth="w-20" />
							<MetaRowSkeleton labelWidth="w-10" valueWidth="w-48" />
							<MetaRowSkeleton labelWidth="w-14" valueWidth="w-36" />
						</>
					)}
				</div>
			</CardContent>
		</Card>
	);
});

/** Placeholder for the status overview banner. Height-matched to the real one. */
export const StatusBannerSkeleton = React.memo(function StatusBannerSkeleton() {
	return (
		<div className="flex flex-wrap items-center justify-between gap-4 p-3.5 rounded-xl border border-sidebar-border bg-sidebar/50 text-xs min-h-[47px]">
			<div className="flex flex-wrap items-center gap-4">
				<div className="flex items-center gap-1.5 font-normal">
					<Skeleton className="w-4 h-4 rounded-full shrink-0" />
					<Skeleton className="h-3.5 w-20 rounded-md" />
				</div>
				<div className="flex items-center gap-1.5 font-normal">
					<Skeleton className="w-4 h-4 rounded shrink-0" />
					<Skeleton className="h-3.5 w-36 rounded-md" />
				</div>
			</div>
			<div className="flex items-center gap-2 shrink-0">
				<Skeleton className="h-3 w-28 rounded-md" />
				<Skeleton className="w-3.5 h-3.5 rounded-full shrink-0" />
				<Skeleton className="h-3 w-36 rounded-md" />
			</div>
		</div>
	);
});

/** The whole page's loading state: banner plus one card per registered tool. */
const DependenciesPageSkeleton = React.memo(function DependenciesPageSkeleton() {
	return (
		<>
			<StatusBannerSkeleton />
			<div className="grid grid-cols-1 gap-4">
				{TOOLS.map((tool) => (
					<ToolCardSkeleton key={tool.key} />
				))}
			</div>
		</>
	);
});

export default DependenciesPageSkeleton;
