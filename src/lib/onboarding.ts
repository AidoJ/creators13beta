import { supabase } from "@/integrations/supabase/client";

export type OnboardingStep = {
  key: string;
  feature_key: string;
  title: string;
  description: string;
  cta_label: string;
  route: string;
  sort_order: number;
  icon_key: string;
  done: boolean;
  dismissed_at: string | null;
  completed_seen_at: string | null;
};

export async function markOnboardingVisited(marker: string) {
  await (supabase as any).rpc("mark_onboarding_visited", { _marker_key: marker });
}
