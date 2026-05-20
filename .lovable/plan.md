
# Messaging: Discord-Integrated Instead of In-App

## Why this is the right call
You'd be opting out of:
- Storing message content, voice notes, images (no GDPR export/delete tooling to build)
- Abuse reporting + moderation queue
- Minor-safety controls (kids tier would have been a nightmare)
- Realtime infrastructure cost and presence handling
- Notification fan-out (Discord pushes for free on iOS/Android/desktop)

You'd be gaining: voice rooms, video, threads, reactions, search, mobile/desktop apps, screen share, scheduled events — all already built and battle-tested.

## How it slots into the platform

### 1. Single 13CREATORS Discord server (you own it)
Structured by tier and purpose:

```
INFO
  #welcome
  #rules
  #announcements (announcement channel, read-only)

🪶 WREN (everyone)
  #general
  #card-game-lobby     ← "looking for a game" posts
  #introductions
  voice: 🌱 Open Cuppa Room

🐦 ROBIN (paid)
  #robin-lounge
  #daily-forecasts     ← bot posts CT-of-the-day
  voice: 🎙️ Robin Voice

🦅 FALCON (trainee practitioners)
  #falcon-trainees
  voice: 🦅 Falcon Study Room

🦉 OWL (certified practitioners)
  #owl-practitioners
  #client-supervision
  voice: 🦉 Owl Practice Room

🌳 CREATOR TYPES (13 channels, all members)
  #lava #fire #sun ... #sky     ← one per type for affinity chat

ADMIN / MOD (private)
```

### 2. Account linking via Discord OAuth
- "Connect Discord" button on user profile → standard Discord OAuth (`identify` + `guilds.join` scopes)
- Edge function stores `discord_user_id` + refresh token on profile
- User is auto-invited to the guild on link

### 3. Tier → Discord role sync (the magic)
A new edge function `sync-discord-roles`:
- Triggered by the existing Stripe webhook (subscription create/update/cancel)
- Also triggered on Discord-link and nightly cron as a safety net
- Calls Discord Bot API to add/remove roles: `wren`, `robin`, `falcon`, `owl`, `moderator`, `trainer`
- Discord's channel permissions do the gatekeeping — no per-channel logic in our code

Result: someone upgrades to Falcon → within seconds they can see `#falcon-trainees` in Discord. Cancel → role removed automatically.

### 4. Profile → Discord deep links (replaces in-app DMs)
On each member profile in `/home`:
- "Message on Discord" button → `discord://discordapp.com/users/{discord_user_id}` (opens app) with web fallback
- "Invite to voice cuppa" → creates a Discord scheduled event via bot, shares invite link
- Only shown if the target user has linked Discord and has the "open to DMs" preference on

This means **zero message data ever touches our database**. The privacy policy gets dramatically shorter.

### 5. Bot-driven bridges (one-way, no message storage)
A small `13creators-bot`:
- Posts daily CT forecasts to `#daily-forecasts` (Robin+)
- Posts new event announcements to `#announcements` from our events table
- Posts game-match invites to `#card-game-lobby` when a user clicks "find an opponent"
- Listens for slash commands: `/profile @user` returns a public profile embed; `/whoami` shows the user their tier
- **Never reads private messages or channel history** — purely outbound + slash commands

### 6. What stays in-app
- The card game itself (gameplay, board, points)
- Profile + matching + map/face view
- Events calendar (with "Join in Discord voice" buttons)
- Practitioner portal (Owl)
- Shop + subscriptions
- Public lobby / game match invites

All conversation, all DMs, all group chat → Discord.

## Trade-offs (worth being honest about)
- **Users must accept a Discord account.** Discord has 200M+ MAUs and is free, but it's not zero friction. Mitigate with a 30-second "Why we use Discord" page during onboarding.
- **Branding is split.** Your community lives in Discord's UI, not yours. Mitigate with strong server branding (custom emoji per CT, role colours from Appendix 1 palette, bot avatar = 13CREATORS logo).
- **Falcon/Owl trainee privacy** — practitioner supervision channels live on Discord servers (encrypted in transit, stored by Discord). Confirm this is acceptable for your Owl-tier client supervision use case. If not, Owl-only practitioner notes stay in the in-app practitioner portal (which they already do today).
- **No "open to a virtual cuppa" inside the app** — instead it becomes a profile toggle that exposes the "Invite to voice cuppa" button on your profile.

## Implementation impact on the build plan

This **simplifies** Stage 3 dramatically and lets us bring it forward:

| Old Stage 3 (in-app messaging, ~1.5 weeks) | New Stage 3 (Discord, ~4 days) |
|---|---|
| DM tables, RLS, realtime channels | Discord OAuth + account linking |
| Group chat schema + UI | Server setup (channels, roles, permissions) — done in Discord UI |
| Audio recording + self-destruct timer | n/a — Discord handles voice |
| Image upload + RLS storage bucket | n/a |
| Notification preferences UI | Discord handles all notifications |
| Moderation tools | Discord has them |
| **Build:** OAuth flow, role-sync edge function, bot service, profile deep-link buttons, "Connect Discord" onboarding | |

Approximate saved time: ~1 full week, plus removal of entire compliance/storage burden.

## What I need from you before building

1. **Server ownership** — you (or A'Hara) creates the Discord server and gives the bot owner access. I'll provide a setup checklist.
2. **Bot credentials** — I'll need a Discord Bot Token + Application ID added as secrets when we're ready.
3. **Owl client-supervision question** — confirm Owl practitioner channels on Discord are acceptable, or that Owl supervision stays in the in-app portal only.
4. **Mandatory or optional Discord link?** — should Wren users be allowed to skip linking Discord (and just play the game solo/with bot), or is linking required to use any social feature?

Say the word on those four and I'll fold this into the master build plan I gave you earlier, then we can start Stage 0.
