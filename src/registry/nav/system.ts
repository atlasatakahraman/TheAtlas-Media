import type { NavGroup } from "./types";

export const SYSTEM_GROUP: NavGroup = {
	id: "sys",
	label: "System",
	items: [
		{
			id: "sys.downloads",
			title: "Downloads",
			icon: "FolderOpen",
			status: "planned",
			items: [
				{
					id: "sys.downloads.browse-files",
					title: "Browse Files",
					icon: "HardDrive",
					url: "/files/browse",
					status: "planned",
				},
				{
					id: "sys.downloads.history",
					title: "History",
					icon: "RotateCcwClock",
					url: "/files/history",
					status: "planned",
				},
				{
					id: "sys.downloads.queue",
					title: "Queue",
					icon: "Database",
					url: "/files/queue",
					status: "ready",
				},
			],
		},
		{
			id: "sys.settings",
			title: "Settings",
			icon: "Settings",
			status: "ready",
			items: [
				{
					id: "sys.settings.dependencies",
					title: "Dependencies",
					icon: "Package",
					url: "/settings/dependencies",
					status: "ready",
				},
				{
					id: "sys.settings.downloads",
					title: "Downloads",
					icon: "Download",
					url: "/settings/downloads",
					status: "ready",
				},
				{
					id: "sys.settings.general",
					title: "General",
					icon: "Wrench",
					url: "/settings/general",
					status: "planned",
				},
				{
					id: "sys.settings.ffmpeg",
					title: "ffmpeg",
					icon: "Terminal",
					url: "/settings/ffmpeg",
					status: "planned",
				},
				{
					id: "sys.settings.yt-dlp",
					title: "yt-dlp",
					icon: "Terminal",
					url: "/settings/ytdlp",
					status: "planned",
				},
			],
		},
	],
};
