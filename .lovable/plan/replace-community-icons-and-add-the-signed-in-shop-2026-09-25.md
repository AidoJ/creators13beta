# Replace Community icons and add the signed-in Shop

## Outcome
- Replace A'Hara's mapped icons everywhere they appear in the shared top navigation and Community desktop/mobile controls.
- Keep the existing brand-gold recolouring, selected states, and Connections notification badge behavior.
- Replace the front-page floating hexagon with the supplied illustrated Game button while preserving its links and phone-safe corner placement.
- Add a signed-in `/shop` page that reuses the front page's live products and checkout, without its hero, chooser, or floating Play button.
- Remove both Gumroad links and point Community Shop controls to `/shop`.

## Asset preparation
- Extract only the requested PNG files; ignore `Lotus Flower.svg` entirely.
- Resize and compress the six small navigation icons for 24–28px display while retaining transparency.
- Resize and compress the floating Game button for its larger corner-button presentation while retaining transparency and legible baked-in text.
- Compress and store the three Practitioner Level seals for the future badge feature, but do not render them.
- Store prepared images through the project asset service, then report original and prepared dimensions/file sizes.

## UI changes
- Add the Game and Community image icons to the shared desktop and mobile top navigation.
- Replace Community filter, Events, Connections, and Shop controls on desktop and mobile with the supplied images; leave Projects and Match/Dashboard unchanged.
- Preserve the current gold CSS filter and route-selected styling.
- Keep the Connections badge attached to the replacement feather icon exactly where the existing badge logic renders it.
- Make the floating Game image slightly larger than the current button, add the accessible label “Play now - free card game”, and verify it does not cover phone content or controls.

## Shared storefront
- Extract the existing product cards, product loading, checkout, and practitioner-application sections into a shared storefront surface rather than duplicating them.
- Keep `/` visually and behaviorally unchanged for signed-out visitors.
- Add protected `/shop` with products only and the normal platform header; omit the public-page hero, path chooser, and floating Play button.
- Load the signed-in member's active access through the existing shared access lookup. For a product whose granted access level is already held, replace its purchase action with a disabled “You have this” state.
- Leave other products buyable through the existing checkout and leave practitioner training as Apply.
- Preserve the existing data-driven hiding of Face Profile and Clinic Profile.

## Verification and release
- Capture signed-in Community and Shop screenshots before/after on 1280px desktop and 390px phone widths, plus the signed-out front page before/after.
- Verify Shop opens `/shop`, not the dashboard, and that no Gumroad references remain.
- With a Connect holder, verify Connect is marked held while Body Profile still launches the normal checkout; stop before completing a new charge.
- Verify signed-out `/` still includes the full front page and floating Play image with the unchanged signup destination.
- Check the latest app health/build result, fix regressions, then publish.
