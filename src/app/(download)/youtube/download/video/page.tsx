// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-08-19
"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import FormatSelect from "@/components/media/format-select";
import JobProgressPanel from "@/components/media/job-progress";
import { MetadataSkeleton } from "@/components/media/skeleton";
import OutputDirPicker from "@/components/media/output-dir-picker";
import VideoMetadataCard from "@/components/media/video-metadata-card";
import { useJobProgress, useJobs } from "@/hooks/use-media-jobs";
import { usePref } from "@/hooks/use-pref";
import { enqueue_download, get_default_media_output_dir, probe_media_url } from "@/lib/media-env";
import { PREF_NAMESPACE } from "@/lib/prefs-env";
import { errorMessage, type VideoMetadata } from "@/lib/types";
import PageShell from "@/layout/page/page-shell";
import { buildDownloadSpec } from "./functions";
import { PAGE_DESCRIPTION, PAGE_TITLE } from "./data";

export default function Page() {
	const outputDir = usePref<string>(PREF_NAMESPACE.media, "outputDir", "");
	const [url, setUrl] = useState("");
	const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
	const [probing, setProbing] = useState(false);
	const [formatId, setFormatId] = useState<string | null>(null);
	const [audioOnly, setAudioOnly] = useState(false);
	const [downloading, setDownloading] = useState(false);
	const [jobId, setJobId] = useState<number | null>(null);
	const jobs = useJobs();
	const activeJob = jobId != null ? jobs.find((job) => job.id === jobId) : undefined;
	const progress = useJobProgress(jobId);

	const handleProbe = useCallback(async () => {
		if (!url.trim()) return;
		setMetadata(null);
		setFormatId(null);
		setProbing(true);
		try {
			setMetadata(await probe_media_url(url.trim()));
		} catch (error) {
			toast.error(errorMessage(error, "Could not read that video"));
		} finally {
			setProbing(false);
		}

		if (!outputDir.value) {
			try {
				outputDir.set(await get_default_media_output_dir());
			} catch {
				// The output-dir field just stays empty; the user can browse to one.
			}
		}
	}, [url, outputDir]);

	const handleDownload = useCallback(async () => {
		if (!metadata || !outputDir.value) return;
		setDownloading(true);
		try {
			const id = await enqueue_download(
				buildDownloadSpec({ url: url.trim(), metadata, formatId, audioOnly, outputDir: outputDir.value })
			);
			setJobId(id);
		} catch (error) {
			toast.error(errorMessage(error, "Could not start the download"));
		} finally {
			setDownloading(false);
		}
	}, [metadata, outputDir.value, url, formatId, audioOnly]);

	return (
		<PageShell title={PAGE_TITLE} description={PAGE_DESCRIPTION} icon="Download">
			<div className="max-w-lg space-y-5">
				<div className="flex gap-2">
					<Input
						id="url"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="https://youtube.com/watch?v=…"
						className="flex-1"
					/>
					<Button type="button" onClick={handleProbe} disabled={probing || !url.trim()}>
						Fetch
					</Button>
				</div>

				{probing && <MetadataSkeleton />}
				{!probing && metadata && <VideoMetadataCard metadata={metadata} />}

				{metadata && (
					<>
						<div className="space-y-1.5">
							<label className="text-xs font-medium text-muted-foreground">Format</label>
							<FormatSelect formats={metadata.formats} value={formatId} onChange={setFormatId} />
						</div>

						<div className="flex items-center gap-2">
							<Switch checked={audioOnly} onCheckedChange={setAudioOnly} id="audio-only" />
							<label htmlFor="audio-only" className="text-sm">
								Audio only
							</label>
						</div>

						<div className="space-y-1.5">
							<label className="text-xs font-medium text-muted-foreground">Output directory</label>
							<OutputDirPicker value={outputDir.value} onChange={outputDir.set} />
						</div>

						<Button
							type="button"
							disabled={downloading || !outputDir.value || jobId != null}
							onClick={handleDownload}
						>
							Download
						</Button>
					</>
				)}

				{activeJob && (
					<>
						<JobProgressPanel status={activeJob.status} progress={progress ?? activeJob.progress} />
						<Link href="/files/queue" className="text-xs text-primary hover:underline">
							View in queue →
						</Link>
					</>
				)}
			</div>
		</PageShell>
	);
}
