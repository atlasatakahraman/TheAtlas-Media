// next@16.2.6 — verified against node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md on 2026-05-31
export const YoutubeLoadingSvg: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
	return (
		<svg
			{...props}
			className={`h-10 w-10 animate-youtube-rotate text-primary ${props.className || ""}`}
			viewBox="0 0 50 50"
		>
			<circle
				className="animate-youtube-dash"
				cx="25"
				cy="25"
				r="20"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
			/>
		</svg>
	);
};

export default function Loading() {
	return (
		<div className="flex h-full w-full items-center justify-center bg-secondary backdrop-blur-sm">
			<div className="relative flex flex-col items-center gap-4">
				<YoutubeLoadingSvg />
			</div>
		</div>
	);
}
