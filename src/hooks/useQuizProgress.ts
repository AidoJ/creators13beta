import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface QuizQuestion {
  id: string;
  creator_type: string;
  category: string;
  prompt: string;
  option_a: string; option_b: string; option_c: string; option_d: string;
  explanation: string | null;
  // correct_option intentionally omitted — server validates.
}
export interface QuizProgress {
  correct_count: number;
  wrong_count: number;
  bonus_awarded: boolean;
  bonus_points_awarded: number;
  open_question_id: string | null;
}
export interface QuizSettings {
  enabled: boolean;
  bonus_points: number;
  questions_per_match: number;
}

/**
 * Client-side quiz state for a match. Polls quiz_match_progress + open question
 * whenever the match seq changes (via an external `refreshKey` bump).
 */
export function useQuizProgress(matchId: string | null, userId: string | null, refreshKey: number) {
  const [progress, setProgress] = useState<QuizProgress | null>(null);
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [settings, setSettings] = useState<QuizSettings>({ enabled: true, bonus_points: 1, questions_per_match: 4 });
  const settingsLoaded = useRef(false);

  useEffect(() => {
    if (settingsLoaded.current) return;
    settingsLoaded.current = true;
    void supabase.from("game_settings").select("quiz_enabled, quiz_bonus_threshold, quiz_bonus_points").limit(1).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setSettings({
          enabled: data.quiz_enabled ?? true,
          threshold: data.quiz_bonus_threshold ?? 4,
          bonus_points: data.quiz_bonus_points ?? 1,
        });
      });
  }, []);

  useEffect(() => {
    if (!matchId || !userId) { setProgress(null); setQuestion(null); return; }
    let cancelled = false;
    void (async () => {
      const { data: p } = await supabase.from("quiz_match_progress").select("correct_count, wrong_count, bonus_awarded, open_question_id")
        .eq("match_id", matchId).eq("user_id", userId).maybeSingle();
      if (cancelled) return;
      const prog: QuizProgress = p ?? { correct_count: 0, wrong_count: 0, bonus_awarded: false, open_question_id: null };
      setProgress(prog);
      if (prog.open_question_id) {
        const { data: q } = await supabase.from("quiz_questions")
          .select("id, creator_type, category, prompt, option_a, option_b, option_c, option_d, explanation")
          .eq("id", prog.open_question_id).maybeSingle();
        if (!cancelled) setQuestion(q ?? null);
      } else {
        setQuestion(null);
      }
    })();
    return () => { cancelled = true; };
  }, [matchId, userId, refreshKey]);

  const submit = useCallback(async (chosen: "a" | "b" | "c" | "d") => {
    if (!matchId || !question) return null;
    const { data, error } = await supabase.rpc("submit_quiz_answer", {
      _match_id: matchId, _question_id: question.id, _chosen_option: chosen,
    });
    if (error) throw error;
    // Optimistic bump so the badge counter updates before the next refresh.
    const res = data as any;
    setProgress(pr => pr ? {
      ...pr,
      correct_count: res.correct_count ?? pr.correct_count,
      wrong_count: res.wrong_count ?? pr.wrong_count,
      bonus_awarded: res.bonus_awarded ?? pr.bonus_awarded,
      open_question_id: null,
    } : pr);
    return res as { correct: boolean; correct_option: "a"|"b"|"c"|"d"; explanation: string | null; correct_count: number; wrong_count: number; bonus_awarded: boolean; bonus_just_awarded: boolean; threshold: number };
  }, [matchId, question]);

  return { progress, question, settings, submit };
}
