import {
	LucideVideo,
	LucideDownload,
	LucideInfo,
	LucideImage,
	LucideMusic,
	LucideList,
	LucideSettings,
	LucideHistory,
	LucideFileVideo2,
	LucideListVideo,
	LucideUser,
	LucideFilm,
	LucideFileAudio,
	LucideActivity,
	LucideDisc3,
	LucideArrowRightLeft,
	LucideFileOutput,
	LucideClapperboard,
	LucideMonitor,
	LucideScanLine,
	LucideScissors,
	LucideGauge,
	LucideRatio,
	LucideVolume2,
	LucideLayoutGrid,
	LucideHardDrive,
	LucideFolderOpen,
	LucideDatabase,
	LucideWrench,
	LucideTerminal,
	LucidePalette,
	LucideSparkles,
	LucideFileImage,
	LucideLayers,
	LucideSquarePlay,
	LucideAudioLines,
	LucideImageDown,
	LucideCaptions,
	LucideCirclePlay,
	LucideTv,
	LucideRadio,
	LucideFileMusic,
	LucideTimer,
	LucideSplit,
	LucideReplace,
	LucideScaling,
	LucideCrop,
	LucideRefreshCcw,
	LucideSun,
	LucideContrast,
	LucideCpu,
	LucideGlobe,
	LucidePackage,
	LucideZap,
	LucideBox,
	LucideGrid2x2,
} from "lucide-react";
import type { MenuGroup } from "./types";

