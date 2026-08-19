"use client";

import { formatDuration } from "./functions";
import type { VideoMetadataCardProps } from "./types";

/** Probed-video summary: thumbnail, title, duration, uploader. Uses a plain
 *  img element, not next/image — forbidden repo-wide; CSP img-src already allows https:. */
export default function VideoMetadataCard({ metadata }: VideoMetadataCardProps) {
	const duration = formatDuration(metadata.durationSecs);

	return (
		<div className="flex gap-3 rounded-xl border border-sidebar-border bg-sidebar/40 p-3">
			{metadata.thumbnailUrl && (
				// eslint-disable-next-line @next/next/no-img-element -- images are globally unoptimized; next/image is disallowed project-wide
				<img
					src={metadata.thumbnailUrl}
					alt=""
					className="w-32 aspect-video shrink-0 rounded-md object-cover"
				/>
			)}
			<div className="min-w-0 space-y-1">
				<p className="text-sm font-medium truncate">{metadata.title}</p>
				<p className="text-xs text-muted-foreground">
					{[metadata.uploader, duration].filter(Boolean).join(" · ") || "No metadata"}
				</p>
			</div>
		</div>
	);
}
