// Image credits for animal cards. Keyed by card slug. The value is the original
// filename as supplied by the user so we preserve the source reference while
// still being able to display a cleaner artist credit in the UI.

export const CARD_IMAGE_CREDITS: Record<string, string> = {
  alpaca: "hanslinde-alpaca-2907771_1920.jpg",
  anteater: "theotherkev-giant-anteater-4423584_1920.jpg",
  bear: "pexels-bear-1283347_1920.jpg",
  beaver: "ronile-nutria-273577_1920.jpg",
  bee: "nennieinszweidrei-bee-5618641_1920.jpg",
  bigfoot: "ray_shrewsberry-sasquatch-8724601_1920.jpg",
  bison: "andrzej_kulak-wisent-4862866_1920.jpg",
  bunyip: "juliush-ai-generated-8452414_1920.jpg",
  camel: "farishamza007-animal-7017408_1920.jpg",
  cassowary: "finy-helmet-cassowary-245192_1920.jpg",
  catfish: "publicdomainpictures-fish-216132_1920.jpg",
  cheetah: "dpuchlewgrzelak-cheetah-5173900_1920.jpg",
  crab: "sezbulut35-crab-5668141_1920.jpg",
  crane: "akiroq-grey-crowned-crane-1502935_1920.jpg",
  crocodile: "maxidiaz-crocodile-1210331_1920.jpg",
  deer: "darkmoon_art-deer-2687010_1920.png",
  dolphin: "ralph_germany-ai-generated-8383743_1920.jpg",
  dragon: "43422786-ai-generated-9249569_1920.png",
  dragonfly: "maritsch28-dragon-fly-971785_1920.jpg",
  duck: "alexas_fotos-mallard-2144523_1920.jpg",
  echidna: "xiserge-monotreme-7825038_1920.jpg",
  eel: "ralph_germany-ai-generated-8323717_1920.jpg",
  elephant: "shahzadskk-elephant-9772462_1920.jpg",
  fairy: "700622-fairy-2516215_1920.png",
  falcon: "canadian-nature-visions-peregrine-falcon-6913795_1920.jpg",
  firefly: "kyraxys-Firefly_-8834684_1920.png",
  "flying-fox": "ambquinn-rodrigues-fruit-bat-7523361_1920.jpg",
  fox: "pexels-fox-1842565_1920.jpg",
  frog: "zdenet-frog-111179_1920.jpg",
  giraffe: "jillwellington-giraffe-2611580_1920.jpg",
  goat: "matthiasboeckel-goat-3656281_1920.jpg",
  gorilla: "ambquinn-gorilla-8326210_1920.png",
  seamonster: "aiartista-sea_monster-9083346_1920.jpg",
};

export function getCardCredit(slug?: string | null): string | null {
  if (!slug) return null;
  return CARD_IMAGE_CREDITS[slug] ?? null;
}

export function getCardCreditArtist(slug?: string | null): string | null {
  const credit = getCardCredit(slug);
  if (!credit) return null;

  const artist = credit.split("-")[0]?.trim();
  if (!artist) return null;

  return artist.replace(/_/g, " ");
}
