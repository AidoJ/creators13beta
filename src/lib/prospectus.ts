export const APPLICATION_QUESTIONS = [
  "What is your chosen area of expertise to apply the Creator Types?",
  "How would applying the Creator Types improve outcomes for those people? State a minimum of 3 specific outcomes.",
  "How do you plan to introduce the Creator Types to those people to encourage them to become a case study?",
  "How do you intend to evolve your expertise and reach more people over time? (Eg. Through business, personal networking, community development, schooling, workplace etc)",
];

export interface ProspectusSection {
  id: string;
  sort_order: number;
  heading: string;
  body: string;
}
