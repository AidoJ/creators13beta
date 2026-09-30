export const APPLICATION_QUESTIONS = [
  "What is your chosen area of expertise to apply the Creator Types?",
  "How would applying the Creator Types improve outcomes for those people? State a minimum of 3 specific outcomes.",
  "How do you plan to introduce the Creator Types to those people to encourage them to become a case study?",
  "How do you intend to evolve your expertise and reach more people over time? (Eg. Through business, personal networking, community development, schooling, workplace etc)",
];

export interface ProspectusSection {
  id: string;
  sort_order: number;
  layout_key: ProspectusLayoutKey | null;
  heading: string;
  body: string;
  image_urls: Record<string, string>;
}

export type ProspectusLayoutKey =
  | "cover"
  | "why"
  | "journey"
  | "training"
  | "qa"
  | "expertise"
  | "contact"
  | "eligibility"
  | "application";

export const PROSPECTUS_IMAGE_SLOTS: Partial<Record<ProspectusLayoutKey, { key: string; label: string }[]>> = {
  cover: [
    { key: "logo", label: "Cover logo" },
    { key: "figures", label: "Creator figures" },
  ],
  why: [
    { key: "logo", label: "13 Creators logo" },
    { key: "photo", label: "Training photo" },
  ],
  journey: [
    { key: "logo", label: "13 Creators logo" },
    { key: "group", label: "Group photo" },
    { key: "walk", label: "Walking photo" },
  ],
  training: [
    { key: "logo", label: "13 Creators logo" },
    { key: "texture", label: "Pink texture" },
  ],
  qa: [
    { key: "logo", label: "13 Creators logo" },
    { key: "texture", label: "Magenta texture" },
  ],
};

export function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
}
