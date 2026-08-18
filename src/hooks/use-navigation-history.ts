import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname } from "next/navigation";

export function useNavigationHistory() {
	const pathname = usePathname();
	const historyStackRef = useRef<string[]>([]);
	const currentIndexRef = useRef<number>(0);
	const [canGoBack, setCanGoBack] = useState<boolean>(false);
	const [canGoForward, setCanGoForward] = useState<boolean>(false);
	const isPopStateRef = useRef<boolean>(false);

	useEffect(() => {
		const handlePopState = () => {
			isPopStateRef.current = true;
		};

		window.addEventListener("popstate", handlePopState);
		return () => {
			window.removeEventListener("popstate", handlePopState);
		};
	}, []);

	useEffect(() => {
		if (historyStackRef.current.length === 0) {
			historyStackRef.current = [pathname];
			currentIndexRef.current = 0;
		} else if (isPopStateRef.current) {
			isPopStateRef.current = false;
			// Find index in history if possible, or adjust based on history.state
			const stateIdx = typeof window !== "undefined" ? (window.history.state?.idx as number | undefined) : undefined;
			if (typeof stateIdx === "number" && stateIdx >= 0) {
				currentIndexRef.current = Math.min(stateIdx, historyStackRef.current.length - 1);
			} else {
				const existingIdx = historyStackRef.current.indexOf(pathname);
				if (existingIdx !== -1) {
					currentIndexRef.current = existingIdx;
				}
			}
		} else {
			const current = historyStackRef.current[currentIndexRef.current];
			if (current !== pathname) {
				// Truncate any forward history and push new route
				historyStackRef.current = historyStackRef.current.slice(0, currentIndexRef.current + 1);
				historyStackRef.current.push(pathname);
				currentIndexRef.current = historyStackRef.current.length - 1;
			}
		}

		// Update flags
		const backAvailable = currentIndexRef.current > 0 || (typeof window !== "undefined" && (window.history.state?.idx ?? 0) > 0);
		const forwardAvailable = currentIndexRef.current < historyStackRef.current.length - 1;

		setCanGoBack(backAvailable);
		setCanGoForward(forwardAvailable);
	}, [pathname]);

	const goBack = useCallback(() => {
		if (typeof window !== "undefined") {
			window.history.back();
		}
	}, []);

	const goForward = useCallback(() => {
		if (typeof window !== "undefined") {
			window.history.forward();
		}
	}, []);

	return {
		canGoBack,
		canGoForward,
		goBack,
		goForward,
	};
}
