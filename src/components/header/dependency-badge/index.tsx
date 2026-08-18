"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Download, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DependencyInstallDialog } from "@/components/dependency-dialogs";
import useDependency from "@/hooks/use-dependency";
import { useInstall, type ToolInstallInfo } from "@/hooks/use-install";
import { useIsMounted } from "@/hooks/use-is-mounted";
import {
	getDependencyBadgeDetails,
	getToolSpecificDescription,
	NO_BADGE,
} from "./functions";

/**
 * Header slot for dependency health.
 *
 * Owns its own toast and confirm dialog so it is self-contained: registering it
 * in `HEADER_SLOTS` is the whole integration, and removing it from that array
 * removes the feature entirely.
 */
export default function DependencyBadge() {
	const router = useRouter();
	const dependencies = useDependency();
	const mounted = useIsMounted();
	const { confirmTarget, requestConfirm, requestConfirmAll, closeConfirm, confirmAndInstall } =
		useInstall();

	const hasNotified = useRef(false);

	const details = useMemo(
		() =>
			dependencies.status === "loading"
				? NO_BADGE
				: getDependencyBadgeDetails(dependencies.deps),
		[dependencies]
	);

	const handleBadgeClick = useCallback(() => {
		router.push("/settings/dependencies");
	}, [router]);

	const handleToastInstallClick = useCallback(() => {
		if (dependencies.status === "loading") return;
		const { ffmpeg, ffprobe, ytdlp } = dependencies.deps;

		const toolsToInstall: ToolInstallInfo[] = details.tools.map((tool) => {
			const info = tool === "yt-dlp" ? ytdlp : tool === "FFmpeg" ? ffmpeg : ffprobe;
			return {
				name: tool,
				currentVersion: info?.version ?? "Not Installed",
				targetVersion: info?.latestVersion ?? "Latest Release",
			};
		});

		if (toolsToInstall.length === 1) {
			const target = toolsToInstall[0];
			requestConfirm(
				target.name,
				target.currentVersion,
				target.targetVersion,
				details.isMissing ? `Install ${target.name}?` : `Update ${target.name}?`
			);
			return;
		}

		requestConfirmAll(
			toolsToInstall,
			details.isMissing ? "Install All Missing Dependencies" : "Install All Updates"
		);
	}, [details.isMissing, details.tools, dependencies, requestConfirm, requestConfirmAll]);

	// Fires once per app session, on the first non-loading report that has
	// something to say.
	useEffect(() => {
		if (dependencies.status === "loading" || hasNotified.current || !details.show) return;

		hasNotified.current = true;
		toast.info(details.label, {
			description: getToolSpecificDescription(details.isMissing),
			action: {
				label: details.actionLabel,
				onClick: () => handleToastInstallClick(),
			},
		});
	}, [dependencies, details, handleToastInstallClick]);

	const visible = mounted && dependencies.status === "ready" && details.show;

	return (
		<>
			{visible ? (
				<Button
					variant={details.isMissing ? "destructive" : "default"}
					size="xs"
					onClick={handleBadgeClick}
					className="gap-1 rounded-full px-2.5 cursor-pointer select-none shadow-xs duration-500 animate-in slide-in-from-top-9 fade-in-0 transition-[opacity,transform] ease-out group"
				>
					{details.isMissing ? (
						<Download className="w-3 h-3 transition-transform duration-200 ease-out group-hover:scale-105 group-hover:translate-y-[1px]" />
					) : (
						<Sparkles className="w-3 h-3 transition-transform duration-200 ease-out group-hover:scale-105 group-hover:rotate-6" />
					)}
					{details.shortLabel}
				</Button>
			) : null}

			<DependencyInstallDialog
				confirmTarget={confirmTarget}
				onClose={closeConfirm}
				onConfirm={confirmAndInstall}
			/>
		</>
	);
}
