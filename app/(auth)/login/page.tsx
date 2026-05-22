"use client";

import { useAuth } from "@/auth/hooks";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useCallback, useEffect, useRef, useState } from "react";

export default function LoginPage() {
  const { signInWithGoogle, loading, isAuthenticated } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleGoogleSignIn = useCallback(async () => {
    if (isSigningIn) return;

    setIsSigningIn(true);
    setError(null);

    timeoutRef.current = setTimeout(() => {
      if (isMounted.current) {
        setIsSigningIn(false);
        setError("Sign-in timed out. Please try again.");
      }
    }, 60000);

    try {
      await signInWithGoogle();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    } catch {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (!isMounted.current) return;
      setIsSigningIn(false);
      setError("Failed to sign in with Google. Please try again.");
    }
  }, [signInWithGoogle, isSigningIn]);

  if (loading && isAuthenticated) return null;
  if (isAuthenticated) return null;

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-8 min-h-screen bg-background">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary flex items-center justify-center mb-4">
            <span className="text-2xl font-bold text-primary-foreground font-serif">
              TA
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            TheAtlas YouTube
          </h1>
          <p className="text-muted-foreground">Sign in to continue</p>
        </div>

        {/* Card */}
        <Card className="border-border shadow-lg">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl">Welcome</CardTitle>
            <CardDescription>
              Use your Google account to get started
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center">
                {error}
              </div>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  continue with
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full transition-all duration-200 hover:scale-[1.01] disabled:hover:scale-100 h-12 text-base"
              onClick={handleGoogleSignIn}
              disabled={isSigningIn}
            >
              {isSigningIn ? (
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 animate-spin border-t-2 border-primary rounded-full" />
                  <span>Connecting to Google...</span>
                </div>
              ) : (
                <>
                  <svg
                    className="w-5 h-5 mr-2"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  <span>Sign in with Google</span>
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          By signing in, you agree to our terms of service.
        </p>
      </div>
    </div>
  );
}
