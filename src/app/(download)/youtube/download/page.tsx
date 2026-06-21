import { Input } from "@/components/ui/input";

// next@16.2.6 — verified against node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md on 2026-05-31
export default function YoutubeDownloadPage() {
	return (
		<div className="flex-1 h-full flex justify-center items-center">
			<div className="flex-col gap-4 flex">
				<Input className="w-md mx-auto" id="video"></Input>
				<Input className="w-md mx-auto" id="playlist"></Input>
				<Input className="w-md mx-auto" id="channel"></Input>
			</div>
		</div>
	)
}
