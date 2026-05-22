"use client";

import { useEffect, useState } from "react";

const TIMEOUT_MS = 10000;

export default function LoadingScreen() {
  const [showRefresh, setShowRefresh] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowRefresh(true), TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-5 h-full min-h-screen justify-center items-center bg-background">
      <div className="h-16 w-16 animate-spin border-t-3 border-primary rounded-full" />
      {showRefresh && (
        <div className="flex flex-col items-center gap-2 animate-in fade-in-0 duration-300">
          <p className="text-sm text-muted-foreground">
            Taking longer than expected...
          </p>
          <button
            className="px-4 py-2 text-sm rounded-md border border-border bg-card hover:bg-accent transition-colors"
            onClick={() => window.location.reload()}
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}
