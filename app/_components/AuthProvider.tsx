"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { importLocalIdeas, type ImportOutcome } from "../_lib/migrate-local";

type AuthState = {
  user: User | null;
  loading: boolean;
  configured: boolean;
  imported: ImportOutcome | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  configured: false,
  imported: null,
  signOut: async () => {},
});

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/**
 * Mounted once in the root layout, so the localStorage import runs a single
 * time per sign-in rather than once per component that cares about the user.
 */
export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [imported, setImported] = useState<ImportOutcome | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    const sb = getSupabase();
    let active = true;

    sb.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    importLocalIdeas(user.id)
      .then((outcome) => {
        if (active && outcome) setImported(outcome);
      })
      .catch((err) => console.error(`[ideas] import failed: ${String(err)}`));
    return () => {
      active = false;
    };
  }, [user]);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    await getSupabase().auth.signOut();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        configured: isSupabaseConfigured,
        imported,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
