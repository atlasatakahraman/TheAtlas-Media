// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-08-19
"use client";

import { useCallback, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FileProbeCard from "@/components/media/file-probe-card";
import JobProgressPanel from "@/components/media/job-progress";
import { MetadataSkeleton } from "@/components/media/skeleton";
import OutputDirPicker from "@/components/media/output-dir-picker";
import { useJobProgress, useJobs } from "@/hooks/use-media-jobs";
import { usePref } from "@/hooks/use-pref";
import { enqueue_convert, get_default_media_output_dir, probe_media_file } from "@/lib/media-env";
import { PREF_NAMESPACE } from "@/lib/prefs-env";
import { errorMessage, type MediaProbe } from "@/lib/types";
import PageShell from "@/layout/page/page-shell";
import { AUDIO_CODEC_OPTIONS, CONTAINER_OPTIONS, PAGE_DESCRIPTION, PAGE_TITLE, VIDEO_CODEC_OPTIONS } from "./data";

export default function Page() {
	const outputDir = usePref<string>(PREF_NAMESPACE.media, "outputDir", "");
	const [inputPath, setInputPath] = useState<string | null>(null);
	const [probe, setProbe] = useState<MediaProbe | null>(null);
	const [probing, setProbing] = useState(false);
	const [container, setContainer] = useState<(typeof CONTAINER_OPTIONS)[number]>("mp4");
	const [videoCodec, setVideoCodec] = useState<(typeof VIDEO_CODEC_OPTIONS)[number]>("copy");
	const [audioCodec, setAudioCodec] = useState<(typeof AUDIO_CODEC_OPTIONS)[number]>("copy");
	const [converting, setConverting] = useState(false);
	const [jobId, setJobId] = useState<number | null>(null);
	const jobs = useJobs();
	const activeJob = jobId != null ? jobs.find((job) => job.id === jobId) : undefined;
	const progress = useJobProgress(jobId);

	const handleChooseFile = useCallback(async () => {
		const selected = await open({ multiple: false });
		if (typeof selected !== "string") return;

		setInputPath(selected);
		setProbe(null);
		setProbing(true);
		try {
			setProbe(await probe_media_file(selected));
		} catch (error) {
			toast.error(errorMessage(error, "Could not read that file"));
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
	}, [outputDir]);

	const handleConvert = useCallback(async () => {
		if (!inputPath || !outputDir.value) return;
		setConverting(true);
		try {
			const id = await enqueue_convert({
				inputPath,
				outputDir: outputDir.value,
				container,
				videoCodec: videoCodec === "copy" ? null : videoCodec,
				audioCodec: audioCodec === "copy" ? null : audioCodec,
			});
			setJobId(id);
		} catch (error) {
			toast.error(errorMessage(error, "Could not start the conversion"));
		} finally {
			setConverting(false);
		}
	}, [inputPath, outputDir.value, container, videoCodec, audioCodec]);

	const fileName = inputPath?.split(/[\\/]/).pop() ?? "";

	return (
		<PageShell title={PAGE_TITLE} description={PAGE_DESCRIPTION} icon="RefreshCcw">
			<div className="max-w-lg space-y-5">
				<Button type="button" variant="outline" onClick={handleChooseFile}>
					<FileUp className="w-3.5 h-3.5" />
					Choose file…
				</Button>

				{probing && <MetadataSkeleton />}
				{!probing && probe && <FileProbeCard probe={probe} fileName={fileName} />}

				{inputPath && (
					<>
						<div className="grid grid-cols-3 gap-3">
							<div className="space-y-1.5">
								<label className="text-xs font-medium text-muted-foreground">Container</label>
								<Select value={container} onValueChange={(v) => setContainer(v as typeof container)}>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{CONTAINER_OPTIONS.map((option) => (
											<SelectItem key={option} value={option}>
												{option.toUpperCase()}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1.5">
								<label className="text-xs font-medium text-muted-foreground">Video</label>
								<Select value={videoCodec} onValueChange={(v) => setVideoCodec(v as typeof videoCodec)}>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{VIDEO_CODEC_OPTIONS.map((option) => (
											<SelectItem key={option} value={option}>
												{option}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1.5">
								<label className="text-xs font-medium text-muted-foreground">Audio</label>
								<Select value={audioCodec} onValueChange={(v) => setAudioCodec(v as typeof audioCodec)}>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{AUDIO_CODEC_OPTIONS.map((option) => (
											<SelectItem key={option} value={option}>
												{option}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						<div className="space-y-1.5">
							<label className="text-xs font-medium text-muted-foreground">Output directory</label>
							<OutputDirPicker value={outputDir.value} onChange={outputDir.set} />
						</div>

						<Button
							type="button"
							disabled={converting || !outputDir.value || jobId != null}
							onClick={handleConvert}
						>
							Convert
						</Button>
					</>
				)}

				{activeJob && (
					<JobProgressPanel status={activeJob.status} progress={progress ?? activeJob.progress} />
				)}
			</div>
		</PageShell>
	);
}
