"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder for `VideoMetadataCard`/`FileProbeCard` while a probe is
 *  in flight. Pixel-matched to the real layout so the page does not jump
 *  when the probe resolves. */
export const MetadataSkeleton = React.memo(function MetadataSkeleton() {
	return (
		<div className="flex gap-3 rounded-xl border border-sidebar-border bg-sidebar/40 p-3">
			<Skeleton className="w-32 aspect-video shrink-0 rounded-md" />
			<div className="min-w-0 space-y-2 flex-1 py-1">
				<Skeleton className="h-4 w-3/4 rounded-md" />
				<Skeleton className="h-3 w-1/2 rounded-md" />
			</div>
		</div>
	);
});

/** Placeholder for a `/files/queue` row while the initial `refreshFromServer`
 *  fetch is in flight. */
export const QueueRowSkeleton = React.memo(function QueueRowSkeleton() {
	return (
		<div className="rounded-xl border border-sidebar-border bg-sidebar/40 p-3 space-y-2.5">
			<div className="flex items-center justify-between gap-2">
				<Skeleton className="h-4 w-2/3 rounded-md" />
				<Skeleton className="h-7 w-16 rounded-md" />
			</div>
			<Skeleton className="h-2 w-full rounded-full" />
		</div>
	);
});

export const QueueSkeleton = React.memo(function QueueSkeleton() {
	return (
		<div className="space-y-2.5">
			<QueueRowSkeleton />
			<QueueRowSkeleton />
			<QueueRowSkeleton />
		</div>
	);
});
