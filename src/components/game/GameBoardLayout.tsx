import { ReactNode } from "react";
import { DiscordChatPanel } from "./DiscordChatPanel";

interface GameBoardLayoutProps {
  /** The game board, hand, used pile, etc. */
  children: ReactNode;
  /** Override the chat channel for this match (e.g. tier-only or tournament). */
  chatChannelId?: string;
  chatTitle?: string;
}

/**
 * Two-column shell for the card-game experience: the board fills the available
 * space on the left while the Discord chat lives in a collapsible side panel
 * on the right. On mobile the chat collapses to a floating bubble + sheet.
 */
export function GameBoardLayout({
  children,
  chatChannelId,
  chatTitle,
}: GameBoardLayoutProps) {
  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
      <DiscordChatPanel channelId={chatChannelId} title={chatTitle} />
    </div>
  );
}
