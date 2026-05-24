export const TIERS = {
  wren: {
    name: "Wren",
    subtitle: "Curious Testers",
    monthlyPrice: 0,
    annualPrice: 0,
    stripe: null,
    features: [
      "Personal Dashboard + Profile",
      "Co-creator Matches by your Creator Type/s",
    ],
  },
  robin: {
    name: "Robin",
    subtitle: "Beginner Seekers",
    monthlyPrice: 28,
    annualPrice: 280,
    stripe: {
      product_id: "prod_TxQSqM8GK6jwTW",
      price_id: "price_1SzVbNKn3GaB6FyYoO6MkGVP",
    },
    features: [
      "Everything in Wren",
      "Face + Body Profile (2 Creator Types)",
      "Peer-driven Creator Courses",
      "Monthly Live Group Teachings",
    ],
  },
  cockatoo: {
    name: "Cockatoo",
    subtitle: "Certified L1 Practitioners + Business Owners",
    monthlyPrice: 88,
    annualPrice: 880,
    stripe: {
      product_id: "prod_TxQStGJfHnAXQW",
      price_id: "price_1SzVbgKn3GaB6FyYCfUgBra7",
    },
    features: [
      "Everything in Robin",
      "Co-creator Showcase + Project Creation",
      "Co-creator Skills Live Jam",
      "Team + Business Tools",
      "Masterclasses + VIP Events",
    ],
  },
  owl: {
    name: "Owl",
    subtitle: "Certified L2 Practitioners",
    monthlyPrice: 44,
    annualPrice: 440,
    stripe: {
      product_id: "prod_TxQSXgaIwOlytz",
      price_id: "price_1SzVbuKn3GaB6FyYK79PeTVa",
    },
    features: [
      "Everything in Robin",
      "Event Creation + Client Tools",
      "Private Group + Live Mentoring",
      "Practitioner-only Resources",
      "Community Builder Bonus",
    ],
  },
} as const;

export type TierKey = keyof typeof TIERS;
