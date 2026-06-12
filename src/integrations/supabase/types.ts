export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assessment_results: {
        Row: {
          answers: Json | null
          assessment_id: string
          completed_at: string
          id: string
          passed: boolean | null
          score: number | null
          user_id: string
        }
        Insert: {
          answers?: Json | null
          assessment_id: string
          completed_at?: string
          id?: string
          passed?: boolean | null
          score?: number | null
          user_id: string
        }
        Update: {
          answers?: Json | null
          assessment_id?: string
          completed_at?: string
          id?: string
          passed?: boolean | null
          score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_results_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          assessment_type: Database["public"]["Enums"]["assessment_type"] | null
          created_at: string
          description: string | null
          id: string
          module_id: string
          pass_percentage: number | null
          questions: Json | null
          sort_order: number | null
          title: string
          updated_at: string
        }
        Insert: {
          assessment_type?:
            | Database["public"]["Enums"]["assessment_type"]
            | null
          created_at?: string
          description?: string | null
          id?: string
          module_id: string
          pass_percentage?: number | null
          questions?: Json | null
          sort_order?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          assessment_type?:
            | Database["public"]["Enums"]["assessment_type"]
            | null
          created_at?: string
          description?: string | null
          id?: string
          module_id?: string
          pass_percentage?: number | null
          questions?: Json | null
          sort_order?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          calendly_event_id: string | null
          client_id: string
          created_at: string
          duration_minutes: number | null
          id: string
          notes: string | null
          practitioner_id: string | null
          scheduled_at: string | null
          status: string | null
          zoom_link: string | null
        }
        Insert: {
          calendly_event_id?: string | null
          client_id: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          practitioner_id?: string | null
          scheduled_at?: string | null
          status?: string | null
          zoom_link?: string | null
        }
        Update: {
          calendly_event_id?: string | null
          client_id?: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          practitioner_id?: string | null
          scheduled_at?: string | null
          status?: string | null
          zoom_link?: string | null
        }
        Relationships: []
      }
      bot_match_stats: {
        Row: {
          difficulty: string
          draws: number
          last_played_at: string | null
          losses: number
          perfect_ecos: number
          updated_at: string
          user_id: string
          wins: number
        }
        Insert: {
          difficulty: string
          draws?: number
          last_played_at?: string | null
          losses?: number
          perfect_ecos?: number
          updated_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          difficulty?: string
          draws?: number
          last_played_at?: string | null
          losses?: number
          perfect_ecos?: number
          updated_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: []
      }
      case_studies: {
        Row: {
          body_drawing_path: string | null
          created_at: string
          creator_types_identified: string[] | null
          description: string | null
          form_data: Json | null
          id: string
          practitioner_id: string
          profiling_complete: boolean
          profiling_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          status: Database["public"]["Enums"]["case_study_status"] | null
          subject_user_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body_drawing_path?: string | null
          created_at?: string
          creator_types_identified?: string[] | null
          description?: string | null
          form_data?: Json | null
          id?: string
          practitioner_id: string
          profiling_complete?: boolean
          profiling_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: Database["public"]["Enums"]["case_study_status"] | null
          subject_user_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body_drawing_path?: string | null
          created_at?: string
          creator_types_identified?: string[] | null
          description?: string | null
          form_data?: Json | null
          id?: string
          practitioner_id?: string
          profiling_complete?: boolean
          profiling_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: Database["public"]["Enums"]["case_study_status"] | null
          subject_user_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_invitations: {
        Row: {
          created_at: string
          email: string
          id: string
          invite_token: string
          name: string
          phone: string | null
          practitioner_id: string
          reminder_sent_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invite_token?: string
          name: string
          phone?: string | null
          practitioner_id: string
          reminder_sent_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invite_token?: string
          name?: string
          phone?: string | null
          practitioner_id?: string
          reminder_sent_at?: string | null
          status?: string
        }
        Relationships: []
      }
      client_practitioner: {
        Row: {
          active: boolean | null
          assigned_at: string
          client_id: string
          id: string
          practitioner_id: string
        }
        Insert: {
          active?: boolean | null
          assigned_at?: string
          client_id: string
          id?: string
          practitioner_id: string
        }
        Update: {
          active?: boolean | null
          assigned_at?: string
          client_id?: string
          id?: string
          practitioner_id?: string
        }
        Relationships: []
      }
      client_recordings: {
        Row: {
          client_id: string
          created_at: string
          expires_at: string
          id: string
          label: string | null
          practitioner_id: string
          url: string
        }
        Insert: {
          client_id: string
          created_at?: string
          expires_at: string
          id?: string
          label?: string | null
          practitioner_id: string
          url: string
        }
        Update: {
          client_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          label?: string | null
          practitioner_id?: string
          url?: string
        }
        Relationships: []
      }
      community_posts: {
        Row: {
          content: string | null
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contact_requests: {
        Row: {
          created_at: string
          decline_comment: string | null
          from_user_id: string
          id: string
          reason: string
          responded_at: string | null
          revoked_at: string | null
          status: string
          to_user_id: string
        }
        Insert: {
          created_at?: string
          decline_comment?: string | null
          from_user_id: string
          id?: string
          reason: string
          responded_at?: string | null
          revoked_at?: string | null
          status?: string
          to_user_id: string
        }
        Update: {
          created_at?: string
          decline_comment?: string | null
          from_user_id?: string
          id?: string
          reason?: string
          responded_at?: string | null
          revoked_at?: string | null
          status?: string
          to_user_id?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          created_at: string
          description: string | null
          id: string
          published: boolean | null
          sort_order: number | null
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          published?: boolean | null
          sort_order?: number | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          published?: boolean | null
          sort_order?: number | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      creator_type_family_map: {
        Row: {
          creator_type: string
          family: string
        }
        Insert: {
          creator_type: string
          family: string
        }
        Update: {
          creator_type?: string
          family?: string
        }
        Relationships: []
      }
      creator_type_profiles: {
        Row: {
          created_at: string
          id: string
          primary_type: string | null
          profiled_at: string | null
          profiled_by: string | null
          profiling_data: Json | null
          secondary_type: string | null
          source: string
          type_3: string | null
          type_4: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          primary_type?: string | null
          profiled_at?: string | null
          profiled_by?: string | null
          profiling_data?: Json | null
          secondary_type?: string | null
          source?: string
          type_3?: string | null
          type_4?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          primary_type?: string | null
          profiled_at?: string | null
          profiled_by?: string | null
          profiling_data?: Json | null
          secondary_type?: string | null
          source?: string
          type_3?: string | null
          type_4?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      creator_types: {
        Row: {
          at_the_table: string | null
          body_markers: Json | null
          color_hex: string | null
          created_at: string
          creative_power: string | null
          description: string | null
          disaster_state: string | null
          element: string
          energy_pattern: string | null
          family: string
          famous_person_name: string | null
          famous_person_photo_url: string | null
          icon_name: string | null
          id: string
          name: string
          natural_power: string | null
          profile_content: Json | null
          shadow_side: string | null
          signature: string | null
          sort_order: number | null
          team_role: string | null
          you_might_be_if: string | null
        }
        Insert: {
          at_the_table?: string | null
          body_markers?: Json | null
          color_hex?: string | null
          created_at?: string
          creative_power?: string | null
          description?: string | null
          disaster_state?: string | null
          element: string
          energy_pattern?: string | null
          family: string
          famous_person_name?: string | null
          famous_person_photo_url?: string | null
          icon_name?: string | null
          id?: string
          name: string
          natural_power?: string | null
          profile_content?: Json | null
          shadow_side?: string | null
          signature?: string | null
          sort_order?: number | null
          team_role?: string | null
          you_might_be_if?: string | null
        }
        Update: {
          at_the_table?: string | null
          body_markers?: Json | null
          color_hex?: string | null
          created_at?: string
          creative_power?: string | null
          description?: string | null
          disaster_state?: string | null
          element?: string
          energy_pattern?: string | null
          family?: string
          famous_person_name?: string | null
          famous_person_photo_url?: string | null
          icon_name?: string | null
          id?: string
          name?: string
          natural_power?: string | null
          profile_content?: Json | null
          shadow_side?: string | null
          signature?: string | null
          sort_order?: number | null
          team_role?: string | null
          you_might_be_if?: string | null
        }
        Relationships: []
      }
      discord_links: {
        Row: {
          discord_user_id: string
          discord_username: string | null
          id: string
          last_synced_at: string | null
          last_synced_role: string | null
          linked_at: string
          user_id: string
        }
        Insert: {
          discord_user_id: string
          discord_username?: string | null
          id?: string
          last_synced_at?: string | null
          last_synced_role?: string | null
          linked_at?: string
          user_id: string
        }
        Update: {
          discord_user_id?: string
          discord_username?: string | null
          id?: string
          last_synced_at?: string | null
          last_synced_role?: string | null
          linked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          created_at: string
          description: string | null
          html_body: string
          id: string
          subject: string
          template_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          html_body?: string
          id?: string
          subject?: string
          template_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          html_body?: string
          id?: string
          subject?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      faqs: {
        Row: {
          answer: string
          audience: string
          category: string
          created_at: string
          id: string
          question: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          audience?: string
          category: string
          created_at?: string
          id?: string
          question: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          audience?: string
          category?: string
          created_at?: string
          id?: string
          question?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      game_cards: {
        Row: {
          art_path: string | null
          code: string | null
          created_at: string
          descriptor: string | null
          id: string
          mythical: boolean
          name: string
          slug: string
          sort_order: number
          type_a: string
          type_b: string
          updated_at: string
        }
        Insert: {
          art_path?: string | null
          code?: string | null
          created_at?: string
          descriptor?: string | null
          id?: string
          mythical?: boolean
          name: string
          slug: string
          sort_order?: number
          type_a: string
          type_b: string
          updated_at?: string
        }
        Update: {
          art_path?: string | null
          code?: string | null
          created_at?: string
          descriptor?: string | null
          id?: string
          mythical?: boolean
          name?: string
          slug?: string
          sort_order?: number
          type_a?: string
          type_b?: string
          updated_at?: string
        }
        Relationships: []
      }
      game_match_moves: {
        Row: {
          actor: string
          applied_at: string
          match_id: string
          move: Json
          seq: number
        }
        Insert: {
          actor: string
          applied_at?: string
          match_id: string
          move: Json
          seq: number
        }
        Update: {
          actor?: string
          applied_at?: string
          match_id?: string
          move?: Json
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_match_moves_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "game_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      game_matches: {
        Row: {
          created_at: string
          guest_name: string | null
          guest_user_id: string | null
          host_name: string
          host_user_id: string
          id: string
          invite_token: string | null
          is_ranked: boolean
          last_action_by: string | null
          mode: Database["public"]["Enums"]["match_mode"]
          public_state: Json | null
          rng_seed: number
          seq: number
          state: Json
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
          winner_user_id: string | null
        }
        Insert: {
          created_at?: string
          guest_name?: string | null
          guest_user_id?: string | null
          host_name: string
          host_user_id: string
          id?: string
          invite_token?: string | null
          is_ranked?: boolean
          last_action_by?: string | null
          mode?: Database["public"]["Enums"]["match_mode"]
          public_state?: Json | null
          rng_seed?: number
          seq?: number
          state: Json
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          winner_user_id?: string | null
        }
        Update: {
          created_at?: string
          guest_name?: string | null
          guest_user_id?: string | null
          host_name?: string
          host_user_id?: string
          id?: string
          invite_token?: string | null
          is_ranked?: boolean
          last_action_by?: string | null
          mode?: Database["public"]["Enums"]["match_mode"]
          public_state?: Json | null
          rng_seed?: number
          seq?: number
          state?: Json
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          winner_user_id?: string | null
        }
        Relationships: []
      }
      game_scores: {
        Row: {
          game_type: string | null
          id: string
          played_at: string
          score: number | null
          user_id: string
        }
        Insert: {
          game_type?: string | null
          id?: string
          played_at?: string
          score?: number | null
          user_id: string
        }
        Update: {
          game_type?: string | null
          id?: string
          played_at?: string
          score?: number | null
          user_id?: string
        }
        Relationships: []
      }
      game_settings: {
        Row: {
          allow_guest_play: boolean
          allow_solo_vs_bot: boolean
          animals_per_creator: number
          beat_clock_match_minutes: number
          beat_clock_turn_seconds: number
          bot_difficulty: string
          bot_easy_enabled: boolean
          bot_hard_enabled: boolean
          bot_medium_enabled: boolean
          bot_think_ms: number
          creators_needed: number
          default_mode: string
          ecosystem_target: number
          elo_loss: number
          elo_win: number
          enable_disasters: boolean
          enable_golden_body: boolean
          enable_golden_hive: boolean
          enable_sky_creator: boolean
          enable_sky_creature_steal: boolean
          featured_mode: string | null
          hand_limit: number
          hand_size: number
          id: string
          maintenance_banner_enabled: boolean
          maintenance_banner_text: string
          max_players_per_match: number
          mode_beat_clock_enabled: boolean
          mode_end_of_days_enabled: boolean
          mode_top_score_enabled: boolean
          perfect_eco_bonus: number
          play_disabled: boolean
          play_disabled_message: string
          points_per_win: number
          profile_discount_cta_body: string
          profile_discount_cta_title: string
          profile_discount_enabled: boolean
          profile_discount_percent_1: number
          profile_discount_percent_2: number
          profile_discount_percent_3: number
          profile_discount_threshold_1: number
          profile_discount_threshold_2: number
          profile_discount_threshold_3: number
          prompt_player_name: boolean
          show_discord_chat: boolean
          show_review_boards: boolean
          show_score_panel: boolean
          show_tutorial_overlay: boolean
          top_score_default: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_guest_play?: boolean
          allow_solo_vs_bot?: boolean
          animals_per_creator?: number
          beat_clock_match_minutes?: number
          beat_clock_turn_seconds?: number
          bot_difficulty?: string
          bot_easy_enabled?: boolean
          bot_hard_enabled?: boolean
          bot_medium_enabled?: boolean
          bot_think_ms?: number
          creators_needed?: number
          default_mode?: string
          ecosystem_target?: number
          elo_loss?: number
          elo_win?: number
          enable_disasters?: boolean
          enable_golden_body?: boolean
          enable_golden_hive?: boolean
          enable_sky_creator?: boolean
          enable_sky_creature_steal?: boolean
          featured_mode?: string | null
          hand_limit?: number
          hand_size?: number
          id?: string
          maintenance_banner_enabled?: boolean
          maintenance_banner_text?: string
          max_players_per_match?: number
          mode_beat_clock_enabled?: boolean
          mode_end_of_days_enabled?: boolean
          mode_top_score_enabled?: boolean
          perfect_eco_bonus?: number
          play_disabled?: boolean
          play_disabled_message?: string
          points_per_win?: number
          profile_discount_cta_body?: string
          profile_discount_cta_title?: string
          profile_discount_enabled?: boolean
          profile_discount_percent_1?: number
          profile_discount_percent_2?: number
          profile_discount_percent_3?: number
          profile_discount_threshold_1?: number
          profile_discount_threshold_2?: number
          profile_discount_threshold_3?: number
          prompt_player_name?: boolean
          show_discord_chat?: boolean
          show_review_boards?: boolean
          show_score_panel?: boolean
          show_tutorial_overlay?: boolean
          top_score_default?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_guest_play?: boolean
          allow_solo_vs_bot?: boolean
          animals_per_creator?: number
          beat_clock_match_minutes?: number
          beat_clock_turn_seconds?: number
          bot_difficulty?: string
          bot_easy_enabled?: boolean
          bot_hard_enabled?: boolean
          bot_medium_enabled?: boolean
          bot_think_ms?: number
          creators_needed?: number
          default_mode?: string
          ecosystem_target?: number
          elo_loss?: number
          elo_win?: number
          enable_disasters?: boolean
          enable_golden_body?: boolean
          enable_golden_hive?: boolean
          enable_sky_creator?: boolean
          enable_sky_creature_steal?: boolean
          featured_mode?: string | null
          hand_limit?: number
          hand_size?: number
          id?: string
          maintenance_banner_enabled?: boolean
          maintenance_banner_text?: string
          max_players_per_match?: number
          mode_beat_clock_enabled?: boolean
          mode_end_of_days_enabled?: boolean
          mode_top_score_enabled?: boolean
          perfect_eco_bonus?: number
          play_disabled?: boolean
          play_disabled_message?: string
          points_per_win?: number
          profile_discount_cta_body?: string
          profile_discount_cta_title?: string
          profile_discount_enabled?: boolean
          profile_discount_percent_1?: number
          profile_discount_percent_2?: number
          profile_discount_percent_3?: number
          profile_discount_threshold_1?: number
          profile_discount_threshold_2?: number
          profile_discount_threshold_3?: number
          prompt_player_name?: boolean
          show_discord_chat?: boolean
          show_review_boards?: boolean
          show_score_panel?: boolean
          show_tutorial_overlay?: boolean
          top_score_default?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      lesson_progress: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          created_at: string
          id: string
          lesson_id: string
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string
          id?: string
          lesson_id: string
          user_id: string
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string
          id?: string
          lesson_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          content: string | null
          content_type: Database["public"]["Enums"]["content_type"] | null
          created_at: string
          duration_minutes: number | null
          id: string
          media_url: string | null
          module_id: string
          sort_order: number | null
          title: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          content_type?: Database["public"]["Enums"]["content_type"] | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          media_url?: string | null
          module_id: string
          sort_order?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          content_type?: Database["public"]["Enums"]["content_type"] | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          media_url?: string | null
          module_id?: string
          sort_order?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      member_animals: {
        Row: {
          card_slug: string
          created_at: string
          hidden: boolean
          id: string
          pinned: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          card_slug: string
          created_at?: string
          hidden?: boolean
          id?: string
          pinned?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          card_slug?: string
          created_at?: string
          hidden?: boolean
          id?: string
          pinned?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_animals_card_slug_fkey"
            columns: ["card_slug"]
            isOneToOne: false
            referencedRelation: "game_cards"
            referencedColumns: ["slug"]
          },
        ]
      }
      member_match_scores: {
        Row: {
          computed_at: string
          member_a_id: string
          member_b_id: string
          score: number
        }
        Insert: {
          computed_at?: string
          member_a_id: string
          member_b_id: string
          score: number
        }
        Update: {
          computed_at?: string
          member_a_id?: string
          member_b_id?: string
          score?: number
        }
        Relationships: []
      }
      modules: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          id: string
          sort_order: number | null
          title: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          currency: string | null
          id: string
          items: Json | null
          shipping_address: Json | null
          status: Database["public"]["Enums"]["order_status"] | null
          stripe_payment_intent_id: string | null
          total_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          id?: string
          items?: Json | null
          shipping_address?: Json | null
          status?: Database["public"]["Enums"]["order_status"] | null
          stripe_payment_intent_id?: string | null
          total_cents?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          id?: string
          items?: Json | null
          shipping_address?: Json | null
          status?: Database["public"]["Enums"]["order_status"] | null
          stripe_payment_intent_id?: string | null
          total_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      player_progress: {
        Row: {
          badges: string[]
          created_at: string
          current_streak: number
          elo: number
          last_played_at: string | null
          longest_streak: number
          perfect_ecosystems: number
          points: number
          types_seen: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          badges?: string[]
          created_at?: string
          current_streak?: number
          elo?: number
          last_played_at?: string | null
          longest_streak?: number
          perfect_ecosystems?: number
          points?: number
          types_seen?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          badges?: string[]
          created_at?: string
          current_streak?: number
          elo?: number
          last_played_at?: string | null
          longest_streak?: number
          perfect_ecosystems?: number
          points?: number
          types_seen?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean | null
          created_at: string
          currency: string | null
          description: string | null
          id: string
          image_url: string | null
          name: string
          price_cents: number
          product_type: Database["public"]["Enums"]["product_type"] | null
          shopify_product_id: string | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          price_cents?: number
          product_type?: Database["public"]["Enums"]["product_type"] | null
          shopify_product_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price_cents?: number
          product_type?: Database["public"]["Enums"]["product_type"] | null
          shopify_product_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profile_discount_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          percent: number
          redeemed_at: string | null
          scope: string
          threshold: number
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          percent: number
          redeemed_at?: string | null
          scope?: string
          threshold: number
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          percent?: number
          redeemed_at?: string | null
          scope?: string
          threshold?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          avatar_url: string | null
          bio_intriguing: string | null
          bio_superpower: string | null
          bio_where_i_live: string | null
          case_study_consent_at: string | null
          city: string | null
          community_joined_at: string | null
          community_visible: boolean
          contact_channels: Json
          country: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          email: string | null
          enrollment_step: Database["public"]["Enums"]["enrollment_step"] | null
          first_name: string | null
          gender: string | null
          height_cm: number | null
          hide_avatar: boolean
          id: string
          invitation_code: string
          invited_by_user_id: string | null
          last_name: string | null
          location_label: string | null
          location_lat: number | null
          location_lng: number | null
          medical_history: string | null
          member_preferences: Json
          open_to_contact: boolean
          phone: string | null
          postal_code: string | null
          practitioner_code: string | null
          practitioner_status:
            | Database["public"]["Enums"]["practitioner_status"]
            | null
          profile_completed_at: string | null
          project_dream: string | null
          project_seek_me_for: string | null
          project_top_skills: string | null
          pronouns: string | null
          shoe_size: string | null
          state: string | null
          stock_avatar: string | null
          timezone: string | null
          training_started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          avatar_url?: string | null
          bio_intriguing?: string | null
          bio_superpower?: string | null
          bio_where_i_live?: string | null
          case_study_consent_at?: string | null
          city?: string | null
          community_joined_at?: string | null
          community_visible?: boolean
          contact_channels?: Json
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          email?: string | null
          enrollment_step?:
            | Database["public"]["Enums"]["enrollment_step"]
            | null
          first_name?: string | null
          gender?: string | null
          height_cm?: number | null
          hide_avatar?: boolean
          id?: string
          invitation_code?: string
          invited_by_user_id?: string | null
          last_name?: string | null
          location_label?: string | null
          location_lat?: number | null
          location_lng?: number | null
          medical_history?: string | null
          member_preferences?: Json
          open_to_contact?: boolean
          phone?: string | null
          postal_code?: string | null
          practitioner_code?: string | null
          practitioner_status?:
            | Database["public"]["Enums"]["practitioner_status"]
            | null
          profile_completed_at?: string | null
          project_dream?: string | null
          project_seek_me_for?: string | null
          project_top_skills?: string | null
          pronouns?: string | null
          shoe_size?: string | null
          state?: string | null
          stock_avatar?: string | null
          timezone?: string | null
          training_started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          avatar_url?: string | null
          bio_intriguing?: string | null
          bio_superpower?: string | null
          bio_where_i_live?: string | null
          case_study_consent_at?: string | null
          city?: string | null
          community_joined_at?: string | null
          community_visible?: boolean
          contact_channels?: Json
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          email?: string | null
          enrollment_step?:
            | Database["public"]["Enums"]["enrollment_step"]
            | null
          first_name?: string | null
          gender?: string | null
          height_cm?: number | null
          hide_avatar?: boolean
          id?: string
          invitation_code?: string
          invited_by_user_id?: string | null
          last_name?: string | null
          location_label?: string | null
          location_lat?: number | null
          location_lng?: number | null
          medical_history?: string | null
          member_preferences?: Json
          open_to_contact?: boolean
          phone?: string | null
          postal_code?: string | null
          practitioner_code?: string | null
          practitioner_status?:
            | Database["public"]["Enums"]["practitioner_status"]
            | null
          profile_completed_at?: string | null
          project_dream?: string | null
          project_seek_me_for?: string | null
          project_top_skills?: string | null
          pronouns?: string | null
          shoe_size?: string | null
          state?: string | null
          stock_avatar?: string | null
          timezone?: string | null
          training_started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiling_photos: {
        Row: {
          id: string
          photo_type: string
          storage_path: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          id?: string
          photo_type: string
          storage_path: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          id?: string
          photo_type?: string
          storage_path?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      special_cards: {
        Row: {
          art_path: string | null
          code: string | null
          color_hex: string | null
          created_at: string
          descriptor: string | null
          id: string
          kind: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          art_path?: string | null
          code?: string | null
          color_hex?: string | null
          created_at?: string
          descriptor?: string | null
          id?: string
          kind: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          art_path?: string | null
          code?: string | null
          color_hex?: string | null
          created_at?: string
          descriptor?: string | null
          id?: string
          kind?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_period: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          payment_method: string | null
          referral_code: string | null
          signup_path: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_period?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          payment_method?: string | null
          referral_code?: string | null
          signup_path?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_period?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          payment_method?: string | null
          referral_code?: string | null
          signup_path?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      training_call_events: {
        Row: {
          call_id: string
          created_at: string
          details: string | null
          event_type: string
          id: string
        }
        Insert: {
          call_id: string
          created_at?: string
          details?: string | null
          event_type: string
          id?: string
        }
        Update: {
          call_id?: string
          created_at?: string
          details?: string | null
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_call_events_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "training_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      training_call_invitees: {
        Row: {
          call_id: string
          email: string
          id: string
          invited_at: string
          name: string | null
          user_id: string | null
        }
        Insert: {
          call_id: string
          email: string
          id?: string
          invited_at?: string
          name?: string | null
          user_id?: string | null
        }
        Update: {
          call_id?: string
          email?: string
          id?: string
          invited_at?: string
          name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_call_invitees_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "training_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      training_calls: {
        Row: {
          cancelled: boolean | null
          created_at: string
          created_by: string
          description: string | null
          duration_minutes: number
          id: string
          parent_call_id: string | null
          recurrence_end_date: string | null
          recurrence_rule: string | null
          scheduled_at: string
          title: string
          updated_at: string
          zoom_link: string | null
        }
        Insert: {
          cancelled?: boolean | null
          created_at?: string
          created_by: string
          description?: string | null
          duration_minutes?: number
          id?: string
          parent_call_id?: string | null
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          scheduled_at: string
          title: string
          updated_at?: string
          zoom_link?: string | null
        }
        Update: {
          cancelled?: boolean | null
          created_at?: string
          created_by?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          parent_call_id?: string | null
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          scheduled_at?: string
          title?: string
          updated_at?: string
          zoom_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_calls_parent_call_id_fkey"
            columns: ["parent_call_id"]
            isOneToOne: false
            referencedRelation: "training_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      training_resources: {
        Row: {
          category: string
          created_at: string
          description: string | null
          file_name: string
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          resource_type: string
          storage_path: string
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          file_name: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          resource_type?: string
          storage_path: string
          title: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          resource_type?: string
          storage_path?: string
          title?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      zoom_recordings: {
        Row: {
          case_study_id: string
          created_at: string
          expires_at: string
          id: string
          label: string | null
          practitioner_id: string
          url: string
        }
        Insert: {
          case_study_id: string
          created_at?: string
          expires_at: string
          id?: string
          label?: string | null
          practitioner_id: string
          url: string
        }
        Update: {
          case_study_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          label?: string | null
          practitioner_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoom_recordings_case_study_id_fkey"
            columns: ["case_study_id"]
            isOneToOne: false
            referencedRelation: "case_studies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      client_subscription_summary: {
        Row: {
          billing_period: string | null
          current_period_end: string | null
          current_period_start: string | null
          status: Database["public"]["Enums"]["subscription_status"] | null
          tier: Database["public"]["Enums"]["subscription_tier"] | null
          user_id: string | null
        }
        Insert: {
          billing_period?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          tier?: Database["public"]["Enums"]["subscription_tier"] | null
          user_id?: string | null
        }
        Update: {
          billing_period?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          tier?: Database["public"]["Enums"]["subscription_tier"] | null
          user_id?: string | null
        }
        Relationships: []
      }
      practitioner_directory: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          first_name: string | null
          last_name: string | null
          practitioner_code: string | null
          practitioner_status:
            | Database["public"]["Enums"]["practitioner_status"]
            | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          display_name?: string | null
          first_name?: string | null
          last_name?: string | null
          practitioner_code?: string | null
          practitioner_status?:
            | Database["public"]["Enums"]["practitioner_status"]
            | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          display_name?: string | null
          first_name?: string | null
          last_name?: string | null
          practitioner_code?: string | null
          practitioner_status?:
            | Database["public"]["Enums"]["practitioner_status"]
            | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_game_invite: {
        Args: { _guest_name: string; _token: string }
        Returns: string
      }
      admin_reset_player_progress: {
        Args: { _user_id: string }
        Returns: undefined
      }
      approve_contact_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
      bump_bot_match_stats: {
        Args: { _difficulty: string; _perfect_eco?: boolean; _won: boolean }
        Returns: {
          difficulty: string
          draws: number
          last_played_at: string | null
          losses: number
          perfect_ecos: number
          updated_at: string
          user_id: string
          wins: number
        }
        SetofOptions: {
          from: "*"
          to: "bot_match_stats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bump_player_progress: {
        Args: {
          _elo_delta?: number
          _perfect_eco?: boolean
          _points_delta?: number
          _types_seen?: string[]
          _user_id: string
          _won?: boolean
        }
        Returns: {
          badges: string[]
          created_at: string
          current_streak: number
          elo: number
          last_played_at: string | null
          longest_streak: number
          perfect_ecosystems: number
          points: number
          types_seen: string[]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "player_progress"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bump_types_seen: { Args: { _types: string[] }; Returns: undefined }
      commit_move: {
        Args: {
          _actor: string
          _expected_seq: number
          _finished?: boolean
          _match_id: string
          _move: Json
          _new_state: Json
          _public_state: Json
          _winner?: string
        }
        Returns: Json
      }
      complete_profile: { Args: { _payload: Json }; Returns: undefined }
      compute_creator_of_the_month: {
        Args: { _for_date?: string }
        Returns: {
          anchor_year: number
          creator_type: string
          cycle_ends_at: string
          cycle_position: number
          cycle_started_at: string
          days_since_anchor: number
        }[]
      }
      compute_match_score: { Args: { _a: string; _b: string }; Returns: number }
      creator_type_code: {
        Args: { _lower: boolean; _type: string }
        Returns: string
      }
      creator_type_profile_exists_for: {
        Args: { _user_id: string }
        Returns: boolean
      }
      decline_contact_request: {
        Args: { _comment?: string; _request_id: string }
        Returns: undefined
      }
      finalise_ranked_match: { Args: { _match_id: string }; Returns: undefined }
      generate_invitation_code: { Args: never; Returns: string }
      generate_practitioner_code:
        | { Args: never; Returns: string }
        | { Args: { _first_name?: string }; Returns: string }
      get_creator_of_the_month: { Args: never; Returns: Json }
      get_enrollment_practitioner_options: {
        Args: { _practitioner_code?: string }
        Returns: {
          first_name: string
          last_name: string
          practitioner_code: string
          practitioner_status: Database["public"]["Enums"]["practitioner_status"]
          user_id: string
        }[]
      }
      get_incoming_contact_requests: {
        Args: never
        Returns: {
          created_at: string
          from_avatar_url: string
          from_display_name: string
          from_user_id: string
          id: string
          reason: string
          status: string
        }[]
      }
      get_inviting_practitioners_for_current_user: {
        Args: never
        Returns: {
          practitioner_id: string
        }[]
      }
      get_match_state: { Args: { _match_id: string }; Returns: Json }
      get_my_approved_contacts: {
        Args: never
        Returns: {
          approved_at: string
          channels: Json
          other_avatar_url: string
          other_display_name: string
          other_user_id: string
        }[]
      }
      get_my_top_matches: {
        Args: { _limit?: number }
        Returns: {
          avatar_url: string
          community_joined_at: string
          creator_types: Json
          display_name: string
          location_label: string
          location_lat: number
          location_lng: number
          score: number
          tier: Database["public"]["Enums"]["subscription_tier"]
          user_id: string
        }[]
      }
      get_outgoing_contact_requests: {
        Args: never
        Returns: {
          created_at: string
          decline_comment: string
          id: string
          reason: string
          responded_at: string
          revoked_at: string
          status: string
          to_avatar_url: string
          to_display_name: string
          to_user_id: string
        }[]
      }
      get_pending_request_count: { Args: never; Returns: number }
      get_public_member_profile: {
        Args: { _target_user_id: string }
        Returns: {
          avatar_url: string
          bio_intriguing: string
          bio_superpower: string
          bio_where_i_live: string
          community_joined_at: string
          creator_types: Json
          display_name: string
          enabled_channels: string[]
          location_label: string
          open_to_contact: boolean
          tier: Database["public"]["Enums"]["subscription_tier"]
          user_id: string
        }[]
      }
      get_public_player_stats: {
        Args: { _user_id: string }
        Returns: {
          current_streak: number
          display_name: string
          elo: number
          longest_streak: number
          points: number
          total_bot_losses: number
          total_bot_wins: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lookup_practitioner_by_code: {
        Args: { _code: string }
        Returns: {
          first_name: string
          last_name: string
        }[]
      }
      mark_invitation_link_clicked: {
        Args: { _token: string }
        Returns: undefined
      }
      recompute_match_scores_for_user: {
        Args: { _user_id: string }
        Returns: undefined
      }
      resolve_invitation_code: { Args: { _code: string }; Returns: string }
      revoke_contact_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
      send_contact_request: {
        Args: { _reason: string; _to_user_id: string }
        Returns: string
      }
      update_creator_of_the_month: { Args: never; Returns: Json }
      withdraw_contact_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "trainer"
        | "practitioner"
        | "trainee"
        | "client"
        | "community_participant"
        | "gamer"
        | "admin"
      assessment_type: "quiz" | "test" | "practical"
      case_study_status:
        | "draft"
        | "profiling_submitted"
        | "submitted"
        | "approved"
        | "revision_requested"
      content_type: "video" | "text" | "audio" | "photo"
      enrollment_step:
        | "plan_selected"
        | "signed_up"
        | "payment_complete"
        | "photos_uploaded"
        | "booking_made"
        | "awaiting_profiling"
        | "complete"
      match_mode: "solo" | "pvp"
      match_status: "waiting" | "active" | "finished"
      order_status:
        | "pending"
        | "paid"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "refunded"
      practitioner_status: "in_progress" | "paused" | "cancelled" | "certified"
      product_type: "physical" | "digital"
      subscription_status:
        | "active"
        | "past_due"
        | "canceled"
        | "trialing"
        | "incomplete"
      subscription_tier: "wren" | "robin" | "cockatoo" | "owl"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "trainer",
        "practitioner",
        "trainee",
        "client",
        "community_participant",
        "gamer",
        "admin",
      ],
      assessment_type: ["quiz", "test", "practical"],
      case_study_status: [
        "draft",
        "profiling_submitted",
        "submitted",
        "approved",
        "revision_requested",
      ],
      content_type: ["video", "text", "audio", "photo"],
      enrollment_step: [
        "plan_selected",
        "signed_up",
        "payment_complete",
        "photos_uploaded",
        "booking_made",
        "awaiting_profiling",
        "complete",
      ],
      match_mode: ["solo", "pvp"],
      match_status: ["waiting", "active", "finished"],
      order_status: [
        "pending",
        "paid",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
      practitioner_status: ["in_progress", "paused", "cancelled", "certified"],
      product_type: ["physical", "digital"],
      subscription_status: [
        "active",
        "past_due",
        "canceled",
        "trialing",
        "incomplete",
      ],
      subscription_tier: ["wren", "robin", "cockatoo", "owl"],
    },
  },
} as const
