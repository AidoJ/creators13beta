import { ChevronRight, ChevronLeft, ExternalLink, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DISCORD_GUILD_ID,
  LOBBY_CHANNEL_ID,
  discordDeepLink,
  widgetBotUrl,
} from "@/config/discordChat";
import { useDiscordChatPrefs } from "./useDiscordChatPrefs";

interface DiscordChatPanelProps {
  /** Override the default lobby channel — used for tier-only or tournament channels later. */
  channelId?: string;
  title?: string;
}

function ChatIframe({ channelId }: { channelId: string }) {
  return (
    <iframe
      title="Discord chat"
      src={widgetBotUrl(channelId)}
      allow="clipboard-write; autoplay"
      className="h-full w-full border-0 bg-background"
    />
  );
}

function SetupNotice() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <MessageCircle className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">Discord chat not configured yet</p>
      <p className="text-xs text-muted-foreground">
        An admin needs to add the WidgetBot to the Discord server and paste the channel ID into{" "}
        <code className="rounded bg-muted px-1 py-0.5">src/config/discordChat.ts</code>.
      </p>
    </div>
  );
}

function PanelBody({ channelId }: { channelId: string }) {
  const configured = DISCORD_GUILD_ID && channelId;
  return configured ? <ChatIframe channelId={channelId} /> : <SetupNotice />;
}

export function DiscordChatPanel({
  channelId = LOBBY_CHANNEL_ID,
  title = "Lobby Chat",
}: DiscordChatPanelProps) {
  const isMobile = useIsMobile();
  const { isOpen, setIsOpen, toggle } = useDiscordChatPrefs(true);

  // Mobile: floating bubble + full-screen Sheet
  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button
            size="icon"
            className="fixed bottom-4 right-4 z-50 size-14 rounded-full shadow-lg"
            aria-label="Open Discord chat"
          >
            <MessageCircle className="size-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-full max-w-full p-0 sm:max-w-md">
          <div className="flex h-full flex-col">
            <Header channelId={channelId} title={title} />
            <div className="flex-1 overflow-hidden">
              <PanelBody channelId={channelId} />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop / tablet: collapsible side panel
  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-l bg-card transition-[width] duration-300 ${
        isOpen ? "w-[340px]" : "w-12"
      }`}
      aria-label="Discord chat"
    >
      {isOpen ? (
        <>
          <Header channelId={channelId} title={title} onCollapse={() => setIsOpen(false)} />
          <div className="flex-1 overflow-hidden">
            <PanelBody channelId={channelId} />
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={toggle}
          className="flex h-full w-full flex-col items-center gap-3 py-4 text-xs font-medium text-muted-foreground hover:text-foreground"
          aria-label="Expand chat"
        >
          <ChevronLeft className="size-4" />
          <span className="[writing-mode:vertical-rl] [text-orientation:mixed]">
            {title}
          </span>
        </button>
      )}
    </aside>
  );
}

function Header({
  channelId,
  title,
  onCollapse,
}: {
  channelId: string;
  title: string;
  onCollapse?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <MessageCircle className="size-4 text-muted-foreground" aria-hidden />
        {title}
      </div>
      <div className="flex items-center gap-1">
        {DISCORD_GUILD_ID && channelId && (
          <Button asChild variant="ghost" size="icon" className="size-7">
            <a
              href={discordDeepLink(channelId)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in Discord app"
            >
              <ExternalLink className="size-4" />
            </a>
          </Button>
        )}
        {onCollapse && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onCollapse}
            aria-label="Collapse chat"
          >
            <ChevronRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
