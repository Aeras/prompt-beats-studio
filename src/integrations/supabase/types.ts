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
      account_storage_cleanup: {
        Row: {
          attempt_count: number
          bucket: string | null
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          object_path: string
          owner_id: string
          status: string
          storage_kind: string
        }
        Insert: {
          attempt_count?: number
          bucket?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          object_path: string
          owner_id: string
          status?: string
          storage_kind: string
        }
        Update: {
          attempt_count?: number
          bucket?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          object_path?: string
          owner_id?: string
          status?: string
          storage_kind?: string
        }
        Relationships: []
      }
      admin_account_deletion_operations: {
        Row: {
          actor_id: string | null
          created_at: string
          expires_at: string
          id: string
          target_user_id: string
          used_at: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          target_user_id: string
          used_at?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          target_user_id?: string
          used_at?: string | null
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
          provider_started_at: string | null
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
          provider_started_at?: string | null
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
          provider_started_at?: string | null
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
          completed_at: string | null
          consumed_generation_id: string | null
          created_at: string
          error: string | null
          id: string
          idempotency_key: string
          input_payload: Json | null
          model: string | null
          provider: string | null
          provider_started_at: string | null
          quality_report: Json | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          consumed_generation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key: string
          input_payload?: Json | null
          model?: string | null
          provider?: string | null
          provider_started_at?: string | null
          quality_report?: Json | null
          started_at?: string | null
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          consumed_generation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string
          input_payload?: Json | null
          model?: string | null
          provider?: string | null
          provider_started_at?: string | null
          quality_report?: Json | null
          started_at?: string | null
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
          block_reason_code: string | null
          block_reason_text: string | null
          blocked_at: string | null
          blocked_by: string | null
          created_at: string
          is_banned: boolean
          updated_at: string
          user_id: string
          welcome_email_sent_at: string | null
        }
        Insert: {
          block_reason_code?: string | null
          block_reason_text?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string
          is_banned?: boolean
          updated_at?: string
          user_id: string
          welcome_email_sent_at?: string | null
        }
        Update: {
          block_reason_code?: string | null
          block_reason_text?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
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
      public_staff_badges: {
        Row: {
          badge: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          badge?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          badge?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_staff_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_staff_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_blocks: {
        Row: {
          blocked_at: string
          blocked_by: string | null
          email_normalized: string
          id: string
          reason_code: string
          reason_text: string | null
        }
        Insert: {
          blocked_at?: string
          blocked_by?: string | null
          email_normalized: string
          id?: string
          reason_code: string
          reason_text?: string | null
        }
        Update: {
          blocked_at?: string
          blocked_by?: string | null
          email_normalized?: string
          id?: string
          reason_code?: string
          reason_text?: string | null
        }
        Relationships: []
      }
      prompt_projects: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      song_analyses: {
        Row: {
          created_at: string
          detailed_analysis: Json
          generator_ready: Json
          id: string
          model: string
          name: string
          project_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          detailed_analysis: Json
          generator_ready: Json
          id?: string
          model: string
          name: string
          project_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          detailed_analysis?: Json
          generator_ready?: Json
          id?: string
          model?: string
          name?: string
          project_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_analyses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "prompt_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_prompts: {
        Row: {
          custom_name: string | null
          project_id: string | null
          version_label: string | null
          version_number: number | null
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
          custom_name?: string | null
          project_id?: string | null
          version_label?: string | null
          version_number?: number | null
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
          custom_name?: string | null
          project_id?: string | null
          version_label?: string | null
          version_number?: number | null
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
        Relationships: [
          {
            foreignKeyName: "saved_prompts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "prompt_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          event_type: string
          outcome: string
          processed_at: string | null
          received_at: string
          stripe_created_at: number
          stripe_event_id: string
        }
        Insert: {
          event_type: string
          outcome?: string
          processed_at?: string | null
          received_at?: string
          stripe_created_at: number
          stripe_event_id: string
        }
        Update: {
          event_type?: string
          outcome?: string
          processed_at?: string | null
          received_at?: string
          stripe_created_at?: number
          stripe_event_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          last_stripe_event_created_at: number | null
          last_stripe_event_id: string | null
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          last_stripe_event_created_at?: number | null
          last_stripe_event_id?: string | null
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          last_stripe_event_created_at?: number | null
          last_stripe_event_id?: string | null
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      track_audio_cleanup_locks: {
        Row: {
          audio_key: string
          cleanup_id: string
          created_at: string
        }
        Insert: {
          audio_key: string
          cleanup_id: string
          created_at?: string
        }
        Update: {
          audio_key?: string
          cleanup_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_audio_cleanup_locks_cleanup_id_fkey"
            columns: ["cleanup_id"]
            isOneToOne: false
            referencedRelation: "track_storage_cleanup"
            referencedColumns: ["id"]
          },
        ]
      }
      track_cover_cleanup_locks: {
        Row: {
          cleanup_id: string
          cover_path: string
          created_at: string
        }
        Insert: {
          cleanup_id: string
          cover_path: string
          created_at?: string
        }
        Update: {
          cleanup_id?: string
          cover_path?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_cover_cleanup_locks_cleanup_id_fkey"
            columns: ["cleanup_id"]
            isOneToOne: false
            referencedRelation: "track_storage_cleanup"
            referencedColumns: ["id"]
          },
        ]
      }
      track_play_throttles: {
        Row: {
          last_counted_at: string
          listener_user_id: string
          track_id: string
        }
        Insert: {
          last_counted_at?: string
          listener_user_id: string
          track_id: string
        }
        Update: {
          last_counted_at?: string
          listener_user_id?: string
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_play_throttles_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_storage_cleanup: {
        Row: {
          attempt_count: number
          audio_key: string | null
          cleanup_type: string
          completed_at: string | null
          cover_path: string | null
          created_at: string
          created_by: string | null
          id: string
          last_error: string | null
          owner_id: string | null
          status: string
          track_id: string | null
        }
        Insert: {
          attempt_count?: number
          audio_key?: string | null
          cleanup_type?: string
          completed_at?: string | null
          cover_path?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          owner_id?: string | null
          status?: string
          track_id?: string | null
        }
        Update: {
          attempt_count?: number
          audio_key?: string | null
          cleanup_type?: string
          completed_at?: string | null
          cover_path?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          owner_id?: string | null
          status?: string
          track_id?: string | null
        }
        Relationships: []
      }
      track_upload_admission: {
        Row: {
          request_count: number
          user_id: string
          window_started_at: string
        }
        Insert: {
          request_count?: number
          user_id: string
          window_started_at?: string
        }
        Update: {
          request_count?: number
          user_id?: string
          window_started_at?: string
        }
        Relationships: []
      }
      tracks: {
        Row: {
          allow_download: boolean
          art_url: string | null
          audio_key: string | null
          audio_type: string
          audio_url: string
          cover_url: string | null
          created_at: string
          created_with: string | null
          duration_seconds: number | null
          genre: string
          id: string
          is_published: boolean
          lyrics: string
          moderation_locked_at: string | null
          moderation_locked_by: string | null
          moderation_reason_code: string | null
          moderation_reason_text: string | null
          moderation_status: string
          plays: number
          prompt: string
          source_id: string | null
          source_type: string
          source_url: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_download?: boolean
          art_url?: string | null
          audio_key?: string | null
          audio_type?: string
          audio_url: string
          cover_url?: string | null
          created_at?: string
          created_with?: string | null
          duration_seconds?: number | null
          genre?: string
          id?: string
          is_published?: boolean
          lyrics?: string
          moderation_locked_at?: string | null
          moderation_locked_by?: string | null
          moderation_reason_code?: string | null
          moderation_reason_text?: string | null
          moderation_status?: string
          plays?: number
          prompt?: string
          source_id?: string | null
          source_type?: string
          source_url?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_download?: boolean
          art_url?: string | null
          audio_key?: string | null
          audio_type?: string
          audio_url?: string
          cover_url?: string | null
          created_at?: string
          created_with?: string | null
          duration_seconds?: number | null
          genre?: string
          id?: string
          is_published?: boolean
          lyrics?: string
          moderation_locked_at?: string | null
          moderation_locked_by?: string | null
          moderation_reason_code?: string | null
          moderation_reason_text?: string | null
          moderation_status?: string
          plays?: number
          prompt?: string
          source_id?: string | null
          source_type?: string
          source_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
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
      user_roles: {
        Row: {
          created_at: string
          id: string
          moderation_status: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          moderation_status?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          moderation_status?: string
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
          handle: string | null
          id: string | null
          instagram_url: string | null
          staff_badge: string | null
          tiktok_url: string | null
          website_url: string | null
          x_url: string | null
          youtube_url: string | null
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
      _has_role_internal: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      _is_banned_internal: { Args: { _user_id: string }; Returns: boolean }
      _lock_user_security_pair: {
        Args: { _first: string; _second: string }
        Returns: undefined
      }
      _lock_user_security_state: {
        Args: { _user_id: string }
        Returns: undefined
      }
      admin_begin_account_deletion: {
        Args: { _target_user_id: string }
        Returns: string
      }
      admin_create_registration_block: {
        Args: { _email: string; _reason_code: string; _reason_text?: string }
        Returns: string
      }
      admin_list_registration_blocks: {
        Args: { _limit?: number; _offset?: number; _search?: string }
        Returns: Json
      }
      admin_list_users: {
        Args: {
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string
        }
        Returns: Json
      }
      admin_overview: { Args: never; Returns: Json }
      admin_remove_registration_block: {
        Args: { _block_id: string }
        Returns: undefined
      }
      admin_set_model_access: {
        Args: {
          _access_mode: string
          _allowed_models: string[]
          _target_user_id: string
        }
        Returns: undefined
      }
      admin_set_moderation_status: {
        Args: {
          _reason_text?: string
          _status: string
          _target_user_id: string
        }
        Returns: undefined
      }
      admin_set_user_banned: {
        Args: {
          _banned: boolean
          _reason_code?: string
          _reason_text?: string
          _target_user_id: string
        }
        Returns: undefined
      }
      admin_set_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _target_user_id: string
        }
        Returns: undefined
      }
      admin_user_detail: { Args: { _target_user_id: string }; Returns: Json }
      admit_track_upload: { Args: never; Returns: boolean }
      can_manage_track_storage_cleanup: {
        Args: { _cleanup_id: string }
        Returns: boolean
      }
      can_moderate_target: {
        Args: { _target_user_id: string }
        Returns: boolean
      }
      capture_track_storage_cleanup: {
        Args: {
          _audio_key: string
          _cover_url: string
          _created_by: string
          _owner_id: string
          _track_id: string
        }
        Returns: Json
      }
      claim_quality_check: { Args: { _idempotency_key: string }; Returns: Json }
      consume_admin_account_deletion: {
        Args: { _operation_id: string }
        Returns: string
      }
      consume_quality_check: {
        Args: {
          _idempotency_key: string
          _model: string
          _provider: string
          _quality_report: Json
        }
        Returns: string
      }
      current_user_has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      current_user_is_banned: { Args: never; Returns: boolean }
      delete_track_with_cleanup: { Args: { _track_id: string }; Returns: Json }
      dismiss_generation_job: { Args: { _job_id: string }; Returns: string }
      edit_track_with_cleanup: {
        Args: {
          _created_with?: string
          _genre: string
          _is_published: boolean
          _lyrics: string
          _new_audio_key?: string
          _new_audio_url?: string
          _new_cover_url?: string
          _prompt: string
          _source_id?: string
          _source_type: string
          _source_url?: string
          _title: string
          _track_id: string
        }
        Returns: Json
      }
      finalize_quality_check_job: {
        Args: { _action_id: string }
        Returns: string
      }
      get_latest_quality_check_job: {
        Args: { _generation_id: string }
        Returns: Json
      }
      get_my_account_status: { Args: never; Returns: Json }
      get_my_moderation_context: { Args: never; Returns: Json }
      get_quality_check_job: { Args: { _action_id: string }; Returns: Json }
      has_moderation_capability: {
        Args: { _capability: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_valid_account_state: { Args: { _user_id: string }; Returns: boolean }
      increment_track_play: { Args: { _track_id: string }; Returns: number }
      is_banned: { Args: { _user_id: string }; Returns: boolean }
      is_safe_track_storage_path: {
        Args: { _path: string; _prefix: string }
        Returns: boolean
      }
      kick_generation_runner: { Args: { _job_id: string }; Returns: undefined }
      kick_quality_check_runner: {
        Args: { _action_id: string }
        Returns: undefined
      }
      like_count: { Args: { _track_id: string }; Returns: number }
      list_trending_tracks: {
        Args: never
        Returns: {
          allow_download: boolean
          art_url: string
          audio_type: string
          audio_url: string
          cover_url: string
          created_at: string
          created_with: string
          duration_seconds: number
          genre: string
          id: string
          is_published: boolean
          likes: number
          lyrics: string
          plays: number
          prompt: string
          source_id: string
          source_type: string
          source_url: string
          title: string
          user_id: string
        }[]
      }
      mark_quality_check_provider_started: {
        Args: { _idempotency_key: string }
        Returns: undefined
      }
      normalize_registration_email: {
        Args: { _email: string }
        Returns: string
      }
      process_stripe_subscription_event: {
        Args: {
          _approved_pro_price_id: string
          _current_period_end: string
          _customer_id: string
          _event_created: number
          _event_id: string
          _event_type: string
          _price_id: string
          _subscription_id: string
          _subscription_status: string
        }
        Returns: string
      }
      reconcile_provider_committed_generation: {
        Args: { _job_id: string }
        Returns: boolean
      }
      reconcile_provider_committed_quality: {
        Args: { _action_id: string }
        Returns: boolean
      }
      refresh_public_staff_badge: {
        Args: { _user_id: string }
        Returns: undefined
      }
      release_quality_check: {
        Args: { _idempotency_key: string }
        Returns: undefined
      }
      replace_track_with_audio_cleanup: {
        Args: {
          _audio_key: string
          _audio_type: string
          _audio_url: string
          _genre: string
          _is_published: boolean
          _lyrics: string
          _prompt: string
          _title: string
          _track_id: string
        }
        Returns: Json
      }
      set_user_banned: {
        Args: { _banned: boolean; _user_id: string }
        Returns: undefined
      }
      staff_complete_track_storage_cleanup: {
        Args: { _cleanup_id: string }
        Returns: undefined
      }
      staff_delete_track: { Args: { _track_id: string }; Returns: Json }
      staff_fail_track_storage_cleanup: {
        Args: { _cleanup_id: string; _error: string }
        Returns: undefined
      }
      staff_get_track: { Args: { _track_id: string }; Returns: Json }
      staff_get_track_storage_cleanup: {
        Args: { _cleanup_id: string }
        Returns: Json
      }
      staff_lock_track: {
        Args: { _reason_code: string; _reason_text?: string; _track_id: string }
        Returns: Json
      }
      staff_unlock_track: { Args: { _track_id: string }; Returns: Json }
      start_generation_job: {
        Args: { _idempotency_key: string; _input: Json }
        Returns: Json
      }
      start_quality_check_job: {
        Args: { _idempotency_key: string; _input: Json }
        Returns: Json
      }
      sweep_generation_jobs: { Args: never; Returns: number }
      track_cover_path: { Args: { _cover_url: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "senior_moderator"
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
      app_role: ["admin", "moderator", "user", "senior_moderator"],
    },
  },
} as const
