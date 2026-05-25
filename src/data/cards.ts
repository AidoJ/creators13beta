// AUTO-GENERATED from Creator_Types_Animal_Fusions spreadsheet (Sheet2). Do not hand-edit.

export type CreatorType =
  | "Lava"
  | "Fire"
  | "Whirlwind"
  | "Snow"
  | "Lightning"
  | "Sun"
  | "Lake"
  | "Ocean"
  | "Tree"
  | "Mountain"
  | "Soil"
  | "River"
  | "Sky";

export const CREATOR_TYPE_COLORS: Record<CreatorType, string> = {
  Lava: "#da7028",
  Fire: "#eda35e",
  Whirlwind: "#abd49e",
  Snow: "#c2e5cf",
  Lightning: "#8fd4b8",
  Sun: "#f2d178",
  Lake: "#7db2d9",
  Ocean: "#6173b0",
  Tree: "#db7d75",
  Mountain: "#c45463",
  Soil: "#944a47",
  River: "#99ccd4",
  Sky: "#bdb2e5",
};

export const CREATOR_TYPE_ORDER: CreatorType[] = [
  "Lava", "Fire", "Whirlwind", "Snow", "Lightning", "Sun", "Lake", "Ocean", "Tree", "Mountain", "Soil", "River", "Sky",
];

export interface AnimalCard {
  name: string;
  slug: string;
  types: [CreatorType, CreatorType];
  mythical: boolean;
}

