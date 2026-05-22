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
    } else {
      router.replace("/home");
    }
  }, [loading, isAuthenticated, router]);

  return null;
}
