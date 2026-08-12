// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-06-21
"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import React from "react";

export interface ToolCardSkeletonProps {
	showInstalledMetadata?: boolean;
}

/**
 * Skeleton for a single dependency tool card.
 * Pixel-matched to the exact height and layout of a real ToolCard.
 */
export const ToolCardSkeleton = React.memo(function ToolCardSkeleton({
	showInstalledMetadata = true,
}: ToolCardSkeletonProps) {
	return (
		<Card className="bg-sidebar border-sidebar-border shadow-xs py-0 rounded-2xl">
			<CardContent className="p-5 space-y-4">
				{/* Top row: icon + name/badge + button */}
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
					<div className="flex items-start gap-3 flex-1">
						{/* Icon placeholder (42x42px container) */}
						<Skeleton className="w-[42px] h-[42px] rounded-xl shrink-0" />
						<div className="space-y-1.5 flex-1 min-w-0">
							{/* Name + status badge row */}
							<div className="flex items-center gap-2">
								<Skeleton className="h-5 w-24 rounded-md" />
								<Skeleton className="h-5 w-20 rounded-full" />
							</div>
							{/* Description line */}
							<Skeleton className="h-3.5 w-full max-w-md rounded-md" />
							{/* Feature chips */}
							<div className="flex flex-wrap items-center gap-1.5 pt-1">
								<Skeleton className="h-[22px] w-24 rounded-full" />
								<Skeleton className="h-[22px] w-20 rounded-full" />
								<Skeleton className="h-[22px] w-28 rounded-full" />
							</div>
						</div>
					</div>
					{/* Action button placeholder */}
					<Skeleton className="h-8 w-28 rounded-md shrink-0 sm:self-start" />
				</div>

				{/* Metadata Section */}
				<Separator className="bg-sidebar-border/60" />
				<div className="divide-y divide-sidebar-border/30">
					{/* License */}
					<div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 py-2">
						<div className="flex items-center gap-1.5 shrink-0">
							<Skeleton className="w-3.5 h-3.5 rounded shrink-0" />
							<Skeleton className="h-3.5 w-14 rounded-md" />
						</div>
						<Skeleton className="h-[22px] w-32 rounded-md" />
					</div>
					{/* Publisher */}
					<div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 py-2">
						<div className="flex items-center gap-1.5 shrink-0">
							<Skeleton className="w-3.5 h-3.5 rounded shrink-0" />
							<Skeleton className="h-3.5 w-16 rounded-md" />
						</div>
						<Skeleton className="h-[22px] w-44 rounded-md" />
					</div>
					{/* Credits */}
					<div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 py-2">
						<div className="flex items-center gap-1.5 shrink-0">
							<Skeleton className="w-3.5 h-3.5 rounded shrink-0" />
							<Skeleton className="h-3.5 w-12 rounded-md" />
						</div>
						<Skeleton className="h-[22px] w-28 rounded-md" />
					</div>

					{showInstalledMetadata && (
						<>
							{/* Source */}
							<div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 py-2">
								<div className="flex items-center gap-1.5 shrink-0">
									<Skeleton className="w-3.5 h-3.5 rounded shrink-0" />
									<Skeleton className="h-3.5 w-14 rounded-md" />
								</div>
								<Skeleton className="h-[22px] w-20 rounded-md" />
							</div>
							{/* Path */}
							<div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 py-2">
								<div className="flex items-center gap-1.5 shrink-0">
									<Skeleton className="w-3.5 h-3.5 rounded shrink-0" />
									<Skeleton className="h-3.5 w-10 rounded-md" />
								</div>
								<Skeleton className="h-[22px] w-48 rounded-md" />
							</div>
							{/* Version */}
							<div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 py-2">
								<div className="flex items-center gap-1.5 shrink-0">
									<Skeleton className="w-3.5 h-3.5 rounded shrink-0" />
									<Skeleton className="h-3.5 w-14 rounded-md" />
								</div>
								<Skeleton className="h-[22px] w-36 rounded-md" />
							</div>
						</>
					)}
				</div>
			</CardContent>
		</Card>
	);
});

/**
 * Skeleton for the status overview banner on the dependencies page.
 * Pixel-matched single-row layout (min-h-[47px]).
 */
export const StatusBannerSkeleton = React.memo(function StatusBannerSkeleton() {
	return (
		<div className="flex flex-wrap items-center justify-between gap-4 p-3.5 rounded-xl border border-sidebar-border bg-sidebar/50 text-xs min-h-[47px]">
			<div className="flex flex-wrap items-center gap-4">
				{/* Installed: 3/3 */}
				<div className="flex items-center gap-1.5 font-normal">
					<Skeleton className="w-4 h-4 rounded-full shrink-0" />
					<Skeleton className="h-3.5 w-20 rounded-md" />
				</div>
				{/* Storage info */}
				<div className="flex items-center gap-1.5 font-normal">
					<Skeleton className="w-4 h-4 rounded shrink-0" />
					<Skeleton className="h-3.5 w-36 rounded-md" />
				</div>
			</div>
			{/* Right side: Managed App Storage • Verified SHA-256 Checksums */}
			<div className="flex items-center gap-2 shrink-0">
				<Skeleton className="h-3 w-28 rounded-md" />
				<Skeleton className="w-3.5 h-3.5 rounded-full shrink-0" />
				<Skeleton className="h-3 w-36 rounded-md" />
			</div>
		</div>
	);
});

/**
 * Skeleton for the header dependency badge.
 * Matches the "Install yt-dlp" button dimensions with icon + text shape.
 */
export const HeaderBadgeSkeleton = React.memo(function HeaderBadgeSkeleton() {
	return <Skeleton className="h-6 w-[167px] rounded-full shrink-0" />;
});

export interface DependenciesPageSkeletonProps {
	depMap?: Record<string, { status: string } | undefined>;
}

/**
 * Full dependencies page skeleton: status banner + 3 tool card skeletons.
 */
export const DependenciesPageSkeleton = React.memo(function DependenciesPageSkeleton() {
	return (
		<>
			<StatusBannerSkeleton />
			<div className="grid grid-cols-1 gap-4">
				<ToolCardSkeleton showInstalledMetadata={true} />
				<ToolCardSkeleton showInstalledMetadata={true} />
				<ToolCardSkeleton showInstalledMetadata={true} />
			</div>
		</>
	);
});
