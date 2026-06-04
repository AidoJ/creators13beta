# Creators 13

A PWA for the **Creators 13** profiling system: a 13-Creator-Types framework
delivered as a tap-based onboarding flow, a practitioner / trainer LMS, and a
card game (`/play`).

## Stack

- Vite 5 + React 18 + TypeScript + Tailwind + shadcn/ui (front end)
- Lovable Cloud / Supabase: Postgres + RLS, Auth, Realtime, Storage, Edge Functions
- Stripe (enrollment payments only)

## Apps in this repo

| Route prefix         | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `/enroll/*`          | Client onboarding (plan, payment, photos, etc.) |
| `/dashboard`         | Client home                                      |
| `/practitioner`      | Practitioner workspace                           |
| `/trainer`, `/admin` | Trainer & admin tools                            |
| `/play`, `/play/*`   | The card game (solo bot + 2-player PvP)         |

## Game architecture notes

- Game logic lives in `src/lib/game/*` as pure functions; `engine.ts` is the
  rule book in code form.
- Match state is persisted as a JSONB blob on `game_matches`. **Currently the
  client is authoritative**: any participant can write a new `state` row.
  This is acceptable for friends-and-family play. Anti-cheat (server-side
  move validation + a `seq` column + hand redaction) is on the roadmap.
- **Opponent hands are visible** to anyone who inspects the match row in
  devtools today. Treat PvP as "open hand" until server-side moves ship.

## Local dev

Requires Node 20+ and [Bun](https://bun.sh).

```sh
bun install
bun run dev
```

## Testing

```sh
bunx vitest run        # all unit tests
bun run lint           # eslint
bunx tsc --noEmit      # type check
```

CI runs lint + type check + tests on every push to `main` and every PR
(see `.github/workflows/ci.yml`).

## Deployment

Managed via Lovable. Use the in-app **Publish** button.
