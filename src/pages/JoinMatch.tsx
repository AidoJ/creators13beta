import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { acceptInvite } from "@/lib/game/persistence";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function JoinMatch() {
  const { token } = useParams<{ token: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!token) {
      setError("Missing invite token.");
      return;
    }
    if (!user) {
      // Send to auth, then back here.
      navigate(`/auth?returnTo=${encodeURIComponent(`/play/join/${token}`)}`);
      return;
    }
    (async () => {
      try {
        const guestName =
          (user.user_metadata as any)?.full_name ||
          user.email?.split("@")[0] ||
          "Guest";
        const matchId = await acceptInvite(token, guestName);
        toast.success("Joined match");
        navigate(`/play/m/${matchId}`, { replace: true });
      } catch (e: any) {
        setError(e?.message ?? "Could not join match");
      }
    })();
  }, [token, user, loading, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div className="max-w-sm flex flex-col gap-3 items-center">
          <h2 className="text-xl font-display">Could not join match</h2>
          <p className="text-muted-foreground text-sm">{error}</p>
          <Button onClick={() => navigate("/play")}>Back to Play</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Joining match…</p>
    </div>
  );
}
