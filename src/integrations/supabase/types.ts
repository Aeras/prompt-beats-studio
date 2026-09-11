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
      ai_generation_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          dismissed_at: string | null
          error: string | null
          generation_id: string | null
          id: string
          idempotency_key: string
          input_payload: Json
          model: string | null
          provider: string | null
          result: Json | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          error?: string | null
          generation_id?: string | null
          id?: string
          idempotency_key: string
          input_payload: Json
          model?: string | null
          provider?: string | null
          result?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          error?: string | null
          generation_id?: string | null
          id?: string
          idempotency_key?: string
          input_payload?: Json
          model?: string | null
          provider?: string | null
          result?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_generations: {
        Row: {
          created_at: string
          id: string
          quality_check_key: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          quality_check_key?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          quality_check_key?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_quality_check_actions: {
        Row: {
          consumed_generation_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          quality_report: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          consumed_generation_id?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          quality_report?: Json | null
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          consumed_generation_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          quality_report?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_quality_check_actions_consumed_generation_id_fkey"
            columns: ["consumed_generation_id"]
            isOneToOne: false
            referencedRelation: "ai_generations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          created_at: string
          estimated_cost_usd: number | null
          generation_id: string | null
          id: string
          input_tokens: number | null
          model: string
          operation: string
          output_tokens: number | null
          provider: string
          success: boolean
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          estimated_cost_usd?: number | null
          generation_id?: string | null
          id?: string
          input_tokens?: number | null
          model: string
          operation: string
          output_tokens?: number | null
          provider: string
          success?: boolean
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          estimated_cost_usd?: number | null
          generation_id?: string | null
          id?: string
          input_tokens?: number | null
          model?: string
          operation?: string
          output_tokens?: number | null
          provider?: string
          success?: boolean
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          admin_user_id: string | null
          created_at: string
          details: Json
          id: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      user_model_access: {
        Row: {
          access_mode: string
          allowed_models: string[]
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_mode?: string
          allowed_models?: string[]
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_mode?: string
          allowed_models?: string[]
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
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
      likes: {
        Row: {
          created_at: string
          id: string
          track_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          track_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          track_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_private: {
        Row: {
          created_at: string
          is_banned: boolean
          updated_at: string
          user_id: string
          welcome_email_sent_at: string | null
        }
        Insert: {
          created_at?: string
          is_banned?: boolean
          updated_at?: string
          user_id: string
          welcome_email_sent_at?: string | null
        }
        Update: {
          created_at?: string
          is_banned?: boolean
          updated_at?: string
          user_id?: string
          welcome_email_sent_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          artist_alias: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          donation_custom_name: string | null
          donation_provider: string | null
          donation_url: string | null
          handle: string
          id: string
          instagram_url: string | null
          profile_completed: boolean
          tiktok_url: string | null
          updated_at: string
          website_url: string | null
          x_url: string | null
          youtube_url: string | null
        }
        Insert: {
          artist_alias?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          donation_custom_name?: string | null
          donation_provider?: string | null
          donation_url?: string | null
          handle: string
          id: string
          instagram_url?: string | null
          profile_completed?: boolean
          tiktok_url?: string | null
          updated_at?: string
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          artist_alias?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          donation_custom_name?: string | null
          donation_provider?: string | null
          donation_url?: string | null
          handle?: string
          id?: string
          instagram_url?: string | null
          profile_completed?: boolean
          tiktok_url?: string | null
          updated_at?: string
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      saved_prompts: {
        Row: {
          created_at: string
          genre: string
          id: string
          language: string
          lyrics: string
          mood: string
          note: string
          tags: string
          theme: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          genre?: string
          id?: string
          language?: string
          lyrics?: string
          mood?: string
          note?: string
          tags?: string
          theme?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          genre?: string
          id?: string
          language?: string
          lyrics?: string
          mood?: string
          note?: string
          tags?: string
          theme?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tracks: {
        Row: {
          art_url: string | null
          audio_key: string | null
          audio_type: string
          audio_url: string
          cover_url: string | null
          created_at: string
          duration_seconds: number | null
          genre: string
          id: string
          is_published: boolean
          lyrics: string
          plays: number
          prompt: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          art_url?: string | null
          audio_key?: string | null
          audio_type?: string
          audio_url: string
          cover_url?: string | null
          created_at?: string
          duration_seconds?: number | null
          genre?: string
          id?: string
          is_published?: boolean
          lyrics?: string
          plays?: number
          prompt?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          art_url?: string | null
          audio_key?: string | null
          audio_type?: string
          audio_url?: string
          cover_url?: string | null
          created_at?: string
          duration_seconds?: number | null
          genre?: string
          id?: string
          is_published?: boolean
          lyrics?: string
          plays?: number
          prompt?: string
          title?: string
          updated_at?: string
          user_id?: string
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
    }
    Views: {
      public_profiles: {
        Row: {
          artist_alias: string | null
          avatar_url: string | null
          bio: string | null
          display_name: string | null
          donation_custom_name: string | null
          donation_provider: string | null
          donation_url: string | null
          handle: string | null
          id: string | null
          instagram_url: string | null
          tiktok_url: string | null
          website_url: string | null
          x_url: string | null
          youtube_url: string | null
        }
        Insert: {
          artist_alias?: string | null
          avatar_url?: string | null
          bio?: string | null
          display_name?: string | null
          donation_custom_name?: string | null
          donation_provider?: string | null
          donation_url?: string | null
          handle?: string | null
          id?: string | null
          instagram_url?: string | null
          tiktok_url?: string | null
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          artist_alias?: string | null
          avatar_url?: string | null
          bio?: string | null
          display_name?: string | null
          donation_custom_name?: string | null
          donation_provider?: string | null
          donation_url?: string | null
          handle?: string | null
          id?: string | null
          instagram_url?: string | null
          tiktok_url?: string | null
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      track_like_counts: {
        Row: {
          like_count: number | null
          track_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "likes_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_list_users: {
        Args: { _limit?: number; _offset?: number; _search?: string; _status?: string }
        Returns: Json
      }
      admin_overview: { Args: never; Returns: Json }
      admin_set_model_access: {
        Args: { _access_mode: string; _allowed_models: string[]; _target_user_id: string }
        Returns: undefined
      }
      admin_set_user_banned: {
        Args: { _banned: boolean; _target_user_id: string }
        Returns: undefined
      }
      admin_user_detail: { Args: { _target_user_id: string }; Returns: Json }
      claim_quality_check: { Args: { _idempotency_key: string }; Returns: Json }
      consume_quality_check: {
        Args: { _idempotency_key: string; _quality_report: Json }
        Returns: string
      }
      dismiss_generation_job: { Args: { _job_id: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_banned: { Args: { _user_id: string }; Returns: boolean }
      kick_generation_runner: { Args: { _job_id: string }; Returns: undefined }
      like_count: { Args: { _track_id: string }; Returns: number }
      release_quality_check: {
        Args: { _idempotency_key: string }
        Returns: undefined
      }
      set_user_banned: {
        Args: { _banned: boolean; _user_id: string }
        Returns: undefined
      }
      start_generation_job: {
        Args: { _idempotency_key: string; _input: Json }
        Returns: Json
      }
      sweep_generation_jobs: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
