import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Keep the same user object while it's the same person with unchanged
    // account data. Token refreshes and duplicate auth events otherwise hand
    // out a new object each time, and every page keyed on `user` reloads
    // (the post-payment dashboard flicker).
    const keepStable = (next: User | null) =>
      setUser((prev) =>
        prev && next && prev.id === next.id && prev.updated_at === next.updated_at &&
        JSON.stringify(prev.user_metadata) === JSON.stringify(next.user_metadata)
          ? prev
          : next,
      );
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        keepStable(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      keepStable(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Signing out always lands on the public homepage (not "Welcome back").
  // A full navigation avoids protected pages bouncing to sign-in first.
  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.replace("/");
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
