"use client";

import { useAuth } from "@/auth/hooks";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace("/login/");
    }
  }, [loading, isAuthenticated, router]);

  if (loading || !isAuthenticated) return null;

  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <p className="text-muted-foreground">
        Authenticated. Main app goes here.
      </p>
    </div>
  );
}
