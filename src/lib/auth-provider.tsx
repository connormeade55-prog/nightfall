import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type Profile = { username: string; display_name: string; avatar_path: string | null };
export type AuthStatus = "loading" | "signed-out" | "signed-in";

type AuthValue = {
  status: AuthStatus;
  userId: string | null;
  profile: Profile | null;
  /** Only decides what UI to show; the database enforces admin rights itself. */
  isAdmin: boolean;
  /** Re-read the profile after the person edits it. */
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_path")
    .eq("id", userId)
    .maybeSingle();

  return data
    ? { username: data.username, display_name: data.display_name, avatar_path: data.avatar_path }
    : null;
}

async function loadIsAdmin(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(data);
}

/**
 * Single source of truth for the session: one listener, one profile read.
 * Mounted once in the root route so the header and the auth page agree.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    async function apply(session: Session | null) {
      if (!active) return;

      if (!session) {
        setStatus("signed-out");
        setUserId(null);
        setProfile(null);
        setIsAdmin(false);
        return;
      }

      setUserId(session.user.id);
      const [nextProfile, nextIsAdmin] = await Promise.all([
        loadProfile(session.user.id),
        loadIsAdmin(session.user.id),
      ]);
      if (!active) return;
      setProfile(nextProfile);
      setIsAdmin(nextIsAdmin);
      setStatus("signed-in");
    }

    void supabase.auth.getSession().then(({ data }) => apply(data.session));

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      void apply(session);
      router.invalidate();
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [router]);

  const refreshProfile = useCallback(async () => {
    if (userId) setProfile(await loadProfile(userId));
  }, [userId]);

  const signOut = useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }, [queryClient, navigate]);

  const value = useMemo(
    () => ({ status, userId, profile, isAdmin, refreshProfile, signOut }),
    [status, userId, profile, isAdmin, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
