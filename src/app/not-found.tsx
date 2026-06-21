// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md on 2026-06-21
'use client';

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import Loading from "./loading";

export default function NotFoundRedirect() {

	const router = useRouter();

	const mount = useRef(false);

	useEffect(() => {
		if (mount.current) return;
		mount.current = true;

		router.push("/404");
	})

	return <Loading></Loading>;
}
