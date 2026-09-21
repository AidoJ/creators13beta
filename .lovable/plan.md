# Review before building: products, inline pricing, fixed terms, events re-key

The brief is buildable, but six things would break or behave unexpectedly if built exactly as written. Decisions needed on items 1-4; items 5-6 are my recommendations.

## 1. Events re-key would hide every event from almost everyone (blocking)

Event visibility today is decided by the member's subscription tier. Only 12 people in the whole database hold an entitlement (the practitioner/profiled backfill), so if event access is keyed to the new levels, everyone else holds nothing but "free" and sees nothing — unless every event also grants access to "free".

Also, this *is* switching an existing tier check over, which the brief says not to do yet.

Options:
- **A (recommended):** add the level column alongside the existing tier column and keep reading tiers until switch-over. Trainers can set levels now; nothing changes for members yet.
- **B:** re-key fully now, and as part of the same change translate the current 12 rows (wren→free, robin→creator, cockatoo→co_creator, owl→owl) and give everyone a standing "free" entitlement so the baseline still works.

## 2. "owl" is not one of the access levels

The level list in item 6 includes `owl`, but the seeded levels are: free, taster, creator, co_creator, the six practitioner levels, case_study, the three profile levels, existing_profiled. No owl.

Is Owl becoming a proper level (I add it), or does the Owl tier map onto `co_creator` or a practitioner level?

## 3. A `products` table already exists

There is already an empty `products` table (name, description, price_cents, currency, image_url, active, stripe_product_id/price_id, product_type physical/digital). Nothing in the app uses it. I'd rather extend that one with the new columns than create a second products table — confirm, or tell me to name the new one something else (e.g. `plans`).

## 4. Dropping role assignment at checkout will lock people out

Item 5 says to replace the tier-based role grant with an entitlement. But roles are still what the app actually enforces: `trainee` gates courses and assessments, and around 55 database rules read roles. Removing the role while the entitlement grid is empty means an Owl buyer completes payment and can't reach anything.

Recommendation: **grant the entitlement in addition to the role**, and remove the role assignment during the switch-over, not now.

## Technical notes on the rest

**Inline pricing** — Stripe accepts inline `price_data` for one-off and recurring lines in Checkout, and for subscription item updates, so both the checkout and the "move subscribers to the current price" action work. Two consequences worth knowing:
- The Stripe customer portal can no longer offer plan changes (it needs stored prices). Cancellation and card updates still work.
- Moving existing subscribers needs a proration decision: charge the difference immediately, or apply at next renewal. I'd default to next renewal.
- Everything must stay in one currency per customer (AUD), or Stripe rejects the session.

**Fixed-term courses (13 instalments)** — Checkout can't create a bounded subscription by itself. The working pattern: Checkout creates a normal monthly subscription, then the payment webhook attaches a Stripe schedule of 13 instalments that cancels at the end. The entitlement gets `ends_at` set to the end of the term.

**Seat cap** — counting entitlements at checkout is unreliable: the entitlement isn't created until payment succeeds, so two people can pass the check and both pay. I'll check the cap at checkout *and* again in the webhook, and hold a short-lived seat reservation between the two so the last seat can't be double-sold.

**Case-study grant** — needs an idempotency rule: if someone signs up as a case study twice, does the 30-day Connect window extend, restart, or stay as-is? I'll make it "don't re-grant if one is already active" unless you say otherwise. Also, "Connect" is the display name for `taster` — I'll rename the level's display name so the admin screen matches what members see.

**has_feature with no signed-in user** — happy to make service-role callers privileged. Note it changes nothing visible yet: the grid is empty, so every feature check still returns false until the grid is filled.

## What I'd build once you've decided

1. Products/plans table + columns, RLS (public reads active+visible, admin/trainer manage all), admin screen with price editing and the two toggles.
2. Checkout reading live prices inline, plus the admin "move subscribers to current price" action.
3. Fixed-term purchase path with the 13-instalment schedule and seat cap.
4. Case-study grant (case_study + 30-day taster).
5. `has_feature` service-role fix; entitlement granted at checkout alongside the existing role.
6. Events access: per your answer to item 1.

Tested end to end with test accounts and Stripe test mode, and nothing published until you've seen the results.
