import * as React from "react"

export function useIsCantDisplay(mobileBreakpoint = 768) {
	const [isCantDisplay, setIsCantDisplay] = React.useState<boolean | undefined>(undefined)

	const mount = React.useRef(false);

	React.useEffect(() => {

		if (mount.current) return;
		mount.current = true;

		const mql = window.matchMedia(`(max-width: ${mobileBreakpoint - 1}px)`)
		const onChange = () => {
			setIsCantDisplay(window.innerWidth < mobileBreakpoint)
		}
		mql.addEventListener("change", onChange)
		setIsCantDisplay(window.innerWidth < mobileBreakpoint)
		return () => mql.removeEventListener("change", onChange)
	}, [mobileBreakpoint])

	return !!isCantDisplay
}
