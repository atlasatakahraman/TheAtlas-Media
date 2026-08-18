"use client";

import { useState } from "react";
import {
	Building2,
	Check,
	Copy,
	ExternalLink,
	FolderOpen,
	HardDrive,
	Info,
	Loader2,
	Route,
	Scale,
	ShieldCheck,
	Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatSourceLabel } from "@/lib/tool-names";
import { cn, formatSizeBytes, formatSizeMb } from "@/lib/utils";
import { formatVersionDisplay } from "@/lib/version";
import MetaRow from "../meta-row";
import type { ToolMetaProps } from "./types";

const CHIP =
	"inline-block font-mono text-[11px] bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50 text-muted-foreground";

/**
 * A tool card's metadata list.
 *
 * Resolved facts come first — path, version, checksum, size, source — because
 * they are what a user opens this page to check. The static licence/publisher/
 * credits rows always render, so a missing tool still shows what it would be.
 */
export default function ToolMeta({
	tool,
	info,
	isInstalled,
	isRevealingPath,
	onRevealPath,
	onChangePathClick,
}: ToolMetaProps) {
	const [copiedSha, setCopiedSha] = useState(false);

	function handleCopySha(sha256: string) {
		navigator.clipboard.writeText(sha256);
		setCopiedSha(true);
		setTimeout(() => setCopiedSha(false), 2000);
		toast.success(`Copied ${tool.name} SHA-256 checksum`);
	}

	const hasSize = (info?.sizeBytes != null && info.sizeBytes > 0) || !!info?.sizeMb;

	return (
		<TooltipProvider>
			<div className="divide-y divide-sidebar-border/30">
				{isInstalled && info && (
					<>
						<MetaRow icon={Terminal} label="Path">
							<div className="flex items-start gap-1.5 flex-wrap">
								{info.path ? (
									<Tooltip>
										<TooltipTrigger asChild>
											<button
												onClick={() => onRevealPath(info.path!)}
												className="inline-flex items-start gap-1.5 font-mono text-[11px] bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50 text-muted-foreground cursor-pointer hover:bg-background transition-colors break-all text-left max-w-full"
											>
												{isRevealingPath ? (
													<Loader2 className="w-3 h-3 shrink-0 text-primary animate-spin mt-0.5" />
												) : (
													<FolderOpen className="w-3 h-3 shrink-0 text-primary/60 mt-0.5" />
												)}
												{info.path}
											</button>
										</TooltipTrigger>
										<TooltipContent side="top">Reveal in file manager</TooltipContent>
									</Tooltip>
								) : (
									<span className={cn(CHIP, "break-all")}>N/A</span>
								)}
								{info.path && (
									<Tooltip>
										<TooltipTrigger asChild>
											<button
												onClick={() => onChangePathClick(tool.key)}
												className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded-md border border-sidebar-border/50 text-primary hover:bg-background transition-colors cursor-pointer shrink-0 group/change-btn"
											>
												<Route className="w-3 h-3 transition-transform duration-200 ease-out group-hover/change-btn:scale-115" />
												Change
											</button>
										</TooltipTrigger>
										<TooltipContent side="top">
											Pick a different installation to use
										</TooltipContent>
									</Tooltip>
								)}
							</div>
						</MetaRow>

						{info.version && (
							<MetaRow icon={Info} label="Version">
								<span className={cn(CHIP, "break-all leading-relaxed")}>
									{formatVersionDisplay(info.version)}
								</span>
							</MetaRow>
						)}

						{info.sha256 && (
							<MetaRow verified icon={ShieldCheck} label="SHA-256 Checksum">
								<Tooltip>
									<TooltipTrigger asChild>
										<button
											onClick={() => handleCopySha(info.sha256!)}
											className="inline-flex items-start gap-1.5 font-mono text-[11px] bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50 text-muted-foreground cursor-pointer hover:bg-background transition-colors break-all text-left max-w-full"
										>
											{copiedSha ? (
												<Check className="w-3 h-3 shrink-0 text-chart-1 mt-0.5" />
											) : (
												<Copy className="w-3 h-3 shrink-0 text-primary/60 mt-0.5" />
											)}
											{info.sha256}
										</button>
									</TooltipTrigger>
									<TooltipContent side="top">Click to copy checksum</TooltipContent>
								</Tooltip>
							</MetaRow>
						)}

						{hasSize && (
							<MetaRow icon={HardDrive} label="Binary Size">
								{/* Exact bytes when known: a ~100 KiB yt-dlp.exe would
								    otherwise collapse to "0.1 MB". */}
								<span className={CHIP}>
									{info.sizeBytes != null && info.sizeBytes > 0
										? formatSizeBytes(info.sizeBytes)
										: formatSizeMb(info.sizeMb)}
								</span>
							</MetaRow>
						)}

						<MetaRow icon={HardDrive} label="Source">
							<span
								className={cn(
									"inline-block font-mono text-[11px] px-2 py-0.5 rounded-md border",
									info.source === "managed"
										? "bg-chart-1/10 border-chart-1/30 text-chart-1"
										: "bg-background/50 border-sidebar-border/50 text-muted-foreground"
								)}
							>
								{formatSourceLabel(info.source)}
							</span>
						</MetaRow>
					</>
				)}

				<MetaRow icon={Scale} label="License">
					<span className={CHIP}>{tool.license}</span>
				</MetaRow>

				<MetaRow icon={Building2} label="Publisher">
					<span className={CHIP}>{tool.publisher}</span>
				</MetaRow>

				<MetaRow icon={ExternalLink} label="Credits">
					<a
						href={tool.websiteUrl}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline bg-background/50 px-2 py-0.5 rounded-md border border-sidebar-border/50 transition-colors"
					>
						{tool.name} Official
						<ExternalLink className="w-3 h-3 opacity-70" />
					</a>
				</MetaRow>
			</div>
		</TooltipProvider>
	);
}
