import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { acceptInvite, loadMatch } from "@/lib/game/persistence";
import { fetchPlayerDisplayName } from "@/lib/playerName";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import BuildGate from "@/components/game/BuildGate";
import { fetchBuildManifest } from "@/hooks/useBuildFreshness";

export default function JoinMatch() {
  const { token } = useParams<{ token: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

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
        // Hard gate: joining on an old bundle is exactly how two players end
        // up in one match on different builds. Check before we consume the
        // invite, so a stale client never takes a seat.
        const manifest = await fetchBuildManifest();
        if (manifest.stale) {
          setStale(true);
          return;
        }
        const guestName = await fetchPlayerDisplayName(user);
        const matchId = await acceptInvite(token, guestName);

        // Guard: did the host accidentally click their own invite link?
        // The RPC returns the match id silently in that case. Detect it so
        // we can tell them what to do instead of dropping them into a board
        // that looks like a solo game.
        try {
          const { row } = await loadMatch(matchId);
          if (row.host_user_id === user.id && !row.guest_user_id && !row.lobby_mode) {
            setError(
              "You're signed in as the host of this match. Open the invite link in a different browser or have your friend sign in with their own account to join.",
            );
            return;
          }
          // B — lobby matches go to the lobby UI, not the board.
          if (row.lobby_mode && row.status === "waiting") {
            toast.success("Joined lobby");
            navigate(`/play/lobby/${matchId}`, { replace: true });
            return;
          }
        } catch {
          /* ignore — fall through to navigate */
        }

        toast.success("Joined match");
        navigate(`/play/m/${matchId}`, { replace: true });
      } catch (e: any) {
        setError(e?.message ?? "Could not join match");
      }
    })();
  }, [token, user, loading, navigate]);

  if (stale) {
    return (
      <BuildGate reason="You can't join a match on an older version — the two boards would disagree mid-game.">
        <div />
      </BuildGate>
    );
  }

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
