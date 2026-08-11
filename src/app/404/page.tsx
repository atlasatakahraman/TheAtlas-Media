// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md on 2026-06-21
"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useRouter } from "next/navigation";

export default function NotFound() {
	const router = useRouter();

	return (
		<div className="flex-1 h-full flex bg-secondary/80">
			<div className="flex flex-1 justify-center items-center *:text-muted-foreground">
				<span className="font-medium font-sans text-4xl">404</span>
				<Separator orientation="horizontal" className="max-w-20 rotate-90"></Separator>
				<div className="flex flex-col items-center">
					<span className="font-serif text-lg">This page does not exists.</span>
					<Button
						variant={"link"}
						className="font-medium font-mono text-sm underline-offset-2
						text-muted-foreground hover:text-foreground duration-200
						transition-colors ease-out"
						onClick={() => router.replace("/")}
					>
						But you can go home!
					</Button>
				</div>
			</div>
		</div>
	);
}
