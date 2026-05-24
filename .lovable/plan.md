
# Add Discord chat side panel to the game board

Goal: while a player is in a match, show a live Discord channel beside the hex board so they can chat without leaving the page.

## Technology choice

Discord's own embeddable widget is **read-only** (it only shows online members + an invite button — you can't send or read messages from it). The standard solution everyone uses is **WidgetBot** (widgetbot.io) — a free open-source service that renders an actual two-way Discord chat inside an iframe. Users sign in with their Discord account (or as a guest), and messages flow through their existing membership and roles.

- **Privacy:** WidgetBot only ever sees the channels you explicitly add its bot to. Cockatoo-only or Owl-only channels stay invisible to other tiers automatically because Discord's own permission system is enforced.
- **Cost:** Free for the standard embed. No API key required from us.
- **One-time setup:** A'Hara (server owner) invites the WidgetBot bot to the 13 Creators server once, then we get a `serverId` + per-channel `channelId` for `#card-game-lobby` (and later, per-tier channels).

If A'Hara is uncomfortable with a third party hosting the chat widget, the fallback is a custom bridge (our edge function listens to Discord via the gateway, pipes messages over Supabase Realtime to the client). That's ~3 extra days of work and we still need to write a chat-input UI from scratch. Recommend WidgetBot unless she objects.

## Layout

Desktop (≥ 1024px):

```text
┌──────────────────────────────────────┬──────────────┐
│                                      │              │
│         Honeycomb game board         │   Discord    │
│         (hex grid, hand, used pile)  │   chat       │
│                                      │   (iframe)   │
│                                      │              │
└──────────────────────────────────────┴──────────────┘
       flex-1 (min 0)                     w-[340px]
```

- The chat panel is **collapsible** — header button "Chat" with chevron, slides closed to `w-12` showing a vertical "Chat" label + unread dot.
- State persisted in `localStorage` so a player's preference sticks between matches.
- A small "Pop out" link in the panel header opens the same channel in `discord.com/channels/...` in a new tab for power users.

Tablet (768–1023px):
- Chat becomes an overlay drawer (slides in from the right, board stays full-width underneath). Same toggle button.

Mobile (< 768px):
- Chat hidden by default. Floating chat bubble bottom-right opens a full-screen Sheet (shadcn) with the iframe. Tap board area to close.

## Component structure

```
src/components/game/
  GameBoardLayout.tsx        ← new wrapper: board + DiscordChatPanel
  DiscordChatPanel.tsx       ← new: collapsible iframe + header + mobile sheet
  useDiscordChatPrefs.ts     ← new: localStorage-backed open/closed state
```

`DiscordChatPanel` renders:
```tsx
<iframe
  src={`https://e.widgetbot.io/channels/${serverId}/${channelId}`}
  allow="clipboard-write; autoplay"
  className="h-full w-full border-0"
/>
```

`serverId` is the existing `DISCORD_GUILD_ID` (already a secret, safe to surface to the frontend since it's a public Discord server ID — but we'll mirror it as a public `VITE_DISCORD_GUILD_ID` for cleanliness).

`channelId` is hard-coded per "context":
- match lobby + active match → `#card-game-lobby` channel ID
- (future) Cockatoo-tier match → `#cockatoo-chat`
- (future) tournament bracket → its own thread

## Channel routing

Phase 0 of this work uses a single shared channel (`#card-game-lobby`). Each match doesn't get its own thread yet — adding threads is a Phase 4 follow-up once we know how chatty matches actually are.

## What I need from you / A'Hara before build

1. **WidgetBot invite** — A'Hara visits https://widgetbot.io, clicks "Add to Discord", picks the 13 Creators server, grants the requested permissions. (Takes ~30 seconds.)
2. **Channel ID for `#card-game-lobby`** — in Discord with developer mode on, right-click the channel → Copy ID. Paste it back to me. (If the channel doesn't exist yet, A'Hara creates it first — text channel, visible to `@everyone` who has any tier role.)
3. Confirm the Falcon→Cockatoo role rename is done on the Discord side (the steps I described above), so the chat panel surfaces the new role colour correctly.

## Build steps once those three items land

1. Add `VITE_DISCORD_GUILD_ID` + `VITE_DISCORD_LOBBY_CHANNEL_ID` to env config (publishable, not secret).
2. Build `DiscordChatPanel`, `useDiscordChatPrefs`, and the responsive layout wrapper.
3. Wire `GameBoardLayout` into the existing `/game` shell (once Phase 3 lands) — for now we can stub a placeholder board so the panel itself is testable.
4. Smoke-test sign-in flow: unauthenticated user sees WidgetBot's "Sign in with Discord" prompt inside the iframe; authenticated user lands straight in chat.

## Out of scope for this slice

- Per-match thread channels (Phase 4)
- Cockatoo / Owl tier-only channels in the same panel (Phase 6)
- Voice-channel join button (later)
- Bridging unread counts into the React app's notification dot (later — requires a small Discord bot)

This is a tight, isolated UI addition (~½ day) that doesn't touch the match engine, so we can ship it before Phase 1 starts if you want it for early playtest builds.
