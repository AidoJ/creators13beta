import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Leaf, Eye, EyeOff } from "lucide-react";
import logoFull from "@/assets/13creators-logo-full.png";
import { SignupFields } from "@/components/auth/SignupFields";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";
import { getAppOrigin } from "@/lib/appOrigin";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  const search = new URLSearchParams(window.location.search);
  const returnTo = search.get("returnTo") || "/dashboard";
  const refCode = search.get("ref") || "";

  useEffect(() => {
    if (user) navigate(returnTo, { replace: true });
  }, [user, navigate, returnTo]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    } else {
      navigate(returnTo);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <a href="/" className="inline-block mb-4">
            <img src={logoFull} alt="13 Creators" className="h-48 sm:h-64 w-auto mx-auto" />
          </a>
          <h1 className="text-2xl font-display font-bold text-foreground">
            {isLogin ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isLogin ? "Sign in to your account" : "Start your Creator Types journey"}
          </p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-6 sm:p-8 shadow-sm">
          {isLogin ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button type="button" onClick={() => setForgotOpen(true)} className="text-sm text-primary hover:underline py-2 px-1 -my-1 min-h-11 inline-flex items-center">
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full rounded-full" disabled={loading}>
                {loading ? <Leaf className="h-4 w-4 animate-spin" /> : "Sign In"}
              </Button>
            </form>
          ) : (
            <SignupFields
              loading={loading}
              submitLabel="Create account"
              onSubmit={async (values) => {
                setLoading(true);
                const { data, error } = await supabase.auth.signUp({
                  email: values.email,
                  password: values.password,
                  options: {
                    emailRedirectTo: getAppOrigin(),
                    data: { first_name: values.firstName, last_name: values.lastName },
                  },
                });
                if (error) {
                  setLoading(false);
                  toast({ title: "Signup failed", description: error.message, variant: "destructive" });
                  return;
                }
                if (data.user?.id) {
                  let invitedBy: string | null = null;
                  if (refCode.trim()) {
                    const { data: refUser } = await supabase.rpc("resolve_invitation_code", { _code: refCode.trim() });
                    if (refUser) invitedBy = refUser as unknown as string;
                  }
                  const patch: Record<string, unknown> = {
                    user_id: data.user.id,
                    first_name: values.firstName,
                    last_name: values.lastName,
                    phone: values.phone,
                    email: values.email,
                  };
                  if (invitedBy) patch.invited_by_user_id = invitedBy;
                  await supabase.from("profiles").upsert(patch as never, { onConflict: "user_id" });
                }
                setLoading(false);
                toast({
                  title: "Check your email",
                  description: "We've sent you a verification link. Please confirm your email to continue.",
                });
              }}
            />
          )}

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
            </span>
            <button onClick={() => setIsLogin(!isLogin)} className="text-primary font-medium hover:underline">
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </div>
        </div>
      </div>

      <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} initialEmail={email} />
    </div>
  );
}
