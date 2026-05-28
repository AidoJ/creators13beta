// Image credits for animal cards. Shown in small grey print at the bottom of
// the zoomed (popped-out) card. Keyed by card slug. The value is the original
// Pixabay filename as supplied by the user. Add new entries as further card
// artwork is replaced with Pixabay sources.

export const CARD_IMAGE_CREDITS: Record<string, string> = {
  alpaca: "hanslinde-alpaca-2907771_1920.jpg",
  anteater: "theotherkev-giant-anteater-4423584_1920.jpg",
  firefly: "kyraxys-Firefly_-8834684_1920.png",
  seamonster: "aiartista-sea_monster-9083346_1920.jpg",
};

export function getCardCredit(slug?: string | null): string | null {
  if (!slug) return null;
  return CARD_IMAGE_CREDITS[slug] ?? null;
}
