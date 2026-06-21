// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md on 2026-06-21

export default function Layout({ children }: React.PropsWithChildren) {
	return (
		<div className="flex-1 h-full w-full px-2 py-1">
			<div className="flex-1 h-full flex justify-center items-center">
				{children}
			</div>
		</div>
	)
}
