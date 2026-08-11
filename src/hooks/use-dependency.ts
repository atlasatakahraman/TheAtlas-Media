"use client";

import { get_dependencies } from "@/lib/dependency-env";
import { DependencyReport } from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";

export type DependencyCurrentState =
	{ status: "loading" } | { status: "ready"; deps: DependencyReport };

export default function useDependency(): DependencyCurrentState & { recheck: () => void } {
	const [state, setState] = useState<DependencyCurrentState>(() => ({
		status: "loading",
	}));

	const fetchDeps = useCallback(() => {
		get_dependencies().then((deps) => {
			setState({ status: "ready", deps });
		});
	}, []);

	const resolved = useRef(false);

	useEffect(() => {
		if (resolved.current) return;
		resolved.current = true;
		fetchDeps();
	}, [fetchDeps]);

	return { ...state, recheck: fetchDeps };
}
