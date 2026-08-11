"use client";

import { getWindowCapabilities, WindowCapabilities } from "@/lib/window-env";
import { useEffect, useRef, useState } from "react";

type WindowState = { status: "loading" } | { status: "ready"; caps: WindowCapabilities };

export function useWindow(): WindowState {
	const [state, setState] = useState<WindowState>(() => ({
		status: "loading",
	}));

	const resolved = useRef(false);

	useEffect(() => {
		if (resolved.current) return;
		resolved.current = true;

		getWindowCapabilities().then((caps) => {
			setState({ status: "ready", caps });
		});
	}, []);

	return state;
}
