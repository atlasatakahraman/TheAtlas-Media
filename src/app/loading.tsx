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
				strokeWidth="1.5"
				strokeLinecap="round"
			/>
		</svg>
	);
};


export default function Loading() {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
			<div className="relative flex flex-col items-center gap-4">
				<YoutubeLoadingSvg />
			</div>
		</div>
	);
}
