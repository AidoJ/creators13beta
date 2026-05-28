import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const DISCORD_APP_ID = "1506460224859672596";
const DISCORD_GUILD_ID = "1506458550208172082";
const DISCORD_GENERAL_CHANNEL_ID = "1506458551017799754";
import { DISCORD_INVITE_URL } from "@/config/discordChat";
const DISCORD_GENERAL_URL = `https://discord.com/channels/${DISCORD_GUILD_ID}/${DISCORD_GENERAL_CHANNEL_ID}`;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface Props { userId: string }

export default function DiscordLinkCard({ userId }: Props) {
  const [link, setLink] = useState<{ discord_username: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlinking, setUnlinking] = useState(false);

  const handleUnlink = async () => {
    if (!confirm("Unlink your Discord account? You can re-link with a different Discord account afterwards.")) return;
    setUnlinking(true);
    const { error } = await supabase.from("discord_links").delete().eq("user_id", userId);
    setUnlinking(false);
    if (error) {
      toast.error("Failed to unlink Discord");
      return;
    }
    setLink(null);
    toast.success("Discord unlinked. Log out of Discord in another tab before re-linking.");
  };

  useEffect(() => {
    supabase
      .from("discord_links")
      .select("discord_username")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        setLink(data);
        setLoading(false);
      });
  }, [userId]);

  const handleLink = () => {
    const redirectUri = `${SUPABASE_URL}/functions/v1/discord-oauth-callback`;
    const state = JSON.stringify({ userId, redirectBase: window.location.origin });
    const params = new URLSearchParams({
      client_id: DISCORD_APP_ID,
      response_type: "code",
      scope: "identify guilds.join",
      redirect_uri: redirectUri,
      state,
      prompt: "consent",
    });
    window.location.href = `https://discord.com/api/oauth2/authorize?${params}`;
  };

  if (loading) return null;

  return (
    <div className="rounded-2xl border border-primary/20 bg-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-display text-base font-bold text-foreground">13CREATORS Discord</h3>
      </div>
      {link ? (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Linked as <span className="font-medium text-foreground">{link.discord_username}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              asChild
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
                Open 13CREATORS
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={DISCORD_GENERAL_URL} target="_blank" rel="noopener noreferrer">
                Open #general
              </a>
            </Button>
            <Button onClick={handleUnlink} size="sm" variant="ghost" disabled={unlinking}>
              {unlinking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlink"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Connect your Discord account to join the 13CREATORS server and get your tier role.
            If Discord asks you to register or verify email, finish that, return here, then click Link Discord again.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleLink} size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
              Link Discord
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
                Open 13CREATORS
              </a>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