export const ANIMAL_CARDS: AnimalCard[] = [
  { name: "Bear", slug: "bear", types: ["Lava", "Soil"], mythical: false },
  { name: "Bee", slug: "bee", types: ["Lava", "Snow"], mythical: false },
  { name: "Cassowary", slug: "cassowary", types: ["Lava", "Tree"], mythical: false },
  { name: "Echidna", slug: "echidna", types: ["Lava", "Lake"], mythical: false },
  { name: "Eel", slug: "eel", types: ["Lava", "River"], mythical: false },
  { name: "Fox", slug: "fox", types: ["Lava", "Fire"], mythical: false },
  { name: "Griffin", slug: "griffin", types: ["Lava", "Sky"], mythical: true },
  { name: "Iguana", slug: "iguana", types: ["Lava", "Sun"], mythical: false },
  { name: "Octopus", slug: "octopus", types: ["Lava", "Ocean"], mythical: false },
  { name: "Tiger", slug: "tiger", types: ["Lava", "Mountain"], mythical: false },
  { name: "Wasp", slug: "wasp", types: ["Lava", "Lightning"], mythical: false },
  { name: "Wolf", slug: "wolf", types: ["Lava", "Snow"], mythical: false },
  { name: "Camel", slug: "camel", types: ["Fire", "Soil"], mythical: false },
  { name: "Cheetah", slug: "cheetah", types: ["Fire", "Lightning"], mythical: false },
  { name: "Dragon", slug: "dragon", types: ["Fire", "Sky"], mythical: true },
  { name: "Gorilla", slug: "gorilla", types: ["Fire", "Mountain"], mythical: false },
  { name: "Lemur", slug: "lemur", types: ["Fire", "Tree"], mythical: false },
  { name: "Mouse", slug: "mouse", types: ["Fire", "Snow"], mythical: false },
  { name: "Otter", slug: "otter", types: ["Fire", "River"], mythical: false },
  { name: "Panda", slug: "panda", types: ["Fire", "Lake"], mythical: false },
  { name: "Seal", slug: "seal", types: ["Fire", "Ocean"], mythical: false },
  { name: "Squirrel", slug: "squirrel", types: ["Fire", "Whirlwind"], mythical: false },
  { name: "Zebra", slug: "zebra", types: ["Fire", "Sun"], mythical: false },
  { name: "Arctic Hare", slug: "arctic-hare", types: ["Whirlwind", "Snow"], mythical: false },
  { name: "Dolphin", slug: "dolphin", types: ["Whirlwind", "Ocean"], mythical: false },
  { name: "Dragonfly", slug: "dragonfly", types: ["Whirlwind", "Lake"], mythical: false },
  { name: "Fairy", slug: "fairy", types: ["Whirlwind", "Sky"], mythical: true },
  { name: "Firefly", slug: "firefly", types: ["Whirlwind", "Lightning"], mythical: false },
  { name: "Horse", slug: "horse", types: ["Whirlwind", "Mountain"], mythical: false },
  { name: "Kangaroo", slug: "kangaroo", types: ["Whirlwind", "Sun"], mythical: false },
  { name: "Ostrich", slug: "ostrich", types: ["Whirlwind", "Soil"], mythical: false },
  { name: "Rabbit", slug: "rabbit", types: ["Whirlwind", "Snow"], mythical: false },
  { name: "Shark", slug: "shark", types: ["Whirlwind", "River"], mythical: false },
  { name: "Woodpecker", slug: "woodpecker", types: ["Whirlwind", "Tree"], mythical: false },
  { name: "Alpaca", slug: "alpaca", types: ["Snow", "Soil"], mythical: false },
  { name: "Deer", slug: "deer", types: ["Snow", "Lightning"], mythical: false },
  { name: "Duck", slug: "duck", types: ["Snow", "River"], mythical: false },
  { name: "Leopard", slug: "leopard", types: ["Snow", "Mountain"], mythical: false },
  { name: "Peacock", slug: "peacock", types: ["Snow", "Sun"], mythical: false },
  { name: "Penguin", slug: "penguin", types: ["Snow", "Ocean"], mythical: false },
  { name: "Snow Leopard", slug: "snow-leopard", types: ["Snow", "Mountain"], mythical: false },
  { name: "Spider", slug: "spider", types: ["Snow", "Tree"], mythical: false },
  { name: "Swan", slug: "swan", types: ["Snow", "Lake"], mythical: false },
  { name: "Unicorn", slug: "unicorn", types: ["Snow", "Sky"], mythical: true },
  { name: "Catfish", slug: "catfish", types: ["Lightning", "River"], mythical: false },
  { name: "Crane", slug: "crane", types: ["Lightning", "Lake"], mythical: false },
  { name: "Falcon", slug: "falcon", types: ["Lightning", "Mountain"], mythical: false },
  { name: "Flying Fox", slug: "flying-fox", types: ["Lightning", "Sun"], mythical: false },
  { name: "Giraffe", slug: "giraffe", types: ["Lightning", "Tree"], mythical: false },
  { name: "Platypus", slug: "platypus", types: ["Lightning", "Soil"], mythical: false },
  { name: "Swordfish", slug: "swordfish", types: ["Lightning", "Ocean"], mythical: false },
  { name: "Thunderbird", slug: "thunderbird", types: ["Lightning", "Sky"], mythical: true },
  { name: "Elephant", slug: "elephant", types: ["Sun", "Soil"], mythical: false },
  { name: "Kingfisher", slug: "kingfisher", types: ["Sun", "River"], mythical: false },
  { name: "Koala", slug: "koala", types: ["Sun", "Tree"], mythical: false },
  { name: "Lion", slug: "lion", types: ["Sun", "Mountain"], mythical: false },
  { name: "Rainbow Serpent", slug: "rainbow-serpent", types: ["Sun", "Sky"], mythical: true },
  { name: "Starfish", slug: "starfish", types: ["Sun", "Ocean"], mythical: false },
  { name: "Turtle", slug: "turtle", types: ["Sun", "Lake"], mythical: false },
  { name: "Beaver", slug: "beaver", types: ["Lake", "River"], mythical: false },
  { name: "Bunyip", slug: "bunyip", types: ["Lake", "Sky"], mythical: true },
  { name: "Crab", slug: "crab", types: ["Lake", "Mountain"], mythical: false },
  { name: "Frog", slug: "frog", types: ["Lake", "Tree"], mythical: false },
  { name: "Jellyfish", slug: "jellyfish", types: ["Lake", "Ocean"], mythical: false },
  { name: "Wombat", slug: "wombat", types: ["Lake", "Soil"], mythical: false },
  { name: "Crocodile", slug: "crocodile", types: ["Ocean", "Mountain"], mythical: false },
  { name: "Merper", slug: "merper", types: ["Ocean", "Sky"], mythical: true },
  { name: "Seahorse", slug: "seahorse", types: ["Ocean", "Tree"], mythical: false },
  { name: "Stingray", slug: "stingray", types: ["Ocean", "River"], mythical: false },
  { name: "Whale", slug: "whale", types: ["Ocean", "Soil"], mythical: false },
  { name: "Goat", slug: "goat", types: ["Tree", "Mountain"], mythical: false },
  { name: "Knome", slug: "knome", types: ["Tree", "Sky"], mythical: true },
  { name: "Sloth", slug: "sloth", types: ["Tree", "Soil"], mythical: false },
  { name: "Snake", slug: "snake", types: ["Tree", "River"], mythical: false },
  { name: "Bigfoot", slug: "bigfoot", types: ["Mountain", "Sky"], mythical: true },
  { name: "Bison", slug: "bison", types: ["Mountain", "Soil"], mythical: false },
  { name: "Salamander", slug: "salamander", types: ["Mountain", "River"], mythical: false },
  { name: "Anteater", slug: "anteater", types: ["Soil", "River"], mythical: false },
  { name: "Hobbit", slug: "hobbit", types: ["Soil", "Sky"], mythical: true },
  { name: "Seamonster", slug: "seamonster", types: ["River", "Sky"], mythical: true },
];
