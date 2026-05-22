"use client";

import NavLink from "@/components/custom/nav-link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { ArrowLeft, Home } from "lucide-react";
import { useRouter } from "next/navigation";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex gap-6 justify-center items-center">
        <Label className="text-6xl font-bold">404</Label>
        <Separator className="max-h-48" orientation="vertical"></Separator>
        <div className="space-y-3">
          <Label className="text-xl justify-center">Page Not Found</Label>
          <div className={cn("flex justify-between px-4 gap-2")}>
            <Button
              onClick={() => router.back()}
              variant="outline"
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </Button>
            <Button asChild className="gap-2">
              <NavLink href={"/home"}>
                <Home className="w-4 h-4" />
                Home
              </NavLink>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
