import { Input } from "@/components/ui/input";

// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md on 2026-06-21
export default function YoutubeDownloadPage() {
	return (
		<div className="flex-col gap-4 flex">
			<Input className="w-md mx-auto" id="video"></Input>
		</div>
	)
}
