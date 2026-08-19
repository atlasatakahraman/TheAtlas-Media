"use client";

import { formatDuration } from "@/components/media/video-metadata-card/functions";
import type { FileProbeCardProps } from "./types";

/** A local file's `ffprobe` summary — no thumbnail, unlike
 *  `VideoMetadataCard`, so it stays a separate small component. */
export default function FileProbeCard({ probe, fileName }: FileProbeCardProps) {
	const duration = formatDuration(probe.durationSecs);
	const resolution = probe.width && probe.height ? `${probe.width}x${probe.height}` : null;
	const details = [probe.container?.toUpperCase(), resolution, duration, probe.videoCodec, probe.audioCodec]
		.filter(Boolean)
		.join(" · ");

	return (
		<div className="rounded-xl border border-sidebar-border bg-sidebar/40 p-3 space-y-1">
			<p className="text-sm font-medium truncate">{fileName}</p>
			<p className="text-xs text-muted-foreground">{details || "No metadata"}</p>
		</div>
	);
}
