/** Pure logic for /youtube/download/video. No JSX, no hooks — testable. */

import type { DownloadSpec } from "@/lib/media-env";
import type { VideoMetadata } from "@/lib/types";

/** Builds the `enqueue_download` request from probed metadata and the page's
 *  current form state. */
export function buildDownloadSpec(params: {
	url: string;
	metadata: VideoMetadata;
	formatId: string | null;
	audioOnly: boolean;
	outputDir: string;
}): DownloadSpec {
	return {
		url: params.url,
		title: params.metadata.title,
		formatId: params.formatId,
		audioOnly: params.audioOnly,
		outputDir: params.outputDir,
	};
}
