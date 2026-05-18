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
  falcon: {
    name: "Falcon",
    subtitle: "Advanced Seekers",
    monthlyPrice: 88,
    annualPrice: 880,
    stripe: {
      product_id: "prod_TxQStGJfHnAXQW",
      price_id: "price_1SzVbgKn3GaB6FyYCfUgBra7",
    },
    features: [
      "Everything in Robin",
      "Advanced Body Profile (4 Creator Types)",
      "Co-creator Skills Live Jam",
      "Co-creator Showcase",
      "Masterclasses + VIP Events",
    ],
  },
  owl: {
    name: "Owl",
    subtitle: "Older Wiser Learners",
    monthlyPrice: 44,
    annualPrice: 440,
    stripe: {
      product_id: "prod_TxQSXgaIwOlytz",
      price_id: "price_1SzVbuKn3GaB6FyYK79PeTVa",
    },
    features: [
      "Everything in Falcon",
      "Client Management Tools",
      "Private Group + Live Mentoring",
      "Practitioner-only Resources",
      "Community Builder Bonus",
    ],
  },
} as const;

export type TierKey = keyof typeof TIERS;
