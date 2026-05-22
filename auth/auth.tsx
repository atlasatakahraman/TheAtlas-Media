"use client";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import { usePathname, useRouter } from "next/navigation";
import {
	ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState
} from "react";
import LoadingScreen from "../app/loading";
import { AuthContext, AuthContextType } from "./context";
import { clearStorage, getStoredSession, setStoredSession } from "./functions";
import { AuthResponse, AuthSession, AuthUser, isPublicRoute } from "./types";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const pathname = usePathname();

  const clearError = useCallback(() => setError(null), []);

  const validateAndRefreshSession = useCallback(
    async (storedSession: AuthSession): Promise<AuthSession | null> => {
      try {
        const now = Math.floor(Date.now() / 1000);
        const bufferTime = 300;
        if (storedSession.expires_at > now + bufferTime) {
          return storedSession;
        }

        const response = await invoke<AuthResponse>("auth_refresh_token", {
          refreshToken: storedSession.refresh_token,
        });

        if (response.session) return response.session;
        return null;
      } catch {
        return null;
      }
    },
    [],
  );

  const signInWithGoogle = useCallback(async () => {
    let oauthPort: number | null = null;

    try {
      setLoading(true);
      setError(null);

      const unlisten = await listen<string>("oauth-callback", async (event) => {
        try {
          const response = await invoke<AuthResponse>(
            "auth_parse_oauth_callback",
            {
              url: event.payload,
            },
          );

          if (!response.session || !response.user) {
            throw new Error("Invalid OAuth response");
          }

          setSession(response.session);
          setUser(response.user);
          setStoredSession(response.session);

          if (oauthPort !== null) {
            try {
              await invoke("auth_oauth_cancel", { port: oauthPort });
            } catch {
              /* server already closed */
            }
          }
          unlisten();

          try {
            const appWindow = getCurrentWindow();
            await appWindow.unminimize();
            await appWindow.setFocus();
            await appWindow.requestUserAttention(
              UserAttentionType.Informational,
            );
          } catch {
            /* focus failed */
          }

          setLoading(false);
        } catch (err) {
          console.error("OAuth callback error:", err);
          setError("Authentication failed");
          setLoading(false);
          if (oauthPort !== null) {
            try {
              await invoke("auth_oauth_cancel", { port: oauthPort });
            } catch {
              /* */
            }
          }
          unlisten();
        }
      });

      oauthPort = await invoke<number>("auth_oauth_start", {
        provider: "google",
      });

      // 5 minute timeout
      setTimeout(() => {
        unlisten();
        if (oauthPort !== null) {
          invoke("auth_oauth_cancel", { port: oauthPort }).catch(() => {});
        }
      }, 300000);
    } catch (err) {
      console.error("OAuth start error:", err);
      setError("Failed to start sign-in");
      setLoading(false);
      if (oauthPort !== null) {
        try {
          await invoke("auth_oauth_cancel", { port: oauthPort });
        } catch {
          /* */
        }
      }
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      if (session?.access_token) {
        await invoke("auth_sign_out", {
          accessToken: session.access_token,
        }).catch(() => {});
      }
    } finally {
      setUser(null);
      setSession(null);
      clearStorage();
      router.push("/login/");
    }
  }, [session, router]);

  const refreshSession = useCallback(async () => {
    if (!session?.refresh_token) return;

    try {
      const response = await invoke<AuthResponse>("auth_refresh_token", {
        refreshToken: session.refresh_token,
      });

      if (response.session) {
        setSession(response.session);
        setStoredSession(response.session);
        if (response.session.user) setUser(response.session.user);
      }
    } catch {
      await signOut();
    }
  }, [session, signOut]);

  // Initialize auth from stored session
  useEffect(() => {
    let isMounted = true;
    let initTimeout: NodeJS.Timeout;

    const initializeAuth = async () => {
      try {
        initTimeout = setTimeout(() => {
          if (isMounted && loading) {
            setLoading(false);
            setInitializing(false);
          }
        }, 10000);

        const storedSession = getStoredSession();
        if (!isMounted) return;

        if (storedSession?.user) {
          const validSession = await validateAndRefreshSession(storedSession);
          if (!isMounted) return;

          if (validSession) {
            setSession(validSession);
            setUser(validSession.user);
            setStoredSession(validSession);
          } else {
            clearStorage();
          }
        }

        if (isMounted) {
          setLoading(false);
          setInitializing(false);
        }
      } catch {
        if (isMounted) {
          clearStorage();
          setLoading(false);
          setInitializing(false);
        }
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
      if (initTimeout) clearTimeout(initTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validateAndRefreshSession]);

  // Auto-refresh before token expiry
  useEffect(() => {
    if (!session) return;

    const now = Math.floor(Date.now() / 1000);
    const refreshAt = session.expires_at - now - 300;

    if (refreshAt <= 0) {
      refreshSession();
      return;
    }

    const timer = setTimeout(() => refreshSession(), refreshAt * 1000);
    return () => clearTimeout(timer);
  }, [session, refreshSession]);

  // Route protection
  useEffect(() => {
    if (initializing || loading) return;

    const isAuthenticated = !!user && !!session;

    if (isPublicRoute(pathname) && isAuthenticated) {
      router.replace("/");
    } else if (
      !isPublicRoute(pathname) &&
      !isAuthenticated &&
      pathname !== "/"
    ) {
      router.replace("/login/");
    }
  }, [pathname, user, session, router, initializing, loading]);

  const isAuthenticated = useMemo(() => !!user && !!session, [user, session]);

  const value: AuthContextType = useMemo(
    () => ({
      user,
      session,
      loading,
      error,
      isAuthenticated,
      signInWithGoogle,
      signOut,
      refreshSession,
      clearError,
    }),
    [
      user,
      session,
      loading,
      error,
      isAuthenticated,
      signInWithGoogle,
      signOut,
      refreshSession,
      clearError,
    ],
  );

  if (initializing) {
    return <LoadingScreen></LoadingScreen>;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================================================
// Hooks
// ============================================================================
