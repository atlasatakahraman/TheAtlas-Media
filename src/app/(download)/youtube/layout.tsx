

export default function Layout({ children }: React.PropsWithChildren) {
	return (
		<div className="flex-1 h-full w-full px-2 py-1">
			<div className="flex-1 h-full flex justify-center items-center">
				{children}
			</div>
		</div>
	)
}
