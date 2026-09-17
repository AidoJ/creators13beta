import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { Mail, KeyRound } from "lucide-react";

const emailSchema = z.string().trim().email({ message: "Enter a valid email address" }).max(255);
const passwordSchema = z.string().min(8, { message: "Password must be at least 8 characters" }).max(72);

export default function Account() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentEmail, setCurrentEmail] = useState<string>("");
  const [newEmail, setNewEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentEmail(data.user?.email ?? "");
    });
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(newEmail);
    if (!parsed.success) {
      toast({ title: "Invalid email", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    if (parsed.data.toLowerCase() === currentEmail.toLowerCase()) {
      toast({ title: "No change", description: "That is already your email address.", variant: "destructive" });
      return;
    }
    setEmailLoading(true);
    const { error } = await supabase.auth.updateUser(
      { email: parsed.data },
      { emailRedirectTo: `${window.location.origin}/dashboard` }
    );
    setEmailLoading(false);
    if (error) {
      toast({ title: "Could not update email", description: error.message, variant: "destructive" });
      return;
    }
    setNewEmail("");
    toast({
      title: "Confirmation sent",
      description: `Check ${parsed.data} and confirm the change. Your current email stays active until then.`,
    });
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      toast({ title: "Invalid password", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match", description: "Please re-enter your new password.", variant: "destructive" });
      return;
    }
    setPasswordLoading(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data });
    setPasswordLoading(false);
    if (error) {
      toast({ title: "Could not update password", description: error.message, variant: "destructive" });
      return;
    }
    setPassword("");
    setConfirmPassword("");
    toast({ title: "Password updated", description: "Your new password is now active." });
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader email={currentEmail} onSignOut={handleSignOut} />
      <main className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-display">Account Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your login email and password.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-4 w-4 text-primary" /> Email address
            </CardTitle>
            <CardDescription>
              Currently <span className="text-foreground">{currentEmail || "—"}</span>. We'll send a confirmation link to
              your new address before the change takes effect.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleEmailChange} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-email">New email address</Label>
                <Input
                  id="new-email"
                  type="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="you@example.com"
                  maxLength={255}
                  required
                />
              </div>
              <Button type="submit" disabled={emailLoading}>
                {emailLoading ? "Sending…" : "Update email"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="h-4 w-4 text-primary" /> Password
            </CardTitle>
            <CardDescription>Choose a new password of at least 8 characters.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={72}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  maxLength={72}
                  required
                />
              </div>
              <Button type="submit" disabled={passwordLoading}>
                {passwordLoading ? "Updating…" : "Update password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
