'use client';

import { getSystemCapabilities, SystemCapabilities } from "@/lib/system-env";
import { useEffect, useRef, useState } from "react";

type CurrentState = | { status: 'loading' } | { status: 'ready'; caps: SystemCapabilities }

export function useOperatingSystem(): CurrentState {
	const [state, setState] = useState<CurrentState>(() => ({
		status: 'loading'
	}))

	const resolved = useRef(false);

	useEffect(() => {
		if (resolved.current) return;
		resolved.current = true;

		getSystemCapabilities().then(caps => {
			setState({ status: 'ready', caps })
		})
	}, [])

	return state;
}
