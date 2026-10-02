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
      ai_auxiliary_admissions: {
        Row: {
          created_at: string
          id: string
          operation: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          operation: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          operation?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_auxiliary_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          execution_token: string | null
          id: string
          operation: string
          provider_started_at: string | null
          request_key: string
          result: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          execution_token?: string | null
          id?: string
          operation: string
          provider_started_at?: string | null
          request_key: string
          result?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          execution_token?: string | null
          id?: string
          operation?: string
          provider_started_at?: string | null
          request_key?: string
          result?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
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
      ai_models: {
        Row: {
          access_policy: string
          cache_write_price_per_million: number | null
          cached_input_price_per_million: number | null
          context_window: number | null
          created_at: string
          deprecated: boolean
          discovered_at: string | null
          display_name: string
          generator_compatible: boolean
          generator_enabled: boolean
          generator_reasoning_effort: string | null
          health_status: string
          id: string
          input_price_per_million: number | null
          last_checked_at: string | null
          last_error_code: string | null
          last_failure_at: string | null
          last_success_at: string | null
          max_output_tokens: number | null
          notes: string | null
          output_price_per_million: number | null
          preview: boolean
          pricing_checked_at: string | null
          pricing_currency: string
          pricing_source: string | null
          pricing_source_url: string | null
          pricing_status: string
          pricing_updated_at: string | null
          provider: string
          provider_model_id: string
          quality_check_compatible: boolean
          quality_check_enabled: boolean
          quality_check_reasoning_effort: string | null
          reasoning_supported: boolean | null
          retirement_date: string | null
          status: string
          structured_output_supported: boolean | null
          updated_at: string
          usage_reporting_supported: boolean | null
        }
        Insert: {
          access_policy?: string
          cache_write_price_per_million?: number | null
          cached_input_price_per_million?: number | null
          context_window?: number | null
          created_at?: string
          deprecated?: boolean
          discovered_at?: string | null
          display_name: string
          generator_compatible?: boolean
          generator_enabled?: boolean
          generator_reasoning_effort?: string | null
          health_status?: string
          id?: string
          input_price_per_million?: number | null
          last_checked_at?: string | null
          last_error_code?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          max_output_tokens?: number | null
          notes?: string | null
          output_price_per_million?: number | null
          preview?: boolean
          pricing_checked_at?: string | null
          pricing_currency?: string
          pricing_source?: string | null
          pricing_source_url?: string | null
          pricing_status?: string
          pricing_updated_at?: string | null
          provider: string
          provider_model_id: string
          quality_check_compatible?: boolean
          quality_check_enabled?: boolean
          quality_check_reasoning_effort?: string | null
          reasoning_supported?: boolean | null
          retirement_date?: string | null
          status?: string
          structured_output_supported?: boolean | null
          updated_at?: string
          usage_reporting_supported?: boolean | null
        }
        Update: {
          access_policy?: string
          cache_write_price_per_million?: number | null
          cached_input_price_per_million?: number | null
          context_window?: number | null
          created_at?: string
          deprecated?: boolean
          discovered_at?: string | null
          display_name?: string
          generator_compatible?: boolean
          generator_enabled?: boolean
          generator_reasoning_effort?: string | null
          health_status?: string
          id?: string
          input_price_per_million?: number | null
          last_checked_at?: string | null
          last_error_code?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          max_output_tokens?: number | null
          notes?: string | null
          output_price_per_million?: number | null
          preview?: boolean
          pricing_checked_at?: string | null
          pricing_currency?: string
          pricing_source?: string | null
          pricing_source_url?: string | null
          pricing_status?: string
          pricing_updated_at?: string | null
          provider?: string
          provider_model_id?: string
          quality_check_compatible?: boolean
          quality_check_enabled?: boolean
          quality_check_reasoning_effort?: string | null
          reasoning_supported?: boolean | null
          retirement_date?: string | null
          status?: string
          structured_output_supported?: boolean | null
          updated_at?: string
          usage_reporting_supported?: boolean | null
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
          cache_write_tokens: number | null
          cached_input_tokens: number | null
          cost_calculated_at: string | null
          cost_status: string | null
          created_at: string
          estimated_cost_usd: number | null
          generation_id: string | null
          id: string
          input_tokens: number | null
          model: string
          operation: string
          output_tokens: number | null
          pricing_status_at_recording: string | null
          provider: string
          success: boolean
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          cache_write_tokens?: number | null
          cached_input_tokens?: number | null
          cost_calculated_at?: string | null
          cost_status?: string | null
          created_at?: string
          estimated_cost_usd?: number | null
          generation_id?: string | null
          id?: string
          input_tokens?: number | null
          model: string
          operation: string
          output_tokens?: number | null
          pricing_status_at_recording?: string | null
          provider: string
          success?: boolean
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          cache_write_tokens?: number | null
          cached_input_tokens?: number | null
          cost_calculated_at?: string | null
          cost_status?: string | null
          created_at?: string
          estimated_cost_usd?: number | null
          generation_id?: string | null
          id?: string
          input_tokens?: number | null
          model?: string
          operation?: string
          output_tokens?: number | null
          pricing_status_at_recording?: string | null
          provider?: string
          success?: boolean
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_usage_outbox: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload: Json
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          updated_at?: string
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
      contact_rate_admissions: {
        Row: {
          created_at: string
          email_hash: string
          id: string
          network_hash: string
        }
        Insert: {
          created_at?: string
          email_hash: string
          id?: string
          network_hash: string
        }
        Update: {
          created_at?: string
          email_hash?: string
          id?: string
          network_hash?: string
        }
        Relationships: []
      }
      content_reports: {
        Row: {
          category: string
          created_at: string
          details: string | null
          id: string
          moderator_notes: string | null
          reporter_user_id: string | null
          resolution: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          supporting_url: string | null
          target_id: string
          target_owner_id: string | null
          target_title: string
          target_type: string
        }
        Insert: {
          category: string
          created_at?: string
          details?: string | null
          id?: string
          moderator_notes?: string | null
          reporter_user_id?: string | null
          resolution?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          supporting_url?: string | null
          target_id: string
          target_owner_id?: string | null
          target_title: string
          target_type: string
        }
        Update: {
          category?: string
          created_at?: string
          details?: string | null
          id?: string
          moderator_notes?: string | null
          reporter_user_id?: string | null
          resolution?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          supporting_url?: string | null
          target_id?: string
          target_owner_id?: string | null
          target_title?: string
          target_type?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          track_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          track_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          track_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_access_policies: {
        Row: {
          access_mode: string
          description: string
          display_name: string
          feature_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          access_mode?: string
          description?: string
          display_name: string
          feature_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          access_mode?: string
          description?: string
          display_name?: string
          feature_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      feature_access_users: {
        Row: {
          created_at: string
          created_by: string | null
          feature_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          feature_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          feature_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_access_users_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "feature_access_policies"
            referencedColumns: ["feature_key"]
          },
        ]
      }
      inspiration_wall_cards: {
        Row: {
          artistic_layout: Json
          body: string | null
          color_value: string | null
          created_at: string
          id: string
          image_object_key: string | null
          is_pinned: boolean
          sort_order: number
          structured_layout: Json
          title: string | null
          type: string
          updated_at: string
          wall_id: string
        }
        Insert: {
          artistic_layout?: Json
          body?: string | null
          color_value?: string | null
          created_at?: string
          id?: string
          image_object_key?: string | null
          is_pinned?: boolean
          sort_order?: number
          structured_layout?: Json
          title?: string | null
          type: string
          updated_at?: string
          wall_id: string
        }
        Update: {
          artistic_layout?: Json
          body?: string | null
          color_value?: string | null
          created_at?: string
          id?: string
          image_object_key?: string | null
          is_pinned?: boolean
          sort_order?: number
          structured_layout?: Json
          title?: string | null
          type?: string
          updated_at?: string
          wall_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspiration_wall_cards_wall_id_fkey"
            columns: ["wall_id"]
            isOneToOne: false
            referencedRelation: "inspiration_walls"
            referencedColumns: ["id"]
          },
        ]
      }
      inspiration_wall_track_links: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          owner_id: string
          track_id: string
          wall_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          owner_id: string
          track_id: string
          wall_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          owner_id?: string
          track_id?: string
          wall_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspiration_wall_track_links_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspiration_wall_track_links_wall_id_fkey"
            columns: ["wall_id"]
            isOneToOne: false
            referencedRelation: "inspiration_walls"
            referencedColumns: ["id"]
          },
        ]
      }
      inspiration_walls: {
        Row: {
          connected_project_id: string | null
          created_at: string
          creative_direction: Json | null
          creative_updated_at: string
          description: string | null
          id: string
          owner_id: string
          selected_theme: string
          title: string
          universe_id: string | null
          updated_at: string
        }
        Insert: {
          connected_project_id?: string | null
          created_at?: string
          creative_direction?: Json | null
          creative_updated_at?: string
          description?: string | null
          id?: string
          owner_id: string
          selected_theme?: string
          title: string
          universe_id?: string | null
          updated_at?: string
        }
        Update: {
          connected_project_id?: string | null
          created_at?: string
          creative_direction?: Json | null
          creative_updated_at?: string
          description?: string | null
          id?: string
          owner_id?: string
          selected_theme?: string
          title?: string
          universe_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspiration_walls_connected_project_id_fkey"
            columns: ["connected_project_id"]
            isOneToOne: false
            referencedRelation: "prompt_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspiration_walls_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "song_universes"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_acceptances: {
        Row: {
          acceptance_type: string
          accepted_at: string
          document_key: string
          id: string
          locale: string | null
          source: string
          user_id: string
          version: string
        }
        Insert: {
          acceptance_type: string
          accepted_at?: string
          document_key: string
          id?: string
          locale?: string | null
          source?: string
          user_id: string
          version: string
        }
        Update: {
          acceptance_type?: string
          accepted_at?: string
          document_key?: string
          id?: string
          locale?: string | null
          source?: string
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      library_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_folder_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_folder_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_folder_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_folders_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "library_folders"
            referencedColumns: ["id"]
          },
        ]
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
      moderation_case_appeals: {
        Row: {
          admin_action_summary: string | null
          admin_proposed_at: string | null
          admin_proposed_by: string | null
          admin_proposed_outcome: string | null
          admin_proposed_reason: string | null
          appellant_user_id: string | null
          case_id: string
          final_action_summary: string | null
          final_outcome: string | null
          final_reason: string | null
          finalized_at: string | null
          id: string
          statement: string
          status: string
          submitted_at: string
          super_admin_action: string | null
          super_admin_at: string | null
          super_admin_by: string | null
        }
        Insert: {
          admin_action_summary?: string | null
          admin_proposed_at?: string | null
          admin_proposed_by?: string | null
          admin_proposed_outcome?: string | null
          admin_proposed_reason?: string | null
          appellant_user_id?: string | null
          case_id: string
          final_action_summary?: string | null
          final_outcome?: string | null
          final_reason?: string | null
          finalized_at?: string | null
          id?: string
          statement: string
          status?: string
          submitted_at?: string
          super_admin_action?: string | null
          super_admin_at?: string | null
          super_admin_by?: string | null
        }
        Update: {
          admin_action_summary?: string | null
          admin_proposed_at?: string | null
          admin_proposed_by?: string | null
          admin_proposed_outcome?: string | null
          admin_proposed_reason?: string | null
          appellant_user_id?: string | null
          case_id?: string
          final_action_summary?: string | null
          final_outcome?: string | null
          final_reason?: string | null
          finalized_at?: string | null
          id?: string
          statement?: string
          status?: string
          submitted_at?: string
          super_admin_action?: string | null
          super_admin_at?: string | null
          super_admin_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_case_appeals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "moderation_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_case_events: {
        Row: {
          actor_role: string | null
          actor_user_id: string | null
          case_id: string
          created_at: string
          creator_visible: boolean
          event_type: string
          id: string
          payload: Json
        }
        Insert: {
          actor_role?: string | null
          actor_user_id?: string | null
          case_id: string
          created_at?: string
          creator_visible?: boolean
          event_type: string
          id?: string
          payload?: Json
        }
        Update: {
          actor_role?: string | null
          actor_user_id?: string | null
          case_id?: string
          created_at?: string
          creator_visible?: boolean
          event_type?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "moderation_case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "moderation_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_case_messages: {
        Row: {
          body: string
          case_id: string
          created_at: string
          id: string
          message_type: string
          sender_side: string
          sender_user_id: string | null
        }
        Insert: {
          body: string
          case_id: string
          created_at?: string
          id?: string
          message_type?: string
          sender_side: string
          sender_user_id?: string | null
        }
        Update: {
          body?: string
          case_id?: string
          created_at?: string
          id?: string
          message_type?: string
          sender_side?: string
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_case_messages_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "moderation_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_case_notes: {
        Row: {
          author_user_id: string | null
          body: string
          case_id: string
          created_at: string
          id: string
        }
        Insert: {
          author_user_id?: string | null
          body: string
          case_id: string
          created_at?: string
          id?: string
        }
        Update: {
          author_user_id?: string | null
          body?: string
          case_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_case_notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "moderation_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_case_reads: {
        Row: {
          case_id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          case_id: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          case_id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_case_reads_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "moderation_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_cases: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          closed_at: string | null
          created_at: string
          id: string
          initial_action_summary: string | null
          initial_appeal_eligible: boolean
          initial_approved_at: string | null
          initial_approved_by: string | null
          initial_decision_outcome: string | null
          initial_decision_reason: string | null
          initial_proposed_at: string | null
          initial_proposed_by: string | null
          report_id: string
          status: string
          target_owner_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          initial_action_summary?: string | null
          initial_appeal_eligible?: boolean
          initial_approved_at?: string | null
          initial_approved_by?: string | null
          initial_decision_outcome?: string | null
          initial_decision_reason?: string | null
          initial_proposed_at?: string | null
          initial_proposed_by?: string | null
          report_id: string
          status?: string
          target_owner_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          initial_action_summary?: string | null
          initial_appeal_eligible?: boolean
          initial_approved_at?: string | null
          initial_approved_by?: string | null
          initial_decision_outcome?: string | null
          initial_decision_reason?: string | null
          initial_proposed_at?: string | null
          initial_proposed_by?: string | null
          report_id?: string
          status?: string
          target_owner_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_cases_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: true
            referencedRelation: "content_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          new_follower_enabled: boolean
          new_track_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          new_follower_enabled?: boolean
          new_track_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          new_follower_enabled?: boolean
          new_track_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_key: string
          id: string
          read_at: string | null
          recipient_user_id: string
          report_id: string | null
          track_id: string | null
          type: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_key: string
          id?: string
          read_at?: string | null
          recipient_user_id: string
          report_id?: string | null
          track_id?: string | null
          type: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_key?: string
          id?: string
          read_at?: string | null
          recipient_user_id?: string
          report_id?: string | null
          track_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "content_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_tracks: {
        Row: {
          added_at: string
          playlist_id: string
          position: number
          track_id: string
        }
        Insert: {
          added_at?: string
          playlist_id: string
          position: number
          track_id: string
        }
        Update: {
          added_at?: string
          playlist_id?: string
          position?: number
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_tracks_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_tracks_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          cover_url: string | null
          created_at: string
          id: string
          is_public: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      private_review_comments: {
        Row: {
          author_reviewer_id: string | null
          author_type: string
          body: string
          created_at: string
          id: string
          parent_comment_id: string | null
          session_id: string
          thread_reviewer_id: string
        }
        Insert: {
          author_reviewer_id?: string | null
          author_type: string
          body: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          session_id: string
          thread_reviewer_id: string
        }
        Update: {
          author_reviewer_id?: string | null
          author_type?: string
          body?: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          session_id?: string
          thread_reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_review_comments_author_reviewer_id_fkey"
            columns: ["author_reviewer_id"]
            isOneToOne: false
            referencedRelation: "private_review_reviewers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_review_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "private_review_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_review_comments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "private_review_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_review_comments_thread_reviewer_id_fkey"
            columns: ["thread_reviewer_id"]
            isOneToOne: false
            referencedRelation: "private_review_reviewers"
            referencedColumns: ["id"]
          },
        ]
      }
      private_review_join_admissions: {
        Row: {
          attempt_count: number
          bucket_start: string
          last_attempt_at: string
          network_hash: string
          pin_failure_count: number
          session_id: string
        }
        Insert: {
          attempt_count?: number
          bucket_start: string
          last_attempt_at?: string
          network_hash: string
          pin_failure_count?: number
          session_id: string
        }
        Update: {
          attempt_count?: number
          bucket_start?: string
          last_attempt_at?: string
          network_hash?: string
          pin_failure_count?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_review_join_admissions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "private_review_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      private_review_reviewers: {
        Row: {
          access_key_hash: string
          created_at: string
          display_name: string
          id: string
          last_seen_at: string
          session_id: string
        }
        Insert: {
          access_key_hash: string
          created_at?: string
          display_name: string
          id?: string
          last_seen_at?: string
          session_id: string
        }
        Update: {
          access_key_hash?: string
          created_at?: string
          display_name?: string
          id?: string
          last_seen_at?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_review_reviewers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "private_review_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      private_review_sessions: {
        Row: {
          audio_snapshot: Json | null
          closed_at: string | null
          comment_visibility: string
          created_at: string
          creator_message: string
          expires_at: string
          id: string
          include_audio: boolean
          include_lyrics: boolean
          include_prompt: boolean
          last_opened_at: string | null
          open_count: number
          owner_id: string
          pin_hash: string | null
          project_id: string | null
          project_name: string
          shared_track_id: string | null
          snapshot: Json
          source_track_id: string | null
          source_type: string
          token_hash: string
          version_label: string | null
          version_number: number | null
          version_prompt_id: string | null
        }
        Insert: {
          audio_snapshot?: Json | null
          closed_at?: string | null
          comment_visibility: string
          created_at?: string
          creator_message?: string
          expires_at: string
          id?: string
          include_audio?: boolean
          include_lyrics?: boolean
          include_prompt?: boolean
          last_opened_at?: string | null
          open_count?: number
          owner_id: string
          pin_hash?: string | null
          project_id?: string | null
          project_name: string
          shared_track_id?: string | null
          snapshot: Json
          source_track_id?: string | null
          source_type?: string
          token_hash: string
          version_label?: string | null
          version_number?: number | null
          version_prompt_id?: string | null
        }
        Update: {
          audio_snapshot?: Json | null
          closed_at?: string | null
          comment_visibility?: string
          created_at?: string
          creator_message?: string
          expires_at?: string
          id?: string
          include_audio?: boolean
          include_lyrics?: boolean
          include_prompt?: boolean
          last_opened_at?: string | null
          open_count?: number
          owner_id?: string
          pin_hash?: string | null
          project_id?: string | null
          project_name?: string
          shared_track_id?: string | null
          snapshot?: Json
          source_track_id?: string | null
          source_type?: string
          token_hash?: string
          version_label?: string | null
          version_number?: number | null
          version_prompt_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "private_review_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "prompt_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_review_sessions_shared_track_id_fkey"
            columns: ["shared_track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_review_sessions_source_track_id_fkey"
            columns: ["source_track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_review_sessions_version_prompt_id_fkey"
            columns: ["version_prompt_id"]
            isOneToOne: false
            referencedRelation: "saved_prompts"
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
      project_audio_outcome_evaluations: {
        Row: {
          created_at: string
          id: string
          intent_match_level: string
          lock_version: number
          note: string | null
          project_id: string
          source_track_id: string
          source_version_prompt_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          intent_match_level: string
          lock_version?: number
          note?: string | null
          project_id: string
          source_track_id: string
          source_version_prompt_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          intent_match_level?: string
          lock_version?: number
          note?: string | null
          project_id?: string
          source_track_id?: string
          source_version_prompt_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_audio_outcome_evaluations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "prompt_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_audio_outcome_evaluations_source_track_id_fkey"
            columns: ["source_track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_audio_outcome_evaluations_source_version_prompt_id_fkey"
            columns: ["source_version_prompt_id"]
            isOneToOne: false
            referencedRelation: "saved_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      project_audio_revision_feedback: {
        Row: {
          change_text: string
          created_at: string
          created_revision_prompt_id: string | null
          id: string
          idempotency_key: string
          imported_evidence: Json
          keep_text: string
          project_id: string
          revision_brief: string | null
          revision_intent_id: string | null
          source_track_id: string
          source_version_prompt_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          change_text?: string
          created_at?: string
          created_revision_prompt_id?: string | null
          id?: string
          idempotency_key: string
          imported_evidence?: Json
          keep_text?: string
          project_id: string
          revision_brief?: string | null
          revision_intent_id?: string | null
          source_track_id: string
          source_version_prompt_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          change_text?: string
          created_at?: string
          created_revision_prompt_id?: string | null
          id?: string
          idempotency_key?: string
          imported_evidence?: Json
          keep_text?: string
          project_id?: string
          revision_brief?: string | null
          revision_intent_id?: string | null
          source_track_id?: string
          source_version_prompt_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_audio_revision_feedback_created_revision_prompt_id_fkey"
            columns: ["created_revision_prompt_id"]
            isOneToOne: false
            referencedRelation: "saved_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_audio_revision_feedback_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "prompt_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_audio_revision_feedback_revision_intent_id_fkey"
            columns: ["revision_intent_id"]
            isOneToOne: false
            referencedRelation: "project_audio_revision_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_audio_revision_feedback_source_track_id_fkey"
            columns: ["source_track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_audio_revision_feedback_source_version_prompt_id_fkey"
            columns: ["source_version_prompt_id"]
            isOneToOne: false
            referencedRelation: "saved_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      project_audio_revision_intents: {
        Row: {
          accepted_change_text: string
          accepted_keep_text: string
          accepted_revision_brief: string | null
          completed_at: string | null
          created_at: string
          id: string
          lock_version: number
          project_id: string
          source_track_id: string
          source_version_prompt_id: string
          status: string
          unresolved_suggestions: Json
          updated_at: string
          user_id: string
          user_request: string
        }
        Insert: {
          accepted_change_text?: string
          accepted_keep_text?: string
          accepted_revision_brief?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          lock_version?: number
          project_id: string
          source_track_id: string
          source_version_prompt_id: string
          status?: string
          unresolved_suggestions?: Json
          updated_at?: string
          user_id: string
          user_request?: string
        }
        Update: {
          accepted_change_text?: string
          accepted_keep_text?: string
          accepted_revision_brief?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          lock_version?: number
          project_id?: string
          source_track_id?: string
          source_version_prompt_id?: string
          status?: string
          unresolved_suggestions?: Json
          updated_at?: string
          user_id?: string
          user_request?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_audio_revision_intents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "prompt_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_audio_revision_intents_source_track_id_fkey"
            columns: ["source_track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_audio_revision_intents_source_version_prompt_id_fkey"
            columns: ["source_version_prompt_id"]
            isOneToOne: false
            referencedRelation: "saved_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      project_version_tracks: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          project_id: string
          track_id: string
          user_id: string
          version_prompt_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          project_id: string
          track_id: string
          user_id: string
          version_prompt_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          project_id?: string
          track_id?: string
          user_id?: string
          version_prompt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_version_tracks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "prompt_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_version_tracks_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_version_tracks_version_prompt_id_fkey"
            columns: ["version_prompt_id"]
            isOneToOne: false
            referencedRelation: "saved_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_projects: {
        Row: {
          created_at: string
          creation_notes: string
          duplicated_from_project_id: string | null
          folder_id: string | null
          id: string
          name: string
          preferred_prompt_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          creation_notes?: string
          duplicated_from_project_id?: string | null
          folder_id?: string | null
          id?: string
          name: string
          preferred_prompt_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          creation_notes?: string
          duplicated_from_project_id?: string | null
          folder_id?: string | null
          id?: string
          name?: string
          preferred_prompt_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_projects_duplicated_from_project_id_fkey"
            columns: ["duplicated_from_project_id"]
            isOneToOne: false
            referencedRelation: "prompt_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_projects_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "library_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_projects_preferred_prompt_id_fkey"
            columns: ["preferred_prompt_id"]
            isOneToOne: false
            referencedRelation: "saved_prompts"
            referencedColumns: ["id"]
          },
        ]
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
      saved_prompts: {
        Row: {
          branch_label: string | null
          created_at: string
          custom_name: string | null
          duplicated_from_prompt_id: string | null
          folder_id: string | null
          generator_input_snapshot: Json | null
          genre: string
          id: string
          language: string
          lyrics: string
          mood: string
          note: string
          parent_prompt_id: string | null
          project_id: string | null
          revision_request: string | null
          source_generation_job_id: string | null
          tags: string
          theme: string
          title: string | null
          updated_at: string
          user_id: string
          version_change_metadata: Json | null
          version_label: string | null
          version_number: number | null
          version_user_note: string | null
        }
        Insert: {
          branch_label?: string | null
          created_at?: string
          custom_name?: string | null
          duplicated_from_prompt_id?: string | null
          folder_id?: string | null
          generator_input_snapshot?: Json | null
          genre?: string
          id?: string
          language?: string
          lyrics?: string
          mood?: string
          note?: string
          parent_prompt_id?: string | null
          project_id?: string | null
          revision_request?: string | null
          source_generation_job_id?: string | null
          tags?: string
          theme?: string
          title?: string | null
          updated_at?: string
          user_id: string
          version_change_metadata?: Json | null
          version_label?: string | null
          version_number?: number | null
          version_user_note?: string | null
        }
        Update: {
          branch_label?: string | null
          created_at?: string
          custom_name?: string | null
          duplicated_from_prompt_id?: string | null
          folder_id?: string | null
          generator_input_snapshot?: Json | null
          genre?: string
          id?: string
          language?: string
          lyrics?: string
          mood?: string
          note?: string
          parent_prompt_id?: string | null
          project_id?: string | null
          revision_request?: string | null
          source_generation_job_id?: string | null
          tags?: string
          theme?: string
          title?: string | null
          updated_at?: string
          user_id?: string
          version_change_metadata?: Json | null
          version_label?: string | null
          version_number?: number | null
          version_user_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_prompts_duplicated_from_prompt_id_fkey"
            columns: ["duplicated_from_prompt_id"]
            isOneToOne: false
            referencedRelation: "saved_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_prompts_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "library_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_prompts_parent_prompt_id_fkey"
            columns: ["parent_prompt_id"]
            isOneToOne: false
            referencedRelation: "saved_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_prompts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "prompt_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_prompts_source_generation_job_id_fkey"
            columns: ["source_generation_job_id"]
            isOneToOne: false
            referencedRelation: "ai_generation_jobs"
            referencedColumns: ["id"]
          },
        ]
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
      song_universe_ai_analyses: {
        Row: {
          analysis_type: string
          created_at: string
          id: string
          model: string | null
          owner_id: string
          result: Json
          source_revision: string | null
          universe_id: string
        }
        Insert: {
          analysis_type: string
          created_at?: string
          id?: string
          model?: string | null
          owner_id: string
          result?: Json
          source_revision?: string | null
          universe_id: string
        }
        Update: {
          analysis_type?: string
          created_at?: string
          id?: string
          model?: string | null
          owner_id?: string
          result?: Json
          source_revision?: string | null
          universe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_universe_ai_analyses_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "song_universes"
            referencedColumns: ["id"]
          },
        ]
      }
      song_universe_planner_briefs: {
        Row: {
          approved_at: string | null
          brief: Json
          contrast_level: string
          created_at: string
          current_song_intent: string | null
          fallback_diagnostics: Json | null
          history_fingerprint: string
          id: string
          model: string | null
          owner_id: string
          planned_track_count: number | null
          planner_schema_version: string
          provider: string | null
          source_completeness: string | null
          status: string
          strategy_version: string
          target_position: number | null
          target_role: string | null
          universe_id: string
          universe_type: string
        }
        Insert: {
          approved_at?: string | null
          brief: Json
          contrast_level?: string
          created_at?: string
          current_song_intent?: string | null
          fallback_diagnostics?: Json | null
          history_fingerprint: string
          id?: string
          model?: string | null
          owner_id: string
          planned_track_count?: number | null
          planner_schema_version?: string
          provider?: string | null
          source_completeness?: string | null
          status?: string
          strategy_version: string
          target_position?: number | null
          target_role?: string | null
          universe_id: string
          universe_type: string
        }
        Update: {
          approved_at?: string | null
          brief?: Json
          contrast_level?: string
          created_at?: string
          current_song_intent?: string | null
          fallback_diagnostics?: Json | null
          history_fingerprint?: string
          id?: string
          model?: string | null
          owner_id?: string
          planned_track_count?: number | null
          planner_schema_version?: string
          provider?: string | null
          source_completeness?: string | null
          status?: string
          strategy_version?: string
          target_position?: number | null
          target_role?: string | null
          universe_id?: string
          universe_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_universe_planner_briefs_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "song_universes"
            referencedColumns: ["id"]
          },
        ]
      }
      song_universe_projects: {
        Row: {
          context_snapshot: Json
          context_snapshot_at: string | null
          created_at: string
          id: string
          inherited_traits: Json
          intentional_outlier: boolean
          outlier_purpose: string | null
          position: number
          project_id: string
          project_status: string
          universe_id: string
          universe_role: string | null
          updated_at: string
        }
        Insert: {
          context_snapshot?: Json
          context_snapshot_at?: string | null
          created_at?: string
          id?: string
          inherited_traits?: Json
          intentional_outlier?: boolean
          outlier_purpose?: string | null
          position?: number
          project_id: string
          project_status?: string
          universe_id: string
          universe_role?: string | null
          updated_at?: string
        }
        Update: {
          context_snapshot?: Json
          context_snapshot_at?: string | null
          created_at?: string
          id?: string
          inherited_traits?: Json
          intentional_outlier?: boolean
          outlier_purpose?: string | null
          position?: number
          project_id?: string
          project_status?: string
          universe_id?: string
          universe_role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_universe_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "prompt_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_universe_projects_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "song_universes"
            referencedColumns: ["id"]
          },
        ]
      }
      song_universes: {
        Row: {
          arc_direction: string | null
          cover_object_key: string | null
          created_at: string
          creative_bible: Json
          creative_updated_at: string
          description: string | null
          id: string
          initial_direction: string | null
          owner_id: string
          planned_track_count: number | null
          planner_contrast: string
          status: string
          story_bible: Json
          title: string
          universe_type: string
          updated_at: string
        }
        Insert: {
          arc_direction?: string | null
          cover_object_key?: string | null
          created_at?: string
          creative_bible?: Json
          creative_updated_at?: string
          description?: string | null
          id?: string
          initial_direction?: string | null
          owner_id: string
          planned_track_count?: number | null
          planner_contrast?: string
          status?: string
          story_bible?: Json
          title: string
          universe_type?: string
          updated_at?: string
        }
        Update: {
          arc_direction?: string | null
          cover_object_key?: string | null
          created_at?: string
          creative_bible?: Json
          creative_updated_at?: string
          description?: string | null
          id?: string
          initial_direction?: string | null
          owner_id?: string
          planned_track_count?: number | null
          planner_contrast?: string
          status?: string
          story_bible?: Json
          title?: string
          universe_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      story_map_beats: {
        Row: {
          change_after_beat: string
          created_at: string
          emotion: string
          id: string
          is_key_beat: boolean
          key_image: string
          lyric_anchor: string
          narrator_state: string
          position: number
          purpose: string
          reveal: string
          story_map_id: string
          suggested_sections: Json
          title: string
          updated_at: string
          what_happens: string
        }
        Insert: {
          change_after_beat?: string
          created_at?: string
          emotion?: string
          id?: string
          is_key_beat?: boolean
          key_image?: string
          lyric_anchor?: string
          narrator_state?: string
          position: number
          purpose?: string
          reveal?: string
          story_map_id: string
          suggested_sections?: Json
          title: string
          updated_at?: string
          what_happens?: string
        }
        Update: {
          change_after_beat?: string
          created_at?: string
          emotion?: string
          id?: string
          is_key_beat?: boolean
          key_image?: string
          lyric_anchor?: string
          narrator_state?: string
          position?: number
          purpose?: string
          reveal?: string
          story_map_id?: string
          suggested_sections?: Json
          title?: string
          updated_at?: string
          what_happens?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_map_beats_story_map_id_fkey"
            columns: ["story_map_id"]
            isOneToOne: false
            referencedRelation: "story_maps"
            referencedColumns: ["id"]
          },
        ]
      }
      story_maps: {
        Row: {
          central_change: string | null
          concept: string
          created_at: string
          creative_updated_at: string
          desired_ending: string | null
          emotional_direction: string | null
          id: string
          narrator: string | null
          point_of_view: string | null
          progression_type: string | null
          project_id: string | null
          resolution: string | null
          source_lyrics_updated_at: string | null
          source_project_version_id: string | null
          starting_state: string | null
          summary: string | null
          theme: string | null
          title: string
          turning_point: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          central_change?: string | null
          concept: string
          created_at?: string
          creative_updated_at?: string
          desired_ending?: string | null
          emotional_direction?: string | null
          id?: string
          narrator?: string | null
          point_of_view?: string | null
          progression_type?: string | null
          project_id?: string | null
          resolution?: string | null
          source_lyrics_updated_at?: string | null
          source_project_version_id?: string | null
          starting_state?: string | null
          summary?: string | null
          theme?: string | null
          title: string
          turning_point?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          central_change?: string | null
          concept?: string
          created_at?: string
          creative_updated_at?: string
          desired_ending?: string | null
          emotional_direction?: string | null
          id?: string
          narrator?: string | null
          point_of_view?: string | null
          progression_type?: string | null
          project_id?: string | null
          resolution?: string | null
          source_lyrics_updated_at?: string | null
          source_project_version_id?: string | null
          starting_state?: string | null
          summary?: string | null
          theme?: string | null
          title?: string
          turning_point?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_maps_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "prompt_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_maps_source_project_version_id_fkey"
            columns: ["source_project_version_id"]
            isOneToOne: false
            referencedRelation: "saved_prompts"
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
      track_share_events: {
        Row: {
          created_at: string
          id: string
          shared_by: string | null
          track_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          shared_by?: string | null
          track_id: string
        }
        Update: {
          created_at?: string
          id?: string
          shared_by?: string | null
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_share_events_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_share_links: {
        Row: {
          created_at: string
          id: string
          include_lyrics: boolean
          include_prompt: boolean
          last_opened_at: string | null
          open_count: number
          owner_id: string
          revoked_at: string | null
          token: string
          track_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          include_lyrics?: boolean
          include_prompt?: boolean
          last_opened_at?: string | null
          open_count?: number
          owner_id: string
          revoked_at?: string | null
          token?: string
          track_id: string
        }
        Update: {
          created_at?: string
          id?: string
          include_lyrics?: boolean
          include_prompt?: boolean
          last_opened_at?: string | null
          open_count?: number
          owner_id?: string
          revoked_at?: string | null
          token?: string
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_share_links_track_id_fkey"
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
          audio_content_hash: string | null
          audio_fingerprint: string | null
          audio_key: string | null
          audio_type: string
          audio_url: string
          contains_explicit_lyrics: boolean
          cover_url: string | null
          created_at: string
          created_with: string | null
          duration_seconds: number | null
          first_published_at: string | null
          genre: string
          id: string
          is_published: boolean
          lyrics: string
          lyrics_is_public: boolean
          moderation_locked_at: string | null
          moderation_locked_by: string | null
          moderation_reason_code: string | null
          moderation_reason_text: string | null
          moderation_status: string
          plays: number
          prompt: string
          prompt_is_public: boolean
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
          audio_content_hash?: string | null
          audio_fingerprint?: string | null
          audio_key?: string | null
          audio_type?: string
          audio_url: string
          contains_explicit_lyrics?: boolean
          cover_url?: string | null
          created_at?: string
          created_with?: string | null
          duration_seconds?: number | null
          first_published_at?: string | null
          genre?: string
          id?: string
          is_published?: boolean
          lyrics?: string
          lyrics_is_public?: boolean
          moderation_locked_at?: string | null
          moderation_locked_by?: string | null
          moderation_reason_code?: string | null
          moderation_reason_text?: string | null
          moderation_status?: string
          plays?: number
          prompt?: string
          prompt_is_public?: boolean
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
          audio_content_hash?: string | null
          audio_fingerprint?: string | null
          audio_key?: string | null
          audio_type?: string
          audio_url?: string
          contains_explicit_lyrics?: boolean
          cover_url?: string | null
          created_at?: string
          created_with?: string | null
          duration_seconds?: number | null
          first_published_at?: string | null
          genre?: string
          id?: string
          is_published?: boolean
          lyrics?: string
          lyrics_is_public?: boolean
          moderation_locked_at?: string | null
          moderation_locked_by?: string | null
          moderation_reason_code?: string | null
          moderation_reason_text?: string | null
          moderation_status?: string
          plays?: number
          prompt?: string
          prompt_is_public?: boolean
          source_id?: string | null
          source_type?: string
          source_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_donation_methods: {
        Row: {
          created_at: string
          custom_label: string | null
          id: string
          is_enabled: boolean
          privacy_acknowledged: boolean
          provider: string
          sort_order: number
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          custom_label?: string | null
          id?: string
          is_enabled?: boolean
          privacy_acknowledged?: boolean
          provider: string
          sort_order?: number
          updated_at?: string
          user_id: string
          value: string
        }
        Update: {
          created_at?: string
          custom_label?: string | null
          id?: string
          is_enabled?: boolean
          privacy_acknowledged?: boolean
          provider?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      user_donation_settings: {
        Row: {
          admin_override: string
          admin_updated_by: string | null
          created_at: string
          updated_at: string
          user_enabled: boolean
          user_id: string
        }
        Insert: {
          admin_override?: string
          admin_updated_by?: string | null
          created_at?: string
          updated_at?: string
          user_enabled?: boolean
          user_id: string
        }
        Update: {
          admin_override?: string
          admin_updated_by?: string | null
          created_at?: string
          updated_at?: string
          user_enabled?: boolean
          user_id?: string
        }
        Relationships: []
      }
      user_follows: {
        Row: {
          created_at: string
          followed_user_id: string
          follower_user_id: string
          id: string
        }
        Insert: {
          created_at?: string
          followed_user_id: string
          follower_user_id: string
          id?: string
        }
        Update: {
          created_at?: string
          followed_user_id?: string
          follower_user_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_follows_followed_user_id_fkey"
            columns: ["followed_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_follows_followed_user_id_fkey"
            columns: ["followed_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_follows_follower_user_id_fkey"
            columns: ["follower_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_follows_follower_user_id_fkey"
            columns: ["follower_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
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
      _calculate_ai_usage_cost: {
        Args: {
          p_cache_write_tokens?: number
          p_cached_input_tokens?: number
          p_input_tokens: number
          p_model: string
          p_output_tokens: number
        }
        Returns: number
      }
      _has_role_internal: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      _is_admin_level_internal: { Args: { _user_id: string }; Returns: boolean }
      _is_banned_internal: { Args: { _user_id: string }; Returns: boolean }
      _lock_user_security_pair: {
        Args: { _first: string; _second: string }
        Returns: undefined
      }
      _lock_user_security_state: {
        Args: { _user_id: string }
        Returns: undefined
      }
      _moderation_case_actor_role: {
        Args: { _user_id: string }
        Returns: string
      }
      _moderation_case_can_read: {
        Args: { _actor: string; _case_id: string }
        Returns: boolean
      }
      add_moderation_case_note: {
        Args: { _body: string; _case_id: string }
        Returns: string
      }
      add_private_review_comment: {
        Args: {
          _body: string
          _parent_comment_id?: string
          _reviewer_key: string
          _token: string
        }
        Returns: Json
      }
      add_private_review_creator_reply: {
        Args: { _body: string; _parent_comment_id: string; _session_id: string }
        Returns: Json
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
      admin_set_creator_donation_access: {
        Args: { _override: string; _target_user_id: string }
        Returns: undefined
      }
      admin_set_creator_donations_global: {
        Args: { _enabled: boolean }
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
      admit_auxiliary_ai_request: {
        Args: { _limit_per_hour?: number; _operation: string }
        Returns: boolean
      }
      admit_contact_request: {
        Args: { _email_hash: string; _network_hash: string }
        Returns: boolean
      }
      admit_private_review_join: {
        Args: { _network_hash: string; _token: string }
        Returns: Json
      }
      admit_track_upload: { Args: never; Returns: boolean }
      app_role_rank: { Args: { _role: string }; Returns: number }
      approve_initial_case_decision: {
        Args: { _case_id: string }
        Returns: undefined
      }
      backfill_pending_ai_usage_costs: {
        Args: { p_model: string }
        Returns: number
      }
      bulk_delete_prompt_projects: { Args: { _plans: Json }; Returns: Json }
      can_manage_track_storage_cleanup: {
        Args: { _cleanup_id: string }
        Returns: boolean
      }
      can_moderate_target: {
        Args: { _target_user_id: string }
        Returns: boolean
      }
      can_use_feature: {
        Args: { _feature_key: string; _user_id: string }
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
      claim_auxiliary_ai_request: {
        Args: { _operation: string; _request_key: string }
        Returns: Json
      }
      claim_quality_check: { Args: { _idempotency_key: string }; Returns: Json }
      cleanup_audio_revision_intent_ai_results_internal: {
        Args: never
        Returns: number
      }
      close_private_review_session: {
        Args: { _session_id: string }
        Returns: undefined
      }
      complete_auxiliary_ai_request: {
        Args: {
          _execution_token: string
          _operation: string
          _request_key: string
          _result: Json
        }
        Returns: undefined
      }
      complete_auxiliary_ai_request_internal: {
        Args: {
          _execution_token: string
          _operation: string
          _request_key: string
          _result: Json
          _user_id: string
        }
        Returns: undefined
      }
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
      consume_quality_check_internal: {
        Args: {
          _idempotency_key: string
          _model: string
          _provider: string
          _quality_report: Json
          _user_id: string
        }
        Returns: string
      }
      copy_prompt_version_to_project: {
        Args: {
          _destination_project_id: string
          _prompt_id: string
          _user_id: string
        }
        Returns: Json
      }
      copy_prompt_version_to_project_impl: {
        Args: {
          _destination_project_id: string
          _prompt_id: string
          _user_id: string
        }
        Returns: Json
      }
      create_private_review_session: {
        Args: {
          _comment_visibility?: string
          _creator_message?: string
          _expires_at?: string
          _pin?: string
          _project_id: string
          _shared_track_id?: string
          _version_prompt_id: string
        }
        Returns: Json
      }
      create_private_track_review_session: {
        Args: {
          _comment_visibility?: string
          _creator_message?: string
          _expires_at?: string
          _include_lyrics?: boolean
          _include_prompt?: boolean
          _pin?: string
          _track_id: string
        }
        Returns: Json
      }
      create_prompt_lyrics_review_version: {
        Args: {
          _lyrics: string
          _parent_prompt_id: string
          _project_id: string
          _user_id: string
          _version_change_metadata: Json
        }
        Returns: Json
      }
      create_prompt_lyrics_workspace_version: {
        Args: {
          _lyrics: string
          _parent_prompt_id: string
          _project_id: string
          _user_id: string
          _version_change_metadata: Json
          _version_label: string
        }
        Returns: Json
      }
      create_prompt_revision_version: {
        Args: {
          _generator_input_snapshot: Json
          _genre: string
          _job_id: string
          _language: string
          _lyrics: string
          _mood: string
          _note: string
          _parent_prompt_id: string
          _project_id: string
          _revision_request: string
          _tags: string
          _theme: string
          _title: string
          _user_id: string
          _version_change_metadata: Json
        }
        Returns: Json
      }
      create_track_share_link: {
        Args: {
          _include_lyrics?: boolean
          _include_prompt?: boolean
          _track_id: string
        }
        Returns: Json
      }
      current_user_can_use_feature: {
        Args: { _feature_key: string }
        Returns: boolean
      }
      current_user_has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      current_user_is_admin_level: { Args: never; Returns: boolean }
      current_user_is_banned: { Args: never; Returns: boolean }
      current_user_is_super_admin: { Args: never; Returns: boolean }
      delete_track_with_cleanup: { Args: { _track_id: string }; Returns: Json }
      detach_prompt_project_version: {
        Args: { _prompt_id: string; _user_id: string }
        Returns: Json
      }
      detach_prompt_project_version_impl: {
        Args: { _prompt_id: string; _user_id: string }
        Returns: Json
      }
      dismiss_generation_job: { Args: { _job_id: string }; Returns: string }
      duplicate_prompt_project_to_folder: {
        Args: {
          _destination_folder_id: string
          _new_name: string
          _project_id: string
        }
        Returns: Json
      }
      duplicate_standalone_prompt_to_folder: {
        Args: {
          _destination_folder_id: string
          _new_name: string
          _prompt_id: string
        }
        Returns: Json
      }
      edit_track_with_cleanup: {
        Args: {
          _allow_download?: boolean
          _contains_explicit_lyrics?: boolean
          _created_with?: string
          _genre: string
          _is_published: boolean
          _lyrics: string
          _lyrics_is_public?: boolean
          _new_audio_key?: string
          _new_audio_url?: string
          _new_cover_url?: string
          _prompt: string
          _prompt_is_public?: boolean
          _source_id?: string
          _source_type: string
          _source_url?: string
          _title: string
          _track_id: string
        }
        Returns: Json
      }
      fail_auxiliary_ai_request: {
        Args: {
          _error: string
          _execution_token: string
          _operation: string
          _request_key: string
        }
        Returns: undefined
      }
      fail_auxiliary_ai_request_internal: {
        Args: {
          _error: string
          _execution_token: string
          _operation: string
          _request_key: string
          _user_id: string
        }
        Returns: undefined
      }
      feature_access_add_user: {
        Args: { _feature_key: string; _user_id: string }
        Returns: boolean
      }
      feature_access_list: { Args: never; Returns: Json }
      feature_access_remove_user: {
        Args: { _feature_key: string; _user_id: string }
        Returns: boolean
      }
      feature_access_search_users: {
        Args: { _limit?: number; _search?: string }
        Returns: Json
      }
      feature_access_selected_users: {
        Args: { _feature_key: string }
        Returns: Json
      }
      feature_access_set_policy: {
        Args: { _access_mode: string; _feature_key: string }
        Returns: undefined
      }
      finalize_moderation_case_appeal: {
        Args: {
          _action: string
          _case_id: string
          _override_action_summary?: string
          _override_outcome?: string
          _override_reason?: string
        }
        Returns: undefined
      }
      finalize_quality_check_job: {
        Args: { _action_id: string }
        Returns: string
      }
      flush_ai_usage_outbox: { Args: { _limit?: number }; Returns: number }
      follow_creator: { Args: { _target_user_id: string }; Returns: Json }
      get_content_report: { Args: { _report_id: string }; Returns: Json }
      get_latest_quality_check_job: {
        Args: { _generation_id: string }
        Returns: Json
      }
      get_moderation_case: { Args: { _case_id: string }; Returns: Json }
      get_moderation_case_unread_count: { Args: never; Returns: number }
      get_my_account_status: { Args: never; Returns: Json }
      get_my_moderation_context: { Args: never; Returns: Json }
      get_my_private_review_session: {
        Args: { _reviewer_id?: string; _session_id: string }
        Returns: Json
      }
      get_private_review_session: {
        Args: { _reviewer_key: string; _token: string }
        Returns: Json
      }
      get_quality_check_job: { Args: { _action_id: string }; Returns: Json }
      get_track_share_by_token: { Args: { _token: string }; Returns: Json }
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
      join_private_review_session: {
        Args: { _display_name: string; _pin?: string; _token: string }
        Returns: Json
      }
      kick_generation_runner: { Args: { _job_id: string }; Returns: undefined }
      kick_quality_check_runner: {
        Args: { _action_id: string }
        Returns: undefined
      }
      like_count: { Args: { _track_id: string }; Returns: number }
      link_project_version_tracks: {
        Args: {
          _project_id: string
          _track_ids: string[]
          _version_prompt_id: string
        }
        Returns: Json
      }
      list_content_reports: { Args: { _scope?: string }; Returns: Json }
      list_moderation_case_assignees: { Args: never; Returns: Json }
      list_my_moderation_cases: { Args: never; Returns: Json }
      list_my_private_review_sessions: {
        Args: { _project_id?: string }
        Returns: Json
      }
      list_my_share_management: { Args: never; Returns: Json }
      list_trending_tracks: {
        Args: never
        Returns: {
          allow_download: boolean
          art_url: string
          audio_type: string
          audio_url: string
          contains_explicit_lyrics: boolean
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
      mark_auxiliary_ai_provider_started: {
        Args: {
          _execution_token: string
          _operation: string
          _request_key: string
        }
        Returns: boolean
      }
      mark_auxiliary_ai_provider_started_internal: {
        Args: {
          _execution_token: string
          _operation: string
          _request_key: string
          _user_id: string
        }
        Returns: boolean
      }
      mark_moderation_case_read: {
        Args: { _case_id: string }
        Returns: undefined
      }
      mark_quality_check_provider_started: {
        Args: { _idempotency_key: string }
        Returns: undefined
      }
      mark_quality_check_provider_started_internal: {
        Args: { _idempotency_key: string; _user_id: string }
        Returns: undefined
      }
      move_prompt_version_to_project: {
        Args: {
          _destination_project_id: string
          _prompt_id: string
          _user_id: string
        }
        Returns: Json
      }
      move_prompt_version_to_project_impl: {
        Args: {
          _destination_project_id: string
          _prompt_id: string
          _user_id: string
        }
        Returns: Json
      }
      next_prompt_project_version: {
        Args: { p_project_id: string }
        Returns: number
      }
      normalize_registration_email: {
        Args: { _email: string }
        Returns: string
      }
      private_review_link_info: { Args: { _token: string }; Returns: Json }
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
      project_audio_source_is_currently_eligible: {
        Args: {
          _project_id: string
          _source_track_id: string
          _source_version_prompt_id: string
          _user_id: string
        }
        Returns: boolean
      }
      propose_initial_case_decision: {
        Args: {
          _action_summary?: string
          _appeal_eligible?: boolean
          _case_id: string
          _outcome: string
          _reason: string
        }
        Returns: undefined
      }
      propose_moderation_case_appeal_decision: {
        Args: {
          _action_summary?: string
          _case_id: string
          _outcome: string
          _reason: string
        }
        Returns: undefined
      }
      reassign_moderation_case: {
        Args: { _case_id: string; _new_assignee?: string }
        Returns: undefined
      }
      reconcile_provider_committed_generation: {
        Args: { _job_id: string }
        Returns: boolean
      }
      reconcile_provider_committed_quality: {
        Args: { _action_id: string }
        Returns: boolean
      }
      record_private_review_pin_failure: {
        Args: { _network_hash: string; _token: string }
        Returns: undefined
      }
      record_track_public_share: {
        Args: { _track_id: string }
        Returns: undefined
      }
      refresh_public_staff_badge: {
        Args: { _user_id: string }
        Returns: undefined
      }
      release_quality_check: {
        Args: { _idempotency_key: string }
        Returns: undefined
      }
      release_quality_check_internal: {
        Args: { _idempotency_key: string; _user_id: string }
        Returns: undefined
      }
      reopen_moderation_case: { Args: { _case_id: string }; Returns: undefined }
      reorder_playlist_tracks: {
        Args: { _playlist_id: string; _track_ids: string[] }
        Returns: undefined
      }
      reorder_song_universe_projects: {
        Args: { _membership_ids: string[]; _universe_id: string }
        Returns: undefined
      }
      reorder_story_map_beats: {
        Args: { _beat_ids: string[]; _story_map_id: string }
        Returns: undefined
      }
      replace_latest_prompt_lyrics_review_version: {
        Args: {
          _lyrics: string
          _project_id: string
          _user_id: string
          _version_change_metadata: Json
          _version_prompt_id: string
        }
        Returns: Json
      }
      replace_story_map_draft: {
        Args: {
          _beats: Json
          _central_change: string
          _narrator: string
          _point_of_view: string
          _progression_type: string
          _resolution: string
          _starting_state: string
          _story_map_id: string
          _summary: string
          _turning_point: string
        }
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
      review_content_report: {
        Args: {
          _moderator_notes?: string
          _report_id: string
          _resolution?: string
          _status: string
        }
        Returns: undefined
      }
      revoke_track_share_link: {
        Args: { _share_id: string }
        Returns: undefined
      }
      search_library_folders: {
        Args: { _query: string }
        Returns: {
          depth: number
          id: string
          name: string
          parent_folder_id: string
          path: string
        }[]
      }
      search_library_scope: {
        Args: { _folder_id: string; _query: string }
        Returns: {
          folder_id: string
          item_id: string
          item_type: string
          name: string
          path: string
        }[]
      }
      search_personal_library: {
        Args: {
          _limit?: number
          _query: string
          _recency_days?: number
          _types?: string[]
        }
        Returns: {
          item_id: string
          item_type: string
          match_rank: number
          project_id: string
          subtitle: string
          target_path: string
          target_tab: string
          title: string
          updated_at: string
        }[]
      }
      send_moderation_case_message: {
        Args: { _body: string; _case_id: string; _message_type: string }
        Returns: string
      }
      set_primary_project_version_track: {
        Args: {
          _project_id: string
          _track_id?: string
          _version_prompt_id: string
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
      submit_moderation_case_appeal: {
        Args: { _case_id: string; _statement: string }
        Returns: string
      }
      submit_track_report: {
        Args: {
          _category: string
          _details?: string
          _supporting_url?: string
          _track_id: string
        }
        Returns: string
      }
      sweep_generation_jobs: { Args: never; Returns: number }
      take_moderation_case: { Args: { _report_id: string }; Returns: string }
      track_cover_path: { Args: { _cover_url: string }; Returns: string }
      unfollow_creator: { Args: { _target_user_id: string }; Returns: Json }
      unlink_project_version_track: {
        Args: {
          _project_id: string
          _track_id: string
          _version_prompt_id: string
        }
        Returns: Json
      }
      update_track_share_link: {
        Args: {
          _include_lyrics: boolean
          _include_prompt: boolean
          _share_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "moderator"
        | "user"
        | "senior_moderator"
        | "super_admin"
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
      app_role: [
        "admin",
        "moderator",
        "user",
        "senior_moderator",
        "super_admin",
      ],
    },
  },
} as const