export function getSidebarMenuGroups(): MenuGroup[] {
	return [
		// =====================================================================
		// MEDIA DOWNLOAD TOOLS — yt-dlp powered download & metadata extraction
		// =====================================================================
		{
			label: "Youtube Tools",
			items: [
				{
					title: "Download",
					icon: LucideDownload,
					items: [
						{
							title: "Single Video",
							icon: LucideFileVideo2,
							url: "/youtube/download/video#url",
							short_url: "ytdv",
						},
						{
							title: "Playlist",
							icon: LucideListVideo,
							url: "/youtube/download/playlist#url",
							short_url: 'ytdp',
						},
						{
							title: "Channel",
							icon: LucideUser,
							url: "/youtube/download/channel#url",
							short_url: 'ytdc',
						},
						{
							title: "Audio Only",
							icon: LucideMusic,
							url: "/youtube/download/audio#url",
							short_url: 'ytda',
						},
						{
							title: "Subtitles",
							icon: LucideCaptions,
							url: "/youtube/download/subtitles#url",
							short_url: 'ytds',
						},
						{
							title: "Thumbnail",
							icon: LucideImageDown,
							url: "/youtube/download/thumbnail#url",
							short_url: 'ytdt',
						},
					],
				},
				{
					title: "Metadata",
					icon: LucideInfo,
					items: [
						{
							title: "Video Info",
							icon: LucideCirclePlay,
							url: "/youtube/metadata/video",
							short_url: 'ytmv',
						},
						{
							title: "Playlist Index",
							icon: LucideList,
							url: "/youtube/metadata/playlist",
							short_url: 'ytmp',
						},
						{
							title: "Format Inspector",
							icon: LucideScanLine,
							url: "/youtube/metadata/formats",
							short_url: 'ytmf',
						},
					],
				},
				{
					title: "Format Selection",
					icon: LucideLayoutGrid,
					items: [
						{
							title: "Best Quality",
							icon: LucideSparkles,
							url: "/youtube/format/best",
						},
						{
							title: "By Resolution",
							icon: LucideMonitor,
							items: [
								{
									title: "4K (2160p)",
									icon: LucideTv,
									url: "/youtube/format#2160p",
									short_url: 'ytf4k',
								},
								{
									title: "2K (1440p)",
									icon: LucideTv,
									url: "/youtube/format#1440p",
									short_url: 'ytf2k',
								},
								{
									title: "Full HD (1080p)",
									icon: LucideMonitor,
									url: "/youtube/format#1080p",
									short_url: 'ytffhd',
								},
								{
									title: "HD (720p)",
									icon: LucideMonitor,
									url: "/youtube/format#720p",
									short_url: 'ytfhd',
								},
								{
									title: "SD (480p)",
									icon: LucideMonitor,
									url: "/youtube/format#480p",
									short_url: 'ytfsd',
								},
							],
						},
						{
							title: "By Codec",
							icon: LucideFilm,
							items: [
								{
									title: "AV1",
									icon: LucideZap,
									url: "/youtube/format/av1",
								},
								{
									title: "VP9",
									icon: LucideSquarePlay,
									url: "/youtube/format/vp9",
								},
								{
									title: "H.264 / AVC",
									icon: LucideVideo,
									url: "/youtube/format/h264",
								},
							],
						},
						{
							title: "Audio Formats",
							icon: LucideActivity,
							items: [
								{
									title: "Opus",
									icon: LucideRadio,
									url: "/youtube/format/opus",
								},
								{
									title: "AAC",
									icon: LucideAudioLines,
									url: "/youtube/format/aac",
								},
								{
									title: "MP3 320kbps",
									icon: LucideMusic,
									url: "/youtube/format/mp3",
								},
							],
						},
					],
				},
			],
		},

		// =====================================================================
		// VIDEO CONVERSION — ffmpeg powered transcoding, editing-optimized
		// =====================================================================
		{
			label: "Video Conversion",
			items: [
				{
					title: "Transcode",
					icon: LucideArrowRightLeft,
					items: [
						{
							title: "Quick Convert",
							icon: LucideGauge,
							url: "/convert/quick",
						},
						{
							title: "To Container",
							icon: LucideFileOutput,
							items: [
								{
									title: "MP4",
									icon: LucideBox,
									url: "/convert/container/mp4",
								},
								{
									title: "MKV",
									icon: LucideBox,
									url: "/convert/container/mkv",
								},
								{
									title: "MOV",
									icon: LucideBox,
									url: "/convert/container/mov",
								},
								{
									title: "WebM",
									icon: LucideBox,
									url: "/convert/container/webm",
								},
								{
									title: "AVI",
									icon: LucideBox,
									url: "/convert/container/avi",
								},
							],
						},
						{
							title: "Batch Convert",
							icon: LucideLayers,
							url: "/convert/batch",
						},
					],
				},
				{
					title: "Video Codecs",
					icon: LucideFilm,
					items: [
						{
							title: "H.264 / AVC",
							icon: LucideVideo,
							url: "/convert/codec/h264",
						},
						{
							title: "H.265 / HEVC",
							icon: LucideVideo,
							url: "/convert/codec/h265",
						},
						{
							title: "AV1 (SVT-AV1)",
							icon: LucideZap,
							url: "/convert/codec/av1",
						},
						{
							title: "VP9",
							icon: LucideSquarePlay,
							url: "/convert/codec/vp9",
						},
						{
							title: "ProRes 422",
							icon: LucideClapperboard,
							url: "/convert/codec/prores",
						},
						{
							title: "ProRes 4444",
							icon: LucideClapperboard,
							url: "/convert/codec/prores4444",
						},
						{
							title: "DNxHR / DNxHD",
							icon: LucideClapperboard,
							url: "/convert/codec/dnxhr",
						},
					],
				},
				{
					title: "Audio Codecs",
					icon: LucideFileAudio,
					items: [
						{
							title: "AAC",
							icon: LucideAudioLines,
							url: "/convert/audio/aac",
						},
						{
							title: "MP3 (LAME)",
							icon: LucideMusic,
							url: "/convert/audio/mp3",
						},
						{
							title: "FLAC",
							icon: LucideDisc3,
							url: "/convert/audio/flac",
						},
						{
							title: "WAV (PCM)",
							icon: LucideActivity,
							url: "/convert/audio/wav",
						},
						{
							title: "Opus",
							icon: LucideRadio,
							url: "/convert/audio/opus",
						},
						{
							title: "ALAC",
							icon: LucideFileMusic,
							url: "/convert/audio/alac",
						},
					],
				},
				{
					title: "NLE Presets",
					icon: LucideClapperboard,
					items: [
						{
							title: "Premiere Pro",
							icon: LucidePalette,
							items: [
								{
									title: "H.264 + AAC",
									icon: LucideVideo,
									url: "/convert/preset/premiere/h264",
								},
								{
									title: "ProRes 422 HQ",
									icon: LucideClapperboard,
									url: "/convert/preset/premiere/prores-hq",
								},
								{
									title: "Proxy (¼ Res)",
									icon: LucideGauge,
									url: "/convert/preset/premiere/proxy",
								},
							],
						},
						{
							title: "DaVinci Resolve",
							icon: LucidePalette,
							items: [
								{
									title: "DNxHR HQX 10-bit",
									icon: LucideClapperboard,
									url: "/convert/preset/resolve/dnxhr-hqx",
								},
								{
									title: "ProRes 422",
									icon: LucideClapperboard,
									url: "/convert/preset/resolve/prores",
								},
								{
									title: "H.264 High GPU",
									icon: LucideCpu,
									url: "/convert/preset/resolve/h264-gpu",
								},
							],
						},
						{
							title: "Final Cut Pro",
							icon: LucidePalette,
							items: [
								{
									title: "ProRes 422",
									icon: LucideClapperboard,
									url: "/convert/preset/fcp/prores",
								},
								{
									title: "ProRes 4444",
									icon: LucideClapperboard,
									url: "/convert/preset/fcp/prores4444",
								},
								{
									title: "HEVC HW",
									icon: LucideCpu,
									url: "/convert/preset/fcp/hevc",
								},
							],
						},
						{
							title: "After Effects",
							icon: LucidePalette,
							items: [
								{
									title: "ProRes 4444 VFX",
									icon: LucideClapperboard,
									url: "/convert/preset/ae/prores4444",
								},
								{
									title: "PNG Sequence",
									icon: LucideFileImage,
									url: "/convert/preset/ae/png-seq",
								},
								{
									title: "EXR Sequence",
									icon: LucideFileImage,
									url: "/convert/preset/ae/exr-seq",
								},
							],
						},
					],
				},
				{
					title: "HW Acceleration",
					icon: LucideCpu,
					items: [
						{
							title: "NVENC (NVIDIA)",
							icon: LucideGauge,
							url: "/convert/hwaccel/nvenc",
						},
						{
							title: "QSV (Intel)",
							icon: LucideGauge,
							url: "/convert/hwaccel/qsv",
						},
						{
							title: "VAAPI (Linux)",
							icon: LucideGlobe,
							url: "/convert/hwaccel/vaapi",
						},
						{
							title: "VideoToolbox",
							icon: LucideMonitor,
							url: "/convert/hwaccel/vtb",
						},
						{
							title: "AMF (AMD)",
							icon: LucideCpu,
							url: "/convert/hwaccel/amf",
						},
					],
				},
			],
		},

		// =====================================================================
		// MEDIA PROCESSING — clip, trim, extract, image sequences
		// =====================================================================
		{
			label: "Media Processing",
			items: [
				{
					title: "Trim & Cut",
					icon: LucideScissors,
					items: [
						{
							title: "Lossless Trim",
							icon: LucideScissors,
							url: "/process/trim/lossless",
						},
						{
							title: "Frame-Accurate Cut",
							icon: LucideTimer,
							url: "/process/trim/frame-accurate",
						},
						{
							title: "Split by Duration",
							icon: LucideSplit,
							url: "/process/trim/split",
						},
					],
				},
				{
					title: "Audio Processing",
					icon: LucideVolume2,
					items: [
						{
							title: "Extract Track",
							icon: LucideMusic,
							url: "/process/audio/extract",
						},
						{
							title: "Normalize",
							icon: LucideActivity,
							url: "/process/audio/normalize",
						},
						{
							title: "Merge Tracks",
							icon: LucideDisc3,
							url: "/process/audio/merge",
						},
						{
							title: "Replace Audio",
							icon: LucideReplace,
							url: "/process/audio/replace",
						},
					],
				},
				{
					title: "Image & Frames",
					icon: LucideFileImage,
					items: [
						{
							title: "Extract Frames",
							icon: LucideImage,
							url: "/process/frames/extract",
						},
						{
							title: "Sequence → Video",
							icon: LucideFilm,
							url: "/process/frames/sequence",
						},
						{
							title: "GIF Creation",
							icon: LucideCirclePlay,
							url: "/process/frames/gif",
						},
						{
							title: "Contact Sheet",
							icon: LucideGrid2x2,
							url: "/process/frames/contact-sheet",
						},
					],
				},
				{
					title: "Video Adjustments",
					icon: LucideRatio,
					items: [
						{
							title: "Scale / Resize",
							icon: LucideScaling,
							url: "/process/adjust/scale",
						},
						{
							title: "Crop",
							icon: LucideCrop,
							url: "/process/adjust/crop",
						},
						{
							title: "Frame Rate",
							icon: LucideRefreshCcw,
							url: "/process/adjust/fps",
						},
						{
							title: "Deinterlace",
							icon: LucideScanLine,
							url: "/process/adjust/deinterlace",
						},
						{
							title: "Color Space",
							icon: LucideContrast,
							url: "/process/adjust/colorspace",
						},
						{
							title: "HDR → SDR",
							icon: LucideSun,
							url: "/process/adjust/tonemap",
						},
					],
				},
			],
		},

		// =====================================================================
		// FILE MANAGEMENT & SYSTEM
		// =====================================================================
		{
			label: "System",
			items: [
				{
					title: "Downloads",
					icon: LucideFolderOpen,
					items: [
						{
							title: "Browse Files",
							icon: LucideHardDrive,
							url: "/files/browse",
						},
						{
							title: "History",
							icon: LucideHistory,
							url: "/files/history",
						},
						{
							title: "Queue",
							icon: LucideDatabase,
							url: "/files/queue",
						},
					],
				},
				{
					title: "Settings",
					icon: LucideSettings,
					items: [
						{
							title: "General",
							icon: LucideWrench,
							url: "/settings/general",
						},
						{
							title: "Downloads",
							icon: LucideDownload,
							url: "/settings/downloads",
						},
						{
							title: "ffmpeg",
							icon: LucideTerminal,
							url: "/settings/ffmpeg",
						},
						{
							title: "yt-dlp",
							icon: LucideTerminal,
							url: "/settings/ytdlp",
						},
						{
							title: "Dependencies",
							icon: LucidePackage,
							url: "/settings/dependencies",
						},
					],
				},
			],
		},
	];
}
