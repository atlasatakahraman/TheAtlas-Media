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
