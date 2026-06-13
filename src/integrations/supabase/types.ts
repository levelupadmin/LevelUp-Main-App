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
      account_deletion_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          email: string
          id: string
          ip_address: string | null
          phone: string | null
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          status: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          email: string
          id?: string
          ip_address?: string | null
          phone?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          phone?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_deletion_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_deletion_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_deletion_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_deletion_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_deletion_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_deletion_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_announcements: {
        Row: {
          audience_id: string | null
          audience_type: string
          body: string
          created_at: string
          id: string
          link: string | null
          recipient_count: number
          sent_by: string
          title: string
        }
        Insert: {
          audience_id?: string | null
          audience_type: string
          body: string
          created_at?: string
          id?: string
          link?: string | null
          recipient_count?: number
          sent_by: string
          title: string
        }
        Update: {
          audience_id?: string | null
          audience_type?: string
          body?: string
          created_at?: string
          id?: string
          link?: string | null
          recipient_count?: number
          sent_by?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_announcements_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_announcements_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_announcements_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_settings: {
        Row: {
          clarity_enabled: boolean
          clarity_project_id: string | null
          ga4_enabled: boolean
          ga4_measurement_id: string | null
          meta_pixel_enabled: boolean
          meta_pixel_id: string | null
          singleton: boolean
          twitter_pixel_enabled: boolean
          twitter_pixel_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          clarity_enabled?: boolean
          clarity_project_id?: string | null
          ga4_enabled?: boolean
          ga4_measurement_id?: string | null
          meta_pixel_enabled?: boolean
          meta_pixel_id?: string | null
          singleton?: boolean
          twitter_pixel_enabled?: boolean
          twitter_pixel_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          clarity_enabled?: boolean
          clarity_project_id?: string | null
          ga4_enabled?: boolean
          ga4_measurement_id?: string | null
          meta_pixel_enabled?: boolean
          meta_pixel_id?: string | null
          singleton?: boolean
          twitter_pixel_enabled?: boolean
          twitter_pixel_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      api_call_log: {
        Row: {
          action: string
          api_key_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: number
          ip: unknown
          request_body: Json | null
          response_summary: Json | null
          status_code: number
          user_agent: string | null
        }
        Insert: {
          action: string
          api_key_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: number
          ip?: unknown
          request_body?: Json | null
          response_summary?: Json | null
          status_code: number
          user_agent?: string | null
        }
        Update: {
          action?: string
          api_key_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: number
          ip?: unknown
          request_body?: Json | null
          response_summary?: Json | null
          status_code?: number
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_call_log_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "team_api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_submissions: {
        Row: {
          admin_feedback: string | null
          admin_rating: number | null
          chapter_id: string
          created_at: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          submission_file_url: string | null
          submission_text: string | null
          submitted_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_feedback?: string | null
          admin_rating?: number | null
          chapter_id: string
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          submission_file_url?: string | null
          submission_text?: string | null
          submitted_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_feedback?: string | null
          admin_rating?: number | null
          chapter_id?: string
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          submission_file_url?: string | null
          submission_text?: string | null
          submitted_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_import_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_count: number | null
          error_log: Json | null
          file_url: string
          id: string
          import_type: string
          run_by: string | null
          started_at: string | null
          status: string
          success_count: number | null
          total_rows: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_count?: number | null
          error_log?: Json | null
          file_url: string
          id?: string
          import_type: string
          run_by?: string | null
          started_at?: string | null
          status?: string
          success_count?: number | null
          total_rows?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_count?: number | null
          error_log?: Json | null
          file_url?: string
          id?: string
          import_type?: string
          run_by?: string | null
          started_at?: string | null
          status?: string
          success_count?: number | null
          total_rows?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bulk_import_jobs_run_by_fkey"
            columns: ["run_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_import_jobs_run_by_fkey"
            columns: ["run_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_import_jobs_run_by_fkey"
            columns: ["run_by"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      cb_api_call_log: {
        Row: {
          args_digest: string | null
          created_at: string
          id: string
          ip: unknown
          key_id: string | null
          latency_ms: number | null
          status: string | null
          tool: string | null
          user_id: string
        }
        Insert: {
          args_digest?: string | null
          created_at?: string
          id?: string
          ip?: unknown
          key_id?: string | null
          latency_ms?: number | null
          status?: string | null
          tool?: string | null
          user_id: string
        }
        Update: {
          args_digest?: string | null
          created_at?: string
          id?: string
          ip?: unknown
          key_id?: string | null
          latency_ms?: number | null
          status?: string | null
          tool?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cb_api_call_log_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "cb_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_api_call_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_api_call_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_api_call_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      cb_capture_tokens: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          revoked_at: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cb_capture_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_capture_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_capture_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      cb_folder_items: {
        Row: {
          added_at: string
          folder_id: string
          reel_id: string
        }
        Insert: {
          added_at?: string
          folder_id: string
          reel_id: string
        }
        Update: {
          added_at?: string
          folder_id?: string
          reel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cb_folder_items_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "cb_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_folder_items_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "cb_reels"
            referencedColumns: ["id"]
          },
        ]
      }
      cb_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cb_folders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_folders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_folders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      cb_keys: {
        Row: {
          created_at: string
          hashed_key: string
          id: string
          key_hint: string
          last_used_at: string | null
          last_used_ip: unknown
          revoked_at: string | null
          rotated_from: string | null
          scope: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hashed_key: string
          id?: string
          key_hint: string
          last_used_at?: string | null
          last_used_ip?: unknown
          revoked_at?: string | null
          rotated_from?: string | null
          scope?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hashed_key?: string
          id?: string
          key_hint?: string
          last_used_at?: string | null
          last_used_ip?: unknown
          revoked_at?: string | null
          rotated_from?: string | null
          scope?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cb_keys_rotated_from_fkey"
            columns: ["rotated_from"]
            isOneToOne: false
            referencedRelation: "cb_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      cb_reels: {
        Row: {
          acted_at: string | null
          bucket: string
          caption: string | null
          created_at: string
          creator_name: string | null
          creator_username: string | null
          duration: number | null
          error: string | null
          fts: unknown
          hashtags: string[] | null
          highlights: string[]
          id: string
          last_revisited_at: string | null
          like_count: number | null
          note: string | null
          platform: string
          posted_at: string | null
          processed_at: string | null
          revisit_count: number
          shortcode: string
          source: string
          status: string
          tags: string[]
          thumbnail_url: string | null
          title: string | null
          transcript: string | null
          transcript_lang: string | null
          updated_at: string
          url: string
          user_id: string
          view_count: number | null
        }
        Insert: {
          acted_at?: string | null
          bucket?: string
          caption?: string | null
          created_at?: string
          creator_name?: string | null
          creator_username?: string | null
          duration?: number | null
          error?: string | null
          fts?: unknown
          hashtags?: string[] | null
          highlights?: string[]
          id?: string
          last_revisited_at?: string | null
          like_count?: number | null
          note?: string | null
          platform: string
          posted_at?: string | null
          processed_at?: string | null
          revisit_count?: number
          shortcode: string
          source?: string
          status?: string
          tags?: string[]
          thumbnail_url?: string | null
          title?: string | null
          transcript?: string | null
          transcript_lang?: string | null
          updated_at?: string
          url: string
          user_id: string
          view_count?: number | null
        }
        Update: {
          acted_at?: string | null
          bucket?: string
          caption?: string | null
          created_at?: string
          creator_name?: string | null
          creator_username?: string | null
          duration?: number | null
          error?: string | null
          fts?: unknown
          hashtags?: string[] | null
          highlights?: string[]
          id?: string
          last_revisited_at?: string | null
          like_count?: number | null
          note?: string | null
          platform?: string
          posted_at?: string | null
          processed_at?: string | null
          revisit_count?: number
          shortcode?: string
          source?: string
          status?: string
          tags?: string[]
          thumbnail_url?: string | null
          title?: string | null
          transcript?: string | null
          transcript_lang?: string | null
          updated_at?: string
          url?: string
          user_id?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cb_reels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_reels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_reels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_templates: {
        Row: {
          auto_generate: boolean
          background_image_url: string
          completion_threshold: number
          course_id: string
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
          variable_positions: Json
        }
        Insert: {
          auto_generate?: boolean
          background_image_url: string
          completion_threshold?: number
          course_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          variable_positions?: Json
        }
        Update: {
          auto_generate?: boolean
          background_image_url?: string
          completion_threshold?: number
          course_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          variable_positions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "certificate_templates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          certificate_number: string
          course_id: string
          created_at: string
          generated_by: string
          id: string
          image_url: string
          metadata: Json | null
          template_id: string
          user_id: string
        }
        Insert: {
          certificate_number: string
          course_id: string
          created_at?: string
          generated_by?: string
          id?: string
          image_url: string
          metadata?: Json | null
          template_id: string
          user_id: string
        }
        Update: {
          certificate_number?: string
          course_id?: string
          created_at?: string
          generated_by?: string
          id?: string
          image_url?: string
          metadata?: Json | null
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "certificate_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_moments: {
        Row: {
          chapter_id: string
          created_at: string
          id: string
          label: string
          seconds: number
          sort_order: number
        }
        Insert: {
          chapter_id: string
          created_at?: string
          id?: string
          label: string
          seconds: number
          sort_order?: number
        }
        Update: {
          chapter_id?: string
          created_at?: string
          id?: string
          label?: string
          seconds?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "chapter_moments_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_notes: {
        Row: {
          body: string
          chapter_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          chapter_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          chapter_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_notes_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_progress: {
        Row: {
          chapter_id: string
          completed_at: string | null
          course_id: string
          created_at: string
          id: string
          last_position_seconds: number | null
          started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          chapter_id: string
          completed_at?: string | null
          course_id: string
          created_at?: string
          id?: string
          last_position_seconds?: number | null
          started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          chapter_id?: string
          completed_at?: string | null
          course_id?: string
          created_at?: string
          id?: string
          last_position_seconds?: number | null
          started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_progress_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_progress_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_qna: {
        Row: {
          chapter_id: string
          created_at: string
          id: string
          is_resolved: boolean
          question_text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          id?: string
          is_resolved?: boolean
          question_text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          id?: string
          is_resolved?: boolean
          question_text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_qna_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_qna_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_qna_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_qna_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_qna_replies: {
        Row: {
          created_at: string
          id: string
          is_instructor_reply: boolean
          qna_id: string
          reply_text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_instructor_reply?: boolean
          qna_id: string
          reply_text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_instructor_reply?: boolean
          qna_id?: string
          reply_text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_qna_replies_qna_id_fkey"
            columns: ["qna_id"]
            isOneToOne: false
            referencedRelation: "chapter_qna"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_qna_replies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_qna_replies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_qna_replies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_quizzes: {
        Row: {
          chapter_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          pass_percentage: number
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          pass_percentage?: number
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          pass_percentage?: number
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_quizzes_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_resources: {
        Row: {
          chapter_id: string
          created_at: string
          file_size_bytes: number | null
          file_url: string
          filename: string
          id: string
          sort_order: number
        }
        Insert: {
          chapter_id: string
          created_at?: string
          file_size_bytes?: number | null
          file_url: string
          filename: string
          id?: string
          sort_order?: number
        }
        Update: {
          chapter_id?: string
          created_at?: string
          file_size_bytes?: number | null
          file_url?: string
          filename?: string
          id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "chapter_resources_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          article_body: string | null
          assignment_prompt: string | null
          content_type: string
          created_at: string
          description: string | null
          duration_seconds: number | null
          embed_url: string | null
          file_size_bytes: number | null
          id: string
          make_free: boolean
          media_provider: string | null
          media_url: string | null
          original_filename: string | null
          section_id: string
          sort_order: number
          subtitle_url: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          vdocipher_thumbnail_url: string | null
          vdocipher_video_id: string | null
          vdocipher_watermark_text: string | null
          video_type: string
        }
        Insert: {
          article_body?: string | null
          assignment_prompt?: string | null
          content_type: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          embed_url?: string | null
          file_size_bytes?: number | null
          id?: string
          make_free?: boolean
          media_provider?: string | null
          media_url?: string | null
          original_filename?: string | null
          section_id: string
          sort_order?: number
          subtitle_url?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          vdocipher_thumbnail_url?: string | null
          vdocipher_video_id?: string | null
          vdocipher_watermark_text?: string | null
          video_type?: string
        }
        Update: {
          article_body?: string | null
          assignment_prompt?: string | null
          content_type?: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          embed_url?: string | null
          file_size_bytes?: number | null
          id?: string
          make_free?: boolean
          media_provider?: string | null
          media_url?: string | null
          original_filename?: string | null
          section_id?: string
          sort_order?: number
          subtitle_url?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          vdocipher_thumbnail_url?: string | null
          vdocipher_video_id?: string | null
          vdocipher_watermark_text?: string | null
          video_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapters_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_applications: {
        Row: {
          app_fee_paid_at: string | null
          app_fee_payment_id: string | null
          balance_payment_id: string | null
          bio: string | null
          city: string | null
          confirmation_payment_id: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          interview_date: string | null
          interview_notes: string | null
          occupation: string | null
          offering_id: string
          phone: string | null
          rejection_reason: string | null
          status: string
          tally_data: Json | null
          tally_response_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          app_fee_paid_at?: string | null
          app_fee_payment_id?: string | null
          balance_payment_id?: string | null
          bio?: string | null
          city?: string | null
          confirmation_payment_id?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          interview_date?: string | null
          interview_notes?: string | null
          occupation?: string | null
          offering_id: string
          phone?: string | null
          rejection_reason?: string | null
          status?: string
          tally_data?: Json | null
          tally_response_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          app_fee_paid_at?: string | null
          app_fee_payment_id?: string | null
          balance_payment_id?: string | null
          bio?: string | null
          city?: string | null
          confirmation_payment_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          interview_date?: string | null
          interview_notes?: string | null
          occupation?: string | null
          offering_id?: string
          phone?: string | null
          rejection_reason?: string | null
          status?: string
          tally_data?: Json | null
          tally_response_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cohort_applications_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_batch_members: {
        Row: {
          added_at: string
          batch_id: string
          enrolment_id: string
          id: string
        }
        Insert: {
          added_at?: string
          batch_id: string
          enrolment_id: string
          id?: string
        }
        Update: {
          added_at?: string
          batch_id?: string
          enrolment_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_batch_members_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "cohort_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_batch_members_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "enrolments"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_batches: {
        Row: {
          created_at: string
          id: string
          max_students: number | null
          name: string
          offering_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_students?: number | null
          name: string
          offering_id: string
        }
        Update: {
          created_at?: string
          id?: string
          max_students?: number | null
          name?: string
          offering_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_batches_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_learnings: {
        Row: {
          author_id: string | null
          body_md: string
          created_at: string
          fts: unknown
          id: string
          kind: string
          offering_id: string
          publish_at: string | null
          published: boolean
          session_label: string | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body_md: string
          created_at?: string
          fts?: unknown
          id?: string
          kind?: string
          offering_id: string
          publish_at?: string | null
          published?: boolean
          session_label?: string | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body_md?: string
          created_at?: string
          fts?: unknown
          id?: string
          kind?: string
          offering_id?: string
          publish_at?: string | null
          published?: boolean
          session_label?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_learnings_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_learnings_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_learnings_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_learnings_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_notifications_log: {
        Row: {
          channels: string[]
          id: string
          related_id: string
          related_kind: string
          sent_at: string
          template_key: string
          user_id: string
        }
        Insert: {
          channels?: string[]
          id?: string
          related_id: string
          related_kind: string
          sent_at?: string
          template_key: string
          user_id: string
        }
        Update: {
          channels?: string[]
          id?: string
          related_id?: string
          related_kind?: string
          sent_at?: string
          template_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_notifications_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_notifications_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_notifications_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_week_attendance: {
        Row: {
          attended: boolean
          cohort_week_id: string
          created_at: string
          id: string
          marked_at: string | null
          marked_by: string | null
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attended?: boolean
          cohort_week_id: string
          created_at?: string
          id?: string
          marked_at?: string | null
          marked_by?: string | null
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attended?: boolean
          cohort_week_id?: string
          created_at?: string
          id?: string
          marked_at?: string | null
          marked_by?: string | null
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_week_attendance_cohort_week_id_fkey"
            columns: ["cohort_week_id"]
            isOneToOne: false
            referencedRelation: "cohort_weeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_week_attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_week_attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_week_attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_week_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_week_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_week_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_week_submissions: {
        Row: {
          cohort_week_id: string
          created_at: string
          feedback_text: string | null
          file_urls: string[]
          id: string
          late: boolean
          link_url: string | null
          open_to_peer_review: boolean
          rating: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          text_content: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cohort_week_id: string
          created_at?: string
          feedback_text?: string | null
          file_urls?: string[]
          id?: string
          late?: boolean
          link_url?: string | null
          open_to_peer_review?: boolean
          rating?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          text_content?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cohort_week_id?: string
          created_at?: string
          feedback_text?: string | null
          file_urls?: string[]
          id?: string
          late?: boolean
          link_url?: string | null
          open_to_peer_review?: boolean
          rating?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          text_content?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_week_submissions_cohort_week_id_fkey"
            columns: ["cohort_week_id"]
            isOneToOne: false
            referencedRelation: "cohort_weeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_week_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_week_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_week_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_week_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_week_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_week_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_weeks: {
        Row: {
          assignment_due_at: string | null
          assignment_prompt: string | null
          cohort_batch_id: string
          created_at: string
          description: string | null
          ends_on: string
          feedback_session_at: string | null
          id: string
          sort_order: number
          starts_on: string
          status: string
          theme: string
          updated_at: string
          week_number: number
        }
        Insert: {
          assignment_due_at?: string | null
          assignment_prompt?: string | null
          cohort_batch_id: string
          created_at?: string
          description?: string | null
          ends_on: string
          feedback_session_at?: string | null
          id?: string
          sort_order?: number
          starts_on: string
          status?: string
          theme: string
          updated_at?: string
          week_number: number
        }
        Update: {
          assignment_due_at?: string | null
          assignment_prompt?: string | null
          cohort_batch_id?: string
          created_at?: string
          description?: string | null
          ends_on?: string
          feedback_session_at?: string | null
          id?: string
          sort_order?: number
          starts_on?: string
          status?: string
          theme?: string
          updated_at?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "cohort_weeks_cohort_batch_id_fkey"
            columns: ["cohort_batch_id"]
            isOneToOne: false
            referencedRelation: "cohort_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      community_post_comments: {
        Row: {
          comment_text: string
          created_at: string
          id: string
          parent_comment_id: string | null
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment_text: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment_text?: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_post_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "community_post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      community_post_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          cohort_batch_id: string | null
          content_text: string
          course_tag_id: string | null
          created_at: string
          id: string
          is_admin_post: boolean
          is_pinned: boolean
          linked_submission_id: string | null
          media_urls: string[] | null
          post_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cohort_batch_id?: string | null
          content_text: string
          course_tag_id?: string | null
          created_at?: string
          id?: string
          is_admin_post?: boolean
          is_pinned?: boolean
          linked_submission_id?: string | null
          media_urls?: string[] | null
          post_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cohort_batch_id?: string | null
          content_text?: string
          course_tag_id?: string | null
          created_at?: string
          id?: string
          is_admin_post?: boolean
          is_pinned?: boolean
          linked_submission_id?: string | null
          media_urls?: string[] | null
          post_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_cohort_batch_id_fkey"
            columns: ["cohort_batch_id"]
            isOneToOne: false
            referencedRelation: "cohort_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_course_tag_id_fkey"
            columns: ["course_tag_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_linked_submission_id_fkey"
            columns: ["linked_submission_id"]
            isOneToOne: false
            referencedRelation: "cohort_week_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          applies_to_offering_id: string | null
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          max_redemptions: number | null
          updated_at: string
          used_count: number
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          applies_to_offering_id?: string | null
          code: string
          created_at?: string
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          updated_at?: string
          used_count?: number
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          applies_to_offering_id?: string | null
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          updated_at?: string
          used_count?: number
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_applies_to_offering_id_fkey"
            columns: ["applies_to_offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      course_categories: {
        Row: {
          created_at: string
          emoji: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          emoji?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          emoji?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      course_drip_config: {
        Row: {
          course_id: string
          drip_mode: string
          updated_at: string
        }
        Insert: {
          course_id: string
          drip_mode?: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          drip_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_drip_config_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_notify_requests: {
        Row: {
          course_id: string
          created_at: string
          email: string | null
          id: string
          notified_at: string | null
          user_id: string | null
        }
        Insert: {
          course_id: string
          created_at?: string
          email?: string | null
          id?: string
          notified_at?: string | null
          user_id?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string
          email?: string | null
          id?: string
          notified_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_notify_requests_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_notify_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_notify_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_notify_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      course_rating_stats: {
        Row: {
          avg_rating: number
          course_id: string
          rating_1: number
          rating_2: number
          rating_3: number
          rating_4: number
          rating_5: number
          total_reviews: number
          updated_at: string
        }
        Insert: {
          avg_rating?: number
          course_id: string
          rating_1?: number
          rating_2?: number
          rating_3?: number
          rating_4?: number
          rating_5?: number
          total_reviews?: number
          updated_at?: string
        }
        Update: {
          avg_rating?: number
          course_id?: string
          rating_1?: number
          rating_2?: number
          rating_3?: number
          rating_4?: number
          rating_5?: number
          total_reviews?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_rating_stats_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_reviews: {
        Row: {
          course_id: string
          created_at: string
          helpful_count: number
          id: string
          is_verified_purchase: boolean
          rating: number
          review_text: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          helpful_count?: number
          id?: string
          is_verified_purchase?: boolean
          rating: number
          review_text?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          helpful_count?: number
          id?: string
          is_verified_purchase?: boolean
          rating?: number
          review_text?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_reviews_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      course_testimonials: {
        Row: {
          cohort_label: string | null
          course_id: string
          created_at: string
          id: string
          is_active: boolean
          quote: string
          rating: number | null
          sort_order: number
          student_avatar_url: string | null
          student_name: string
          updated_at: string
        }
        Insert: {
          cohort_label?: string | null
          course_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          quote: string
          rating?: number | null
          sort_order?: number
          student_avatar_url?: string | null
          student_name: string
          updated_at?: string
        }
        Update: {
          cohort_label?: string | null
          course_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          quote?: string
          rating?: number | null
          sort_order?: number
          student_avatar_url?: string | null
          student_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_testimonials_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          category_id: string | null
          created_at: string
          default_video_type: string
          description: string | null
          drm_enabled: boolean
          duration_minutes: number | null
          duration_text: string | null
          faqs: Json | null
          hero_image_url: string | null
          id: string
          instructor_avatar_url: string | null
          instructor_bio: string | null
          instructor_credentials: Json | null
          instructor_display_name: string | null
          instructor_links: Json | null
          language: string | null
          level: string | null
          outcomes: Json | null
          portfolio_pieces: Json | null
          primary_offering_id: string | null
          product_tier: string
          published_at: string | null
          rating_avg: number | null
          rating_count: number | null
          show_as_locked: boolean
          show_on_browse: boolean | null
          slug: string
          sort_order: number
          status: string
          student_count: number | null
          subtitle: string | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          total_lessons: number | null
          trailer_video_url: string | null
          updated_at: string
          what_youll_learn: string[] | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          default_video_type?: string
          description?: string | null
          drm_enabled?: boolean
          duration_minutes?: number | null
          duration_text?: string | null
          faqs?: Json | null
          hero_image_url?: string | null
          id?: string
          instructor_avatar_url?: string | null
          instructor_bio?: string | null
          instructor_credentials?: Json | null
          instructor_display_name?: string | null
          instructor_links?: Json | null
          language?: string | null
          level?: string | null
          outcomes?: Json | null
          portfolio_pieces?: Json | null
          primary_offering_id?: string | null
          product_tier?: string
          published_at?: string | null
          rating_avg?: number | null
          rating_count?: number | null
          show_as_locked?: boolean
          show_on_browse?: boolean | null
          slug: string
          sort_order?: number
          status?: string
          student_count?: number | null
          subtitle?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          total_lessons?: number | null
          trailer_video_url?: string | null
          updated_at?: string
          what_youll_learn?: string[] | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          default_video_type?: string
          description?: string | null
          drm_enabled?: boolean
          duration_minutes?: number | null
          duration_text?: string | null
          faqs?: Json | null
          hero_image_url?: string | null
          id?: string
          instructor_avatar_url?: string | null
          instructor_bio?: string | null
          instructor_credentials?: Json | null
          instructor_display_name?: string | null
          instructor_links?: Json | null
          language?: string | null
          level?: string | null
          outcomes?: Json | null
          portfolio_pieces?: Json | null
          primary_offering_id?: string | null
          product_tier?: string
          published_at?: string | null
          rating_avg?: number | null
          rating_count?: number | null
          show_as_locked?: boolean
          show_on_browse?: boolean | null
          slug?: string
          sort_order?: number
          status?: string
          student_count?: number | null
          subtitle?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          total_lessons?: number | null
          trailer_video_url?: string | null
          updated_at?: string
          what_youll_learn?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "course_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_primary_offering_id_fkey"
            columns: ["primary_offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contacts: {
        Row: {
          converted_at: string | null
          converted_user_id: string | null
          created_at: string
          crm_id: string | null
          custom_fields: Json
          data_sources: string[] | null
          days_to_conversion: number | null
          email: string | null
          first_touch_at: string | null
          full_name: string | null
          id: string
          last_contacted_at: string | null
          lifecycle_stage: string | null
          mql_score: number | null
          mql_tier: string | null
          notes: string | null
          owner_user_id: string | null
          phone: string | null
          source: string | null
          status: string
          tags: string[] | null
          tally_categories: string[] | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          converted_at?: string | null
          converted_user_id?: string | null
          created_at?: string
          crm_id?: string | null
          custom_fields?: Json
          data_sources?: string[] | null
          days_to_conversion?: number | null
          email?: string | null
          first_touch_at?: string | null
          full_name?: string | null
          id?: string
          last_contacted_at?: string | null
          lifecycle_stage?: string | null
          mql_score?: number | null
          mql_tier?: string | null
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          tags?: string[] | null
          tally_categories?: string[] | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          converted_at?: string | null
          converted_user_id?: string | null
          created_at?: string
          crm_id?: string | null
          custom_fields?: Json
          data_sources?: string[] | null
          days_to_conversion?: number | null
          email?: string | null
          first_touch_at?: string | null
          full_name?: string | null
          id?: string
          last_contacted_at?: string | null
          lifecycle_stage?: string | null
          mql_score?: number | null
          mql_tier?: string | null
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          tags?: string[] | null
          tally_categories?: string[] | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_converted_user_id_fkey"
            columns: ["converted_user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_converted_user_id_fkey"
            columns: ["converted_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_converted_user_id_fkey"
            columns: ["converted_user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_definitions: {
        Row: {
          created_at: string
          field_type: string
          id: string
          is_required: boolean
          label: string
          offering_id: string | null
          options: Json | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          field_type: string
          id?: string
          is_required?: boolean
          label: string
          offering_id?: string | null
          options?: Json | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          field_type?: string
          id?: string
          is_required?: boolean
          label?: string
          offering_id?: string | null
          options?: Json | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_definitions_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_changelog: {
        Row: {
          area: string
          author: string
          body_md: string | null
          created_at: string
          created_by: string | null
          id: string
          shipped_at: string | null
          status: string
          summary: string
          title: string
          updated_at: string
          user_facing: boolean
          version: string | null
        }
        Insert: {
          area: string
          author?: string
          body_md?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          shipped_at?: string | null
          status?: string
          summary: string
          title: string
          updated_at?: string
          user_facing?: boolean
          version?: string | null
        }
        Update: {
          area?: string
          author?: string
          body_md?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          shipped_at?: string | null
          status?: string
          summary?: string
          title?: string
          updated_at?: string
          user_facing?: boolean
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doc_changelog_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_changelog_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_changelog_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          audience_id: string | null
          audience_type: string
          created_at: string
          html_body: string
          id: string
          sent_at: string | null
          sent_by: string
          sent_count: number
          status: string
          subject: string
          text_body: string
          total_recipients: number
          updated_at: string
        }
        Insert: {
          audience_id?: string | null
          audience_type: string
          created_at?: string
          html_body: string
          id?: string
          sent_at?: string | null
          sent_by: string
          sent_count?: number
          status?: string
          subject: string
          text_body?: string
          total_recipients?: number
          updated_at?: string
        }
        Update: {
          audience_id?: string | null
          audience_type?: string
          created_at?: string
          html_body?: string
          id?: string
          sent_at?: string | null
          sent_by?: string
          sent_count?: number
          status?: string
          subject?: string
          text_body?: string
          total_recipients?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          created_at: string
          html_body: string
          id: string
          is_active: boolean
          name: string
          subject: string
          template_key: string
          text_body: string
          updated_at: string
          variables: Json
        }
        Insert: {
          created_at?: string
          html_body: string
          id?: string
          is_active?: boolean
          name: string
          subject: string
          template_key: string
          text_body?: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          created_at?: string
          html_body?: string
          id?: string
          is_active?: boolean
          name?: string
          subject?: string
          template_key?: string
          text_body?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      enrolment_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          enrolment_id: string
          id: string
          metadata: Json | null
          reason: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          enrolment_id: string
          id?: string
          metadata?: Json | null
          reason?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          enrolment_id?: string
          id?: string
          metadata?: Json | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrolment_audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolment_audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolment_audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolment_audit_log_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "enrolments"
            referencedColumns: ["id"]
          },
        ]
      }
      enrolments: {
        Row: {
          application_id: string | null
          autopay_active: boolean
          balance_due_inr: number | null
          created_at: string
          edition_label: string | null
          expires_at: string | null
          granted_by: string | null
          id: string
          offering_id: string
          payment_order_id: string | null
          razorpay_subscription_id: string | null
          revoked_at: string | null
          revoked_by: string | null
          revoked_reason: string | null
          source: string
          starts_at: string
          status: string
          total_paid_inr: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          application_id?: string | null
          autopay_active?: boolean
          balance_due_inr?: number | null
          created_at?: string
          edition_label?: string | null
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          offering_id: string
          payment_order_id?: string | null
          razorpay_subscription_id?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          source?: string
          starts_at?: string
          status?: string
          total_paid_inr?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          application_id?: string | null
          autopay_active?: boolean
          balance_due_inr?: number | null
          created_at?: string
          edition_label?: string | null
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          offering_id?: string
          payment_order_id?: string | null
          razorpay_subscription_id?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          source?: string
          starts_at?: string
          status?: string
          total_paid_inr?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrolments_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_payment_order_id_fkey"
            columns: ["payment_order_id"]
            isOneToOne: false
            referencedRelation: "payment_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      event_free_courses: {
        Row: {
          course_id: string
          event_id: string
          id: string
        }
        Insert: {
          course_id: string
          event_id: string
          id?: string
        }
        Update: {
          course_id?: string
          event_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_free_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_free_courses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_free_courses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          amount_paid: number | null
          event_id: string
          id: string
          payment_id: string | null
          registered_at: string
          status: string
          user_id: string
        }
        Insert: {
          amount_paid?: number | null
          event_id: string
          id?: string
          payment_id?: string | null
          registered_at?: string
          status?: string
          user_id: string
        }
        Update: {
          amount_paid?: number | null
          event_id?: string
          id?: string
          payment_id?: string | null
          registered_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      event_speakers: {
        Row: {
          avatar_url: string | null
          created_at: string
          event_id: string
          id: string
          name: string
          sort_order: number
          title: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          event_id: string
          id?: string
          name: string
          sort_order?: number
          title?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          sort_order?: number
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_speakers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_speakers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          city: string | null
          created_at: string
          description: string | null
          duration_minutes: number | null
          ends_at: string | null
          event_type: string
          host_avatar_url: string | null
          host_name: string
          host_title: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_featured: boolean
          max_capacity: number | null
          price_inr: number | null
          pricing_type: string
          sort_order: number
          starts_at: string
          status: string
          title: string
          updated_at: string
          venue_label: string | null
          venue_link: string | null
          venue_type: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          ends_at?: string | null
          event_type?: string
          host_avatar_url?: string | null
          host_name: string
          host_title?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          max_capacity?: number | null
          price_inr?: number | null
          pricing_type?: string
          sort_order?: number
          starts_at: string
          status?: string
          title: string
          updated_at?: string
          venue_label?: string | null
          venue_link?: string | null
          venue_type?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          ends_at?: string | null
          event_type?: string
          host_avatar_url?: string | null
          host_name?: string
          host_title?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          max_capacity?: number | null
          price_inr?: number | null
          pricing_type?: string
          sort_order?: number
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
          venue_label?: string | null
          venue_link?: string | null
          venue_type?: string
        }
        Relationships: []
      }
      hero_slides: {
        Row: {
          category_label: string
          created_at: string
          cta_link: string
          cta_text: string
          duration_label: string | null
          expires_at: string | null
          gradient_class: string
          id: string
          image_url: string | null
          is_active: boolean
          next_batch_label: string | null
          placement: string
          sort_order: number
          starts_at: string | null
          student_count_label: string | null
          subtitle: string | null
          title_accent: string
          title_prefix: string
          updated_at: string
        }
        Insert: {
          category_label?: string
          created_at?: string
          cta_link?: string
          cta_text?: string
          duration_label?: string | null
          expires_at?: string | null
          gradient_class?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          next_batch_label?: string | null
          placement?: string
          sort_order?: number
          starts_at?: string | null
          student_count_label?: string | null
          subtitle?: string | null
          title_accent?: string
          title_prefix?: string
          updated_at?: string
        }
        Update: {
          category_label?: string
          created_at?: string
          cta_link?: string
          cta_text?: string
          duration_label?: string | null
          expires_at?: string | null
          gradient_class?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          next_batch_label?: string | null
          placement?: string
          sort_order?: number
          starts_at?: string | null
          student_count_label?: string | null
          subtitle?: string | null
          title_accent?: string
          title_prefix?: string
          updated_at?: string
        }
        Relationships: []
      }
      instructor_course_assignments: {
        Row: {
          assigned_by: string | null
          course_id: string
          created_at: string
          id: string
          instructor_id: string
        }
        Insert: {
          assigned_by?: string | null
          course_id: string
          created_at?: string
          id?: string
          instructor_id: string
        }
        Update: {
          assigned_by?: string | null
          course_id?: string
          created_at?: string
          id?: string
          instructor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instructor_course_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructor_course_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructor_course_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructor_course_assignments_course_fk"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructor_course_assignments_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructor_course_assignments_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructor_course_assignments_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_enrolments: {
        Row: {
          city: string | null
          claimed_at: string | null
          claimed_by_user_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          legacy_amount_inr: number | null
          legacy_order_id: string | null
          legacy_program_name: string | null
          legacy_purchased_at: string | null
          offering_id: string | null
          phone: string
          source: string
          state: string | null
        }
        Insert: {
          city?: string | null
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          legacy_amount_inr?: number | null
          legacy_order_id?: string | null
          legacy_program_name?: string | null
          legacy_purchased_at?: string | null
          offering_id?: string | null
          phone: string
          source?: string
          state?: string | null
        }
        Update: {
          city?: string | null
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          legacy_amount_inr?: number | null
          legacy_order_id?: string | null
          legacy_program_name?: string | null
          legacy_purchased_at?: string | null
          offering_id?: string | null
          phone?: string
          source?: string
          state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legacy_enrolments_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_program_mapping: {
        Row: {
          created_at: string
          decision_status: string
          id: string
          legacy_program_name: string
          notes: string | null
          offering_id: string | null
          source: string
          updated_at: string
          user_count: number | null
        }
        Insert: {
          created_at?: string
          decision_status?: string
          id?: string
          legacy_program_name: string
          notes?: string | null
          offering_id?: string | null
          source?: string
          updated_at?: string
          user_count?: number | null
        }
        Update: {
          created_at?: string
          decision_status?: string
          id?: string
          legacy_program_name?: string
          notes?: string | null
          offering_id?: string | null
          source?: string
          updated_at?: string
          user_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "legacy_program_mapping_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      live_sessions: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          duration_minutes: number
          hero_image_url: string | null
          id: string
          recording_url: string | null
          scheduled_at: string
          session_type: string | null
          status: string
          title: string
          updated_at: string
          week_id: string | null
          zoom_link: string | null
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          hero_image_url?: string | null
          id?: string
          recording_url?: string | null
          scheduled_at: string
          session_type?: string | null
          status?: string
          title: string
          updated_at?: string
          week_id?: string | null
          zoom_link?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          hero_image_url?: string | null
          id?: string
          recording_url?: string | null
          scheduled_at?: string
          session_type?: string | null
          status?: string
          title?: string
          updated_at?: string
          week_id?: string | null
          zoom_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          notification_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          notification_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          notification_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          link_url: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          link_url?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          link_url?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      offering_bumps: {
        Row: {
          bump_offering_id: string
          bump_price_override_inr: number | null
          created_at: string
          headline: string | null
          id: string
          parent_offering_id: string
          sort_order: number
        }
        Insert: {
          bump_offering_id: string
          bump_price_override_inr?: number | null
          created_at?: string
          headline?: string | null
          id?: string
          parent_offering_id: string
          sort_order?: number
        }
        Update: {
          bump_offering_id?: string
          bump_price_override_inr?: number | null
          created_at?: string
          headline?: string | null
          id?: string
          parent_offering_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "offering_bumps_bump_offering_id_fkey"
            columns: ["bump_offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_bumps_parent_offering_id_fkey"
            columns: ["parent_offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      offering_courses: {
        Row: {
          course_id: string
          offering_id: string
        }
        Insert: {
          course_id: string
          offering_id: string
        }
        Update: {
          course_id?: string
          offering_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_courses_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      offering_upsells: {
        Row: {
          created_at: string | null
          description: string | null
          headline: string
          id: string
          is_active: boolean | null
          parent_offering_id: string
          sort_order: number | null
          updated_at: string | null
          upsell_offering_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          headline?: string
          id?: string
          is_active?: boolean | null
          parent_offering_id: string
          sort_order?: number | null
          updated_at?: string | null
          upsell_offering_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          headline?: string
          id?: string
          is_active?: boolean | null
          parent_offering_id?: string
          sort_order?: number | null
          updated_at?: string | null
          upsell_offering_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_upsells_parent_offering_id_fkey"
            columns: ["parent_offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_upsells_upsell_offering_id_fkey"
            columns: ["upsell_offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      offerings: {
        Row: {
          app_fee_inr: number | null
          application_deadline: string | null
          attendance_threshold_pct: number | null
          balance_deadline_days: number | null
          banner_url: string | null
          calendly_url: string | null
          checkout_bullets: Json | null
          checkout_guarantee_text: string | null
          checkout_testimonials: Json | null
          cohort_sessions: Json | null
          cohort_start_date: string | null
          confirmation_amount_inr: number | null
          confirmation_deadline_days: number | null
          confirmation_grace_hours: number | null
          created_at: string
          currency: string
          custom_tracking_script: string | null
          description: string | null
          google_ads_conversion: string | null
          gst_mode: string
          gst_rate: number | null
          highlights: Json | null
          id: string
          instructor_avatar_url: string | null
          instructor_name: string | null
          instructor_title: string | null
          is_public: boolean | null
          meta_pixel_id: string | null
          mrp_inr: number | null
          page_coupon_code: string | null
          payment_mode: string | null
          price_inr: number
          razorpay_plan_id: string | null
          refund_policy_days: number | null
          seats_total: number | null
          show_coupon_on_page: boolean | null
          slug: string
          status: string
          subscription_period: string | null
          subtitle: string | null
          tally_form_url: string | null
          thankyou_auto_redirect: boolean | null
          thankyou_body: string | null
          thankyou_cta_label: string | null
          thankyou_cta_url: string | null
          thankyou_headline: string | null
          thankyou_redirect_seconds: number | null
          thankyou_show_calendly: boolean | null
          thankyou_thumbnail_url: string | null
          thumbnail_url: string | null
          title: string
          type: string
          updated_at: string
          validity_days: number | null
          whatsapp_group_link: string | null
        }
        Insert: {
          app_fee_inr?: number | null
          application_deadline?: string | null
          attendance_threshold_pct?: number | null
          balance_deadline_days?: number | null
          banner_url?: string | null
          calendly_url?: string | null
          checkout_bullets?: Json | null
          checkout_guarantee_text?: string | null
          checkout_testimonials?: Json | null
          cohort_sessions?: Json | null
          cohort_start_date?: string | null
          confirmation_amount_inr?: number | null
          confirmation_deadline_days?: number | null
          confirmation_grace_hours?: number | null
          created_at?: string
          currency?: string
          custom_tracking_script?: string | null
          description?: string | null
          google_ads_conversion?: string | null
          gst_mode?: string
          gst_rate?: number | null
          highlights?: Json | null
          id?: string
          instructor_avatar_url?: string | null
          instructor_name?: string | null
          instructor_title?: string | null
          is_public?: boolean | null
          meta_pixel_id?: string | null
          mrp_inr?: number | null
          page_coupon_code?: string | null
          payment_mode?: string | null
          price_inr: number
          razorpay_plan_id?: string | null
          refund_policy_days?: number | null
          seats_total?: number | null
          show_coupon_on_page?: boolean | null
          slug: string
          status?: string
          subscription_period?: string | null
          subtitle?: string | null
          tally_form_url?: string | null
          thankyou_auto_redirect?: boolean | null
          thankyou_body?: string | null
          thankyou_cta_label?: string | null
          thankyou_cta_url?: string | null
          thankyou_headline?: string | null
          thankyou_redirect_seconds?: number | null
          thankyou_show_calendly?: boolean | null
          thankyou_thumbnail_url?: string | null
          thumbnail_url?: string | null
          title: string
          type: string
          updated_at?: string
          validity_days?: number | null
          whatsapp_group_link?: string | null
        }
        Update: {
          app_fee_inr?: number | null
          application_deadline?: string | null
          attendance_threshold_pct?: number | null
          balance_deadline_days?: number | null
          banner_url?: string | null
          calendly_url?: string | null
          checkout_bullets?: Json | null
          checkout_guarantee_text?: string | null
          checkout_testimonials?: Json | null
          cohort_sessions?: Json | null
          cohort_start_date?: string | null
          confirmation_amount_inr?: number | null
          confirmation_deadline_days?: number | null
          confirmation_grace_hours?: number | null
          created_at?: string
          currency?: string
          custom_tracking_script?: string | null
          description?: string | null
          google_ads_conversion?: string | null
          gst_mode?: string
          gst_rate?: number | null
          highlights?: Json | null
          id?: string
          instructor_avatar_url?: string | null
          instructor_name?: string | null
          instructor_title?: string | null
          is_public?: boolean | null
          meta_pixel_id?: string | null
          mrp_inr?: number | null
          page_coupon_code?: string | null
          payment_mode?: string | null
          price_inr?: number
          razorpay_plan_id?: string | null
          refund_policy_days?: number | null
          seats_total?: number | null
          show_coupon_on_page?: boolean | null
          slug?: string
          status?: string
          subscription_period?: string | null
          subtitle?: string | null
          tally_form_url?: string | null
          thankyou_auto_redirect?: boolean | null
          thankyou_body?: string | null
          thankyou_cta_label?: string | null
          thankyou_cta_url?: string | null
          thankyou_headline?: string | null
          thankyou_redirect_seconds?: number | null
          thankyou_show_calendly?: boolean | null
          thankyou_thumbnail_url?: string | null
          thumbnail_url?: string | null
          title?: string
          type?: string
          updated_at?: string
          validity_days?: number | null
          whatsapp_group_link?: string | null
        }
        Relationships: []
      }
      opportunities: {
        Row: {
          closes_at: string | null
          compensation_max_inr: number | null
          compensation_min_inr: number | null
          created_at: string
          description: string | null
          id: string
          location_city: string | null
          location_type: string | null
          posted_by_user_id: string
          poster_is_verified: boolean
          skills_required: string[] | null
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          closes_at?: string | null
          compensation_max_inr?: number | null
          compensation_min_inr?: number | null
          created_at?: string
          description?: string | null
          id?: string
          location_city?: string | null
          location_type?: string | null
          posted_by_user_id: string
          poster_is_verified?: boolean
          skills_required?: string[] | null
          status?: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          closes_at?: string | null
          compensation_max_inr?: number | null
          compensation_min_inr?: number | null
          created_at?: string
          description?: string | null
          id?: string
          location_city?: string | null
          location_type?: string | null
          posted_by_user_id?: string
          poster_is_verified?: boolean
          skills_required?: string[] | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_posted_by_user_id_fkey"
            columns: ["posted_by_user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_posted_by_user_id_fkey"
            columns: ["posted_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_posted_by_user_id_fkey"
            columns: ["posted_by_user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_applications: {
        Row: {
          applicant_user_id: string
          cover_note: string | null
          created_at: string
          id: string
          opportunity_id: string
          portfolio_link: string | null
          status: string
          updated_at: string
        }
        Insert: {
          applicant_user_id: string
          cover_note?: string | null
          created_at?: string
          id?: string
          opportunity_id: string
          portfolio_link?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          applicant_user_id?: string
          cover_note?: string | null
          created_at?: string
          id?: string
          opportunity_id?: string
          portfolio_link?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_applications_applicant_user_id_fkey"
            columns: ["applicant_user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_applications_applicant_user_id_fkey"
            columns: ["applicant_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_applications_applicant_user_id_fkey"
            columns: ["applicant_user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_applications_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_orders: {
        Row: {
          application_id: string | null
          bank: string | null
          bump_offering_ids: string[] | null
          captured_at: string | null
          card_last4: string | null
          card_network: string | null
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          custom_field_values: Json | null
          discount_inr: number
          fee_inr: number | null
          gst_inr: number
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          notes: Json | null
          offering_id: string
          payment_method: string | null
          payment_type: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          refunded_at: string | null
          status: string
          subtotal_inr: number
          tax_inr: number | null
          total_inr: number
          updated_at: string
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          vpa: string | null
          wallet: string | null
        }
        Insert: {
          application_id?: string | null
          bank?: string | null
          bump_offering_ids?: string[] | null
          captured_at?: string | null
          card_last4?: string | null
          card_network?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          custom_field_values?: Json | null
          discount_inr?: number
          fee_inr?: number | null
          gst_inr?: number
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          notes?: Json | null
          offering_id: string
          payment_method?: string | null
          payment_type?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          refunded_at?: string | null
          status?: string
          subtotal_inr: number
          tax_inr?: number | null
          total_inr: number
          updated_at?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          vpa?: string | null
          wallet?: string | null
        }
        Update: {
          application_id?: string | null
          bank?: string | null
          bump_offering_ids?: string[] | null
          captured_at?: string | null
          card_last4?: string | null
          card_network?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          custom_field_values?: Json | null
          discount_inr?: number
          fee_inr?: number | null
          gst_inr?: number
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          notes?: Json | null
          offering_id?: string
          payment_method?: string | null
          payment_type?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          refunded_at?: string | null
          status?: string
          subtotal_inr?: number
          tax_inr?: number | null
          total_inr?: number
          updated_at?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          vpa?: string | null
          wallet?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_review_assignments: {
        Row: {
          created_at: string
          feedback_text: string | null
          id: string
          rating: number | null
          reviewer_user_id: string
          status: string
          submission_id: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          feedback_text?: string | null
          id?: string
          rating?: number | null
          reviewer_user_id: string
          status?: string
          submission_id: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          feedback_text?: string | null
          id?: string
          rating?: number | null
          reviewer_user_id?: string
          status?: string
          submission_id?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "peer_review_assignments_reviewer_user_id_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_review_assignments_reviewer_user_id_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_review_assignments_reviewer_user_id_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_review_assignments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "cohort_week_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_projects: {
        Row: {
          created_at: string
          description: string | null
          external_url: string | null
          id: string
          is_featured: boolean
          media_urls: string[] | null
          sort_order: number
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          user_id: string
          view_count: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          external_url?: string | null
          id?: string
          is_featured?: boolean
          media_urls?: string[] | null
          sort_order?: number
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          user_id: string
          view_count?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          external_url?: string | null
          id?: string
          is_featured?: boolean
          media_urls?: string[] | null
          sort_order?: number
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      public_rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      qna_posts: {
        Row: {
          body: string
          course_id: string | null
          created_at: string
          id: string
          reply_count: number
          title: string
          updated_at: string
          upvote_count: number
          user_id: string
        }
        Insert: {
          body: string
          course_id?: string | null
          created_at?: string
          id?: string
          reply_count?: number
          title: string
          updated_at?: string
          upvote_count?: number
          user_id: string
        }
        Update: {
          body?: string
          course_id?: string | null
          created_at?: string
          id?: string
          reply_count?: number
          title?: string
          updated_at?: string
          upvote_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qna_posts_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qna_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qna_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qna_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_attempts: {
        Row: {
          answers: Json
          created_at: string
          id: string
          passed: boolean
          quiz_id: string
          score: number
          total: number
          user_id: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          id?: string
          passed?: boolean
          quiz_id: string
          score?: number
          total?: number
          user_id: string
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          passed?: boolean
          quiz_id?: string
          score?: number
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "chapter_quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_options: {
        Row: {
          id: string
          is_correct: boolean
          option_text: string
          question_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          is_correct?: boolean
          option_text: string
          question_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          is_correct?: boolean
          option_text?: string
          question_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          created_at: string
          explanation: string | null
          id: string
          question_text: string
          question_type: string
          quiz_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          explanation?: string | null
          id?: string
          question_text: string
          question_type?: string
          quiz_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          explanation?: string | null
          id?: string
          question_text?: string
          question_type?: string
          quiz_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "chapter_quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount_inr: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          initiated_by: string
          internal_notes: string | null
          payment_order_id: string
          razorpay_payment_id: string
          razorpay_refund_id: string | null
          reason: string
          refund_type: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_inr: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          initiated_by: string
          internal_notes?: string | null
          payment_order_id: string
          razorpay_payment_id: string
          razorpay_refund_id?: string | null
          reason: string
          refund_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_inr?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          initiated_by?: string
          internal_notes?: string | null
          payment_order_id?: string
          razorpay_payment_id?: string
          razorpay_refund_id?: string | null
          reason?: string
          refund_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_order_id_fkey"
            columns: ["payment_order_id"]
            isOneToOne: false
            referencedRelation: "payment_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      review_helpful_votes: {
        Row: {
          created_at: string
          id: string
          review_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          review_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_helpful_votes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "course_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_helpful_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_helpful_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_helpful_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission: string
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission: string
          role: string
        }
        Update: {
          created_at?: string
          id?: string
          permission?: string
          role?: string
        }
        Relationships: []
      }
      sections: {
        Row: {
          course_id: string
          created_at: string
          drip_days_after_enrolment: number | null
          drip_specific_date: string | null
          id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          drip_days_after_enrolment?: number | null
          drip_specific_date?: string | null
          id?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          drip_days_after_enrolment?: number | null
          drip_specific_date?: string | null
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      session_attendance: {
        Row: {
          created_at: string
          id: string
          joined_at: string | null
          left_at: string | null
          marked_by: string | null
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          joined_at?: string | null
          left_at?: string | null
          marked_by?: string | null
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          joined_at?: string | null
          left_at?: string | null
          marked_by?: string | null
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      team_api_keys: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          hashed_key: string
          id: string
          key_hint: string
          last_used_at: string | null
          last_used_ip: unknown
          name: string
          revoked_at: string | null
          scope: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          hashed_key: string
          id?: string
          key_hint: string
          last_used_at?: string | null
          last_used_ip?: unknown
          name: string
          revoked_at?: string | null
          scope: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          hashed_key?: string
          id?: string
          key_hint?: string
          last_used_at?: string | null
          last_used_ip?: unknown
          name?: string
          revoked_at?: string | null
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      user_marketing_prefs: {
        Row: {
          consent_at: string | null
          crm_id: string | null
          custom_fields: Json
          email_opt_in: boolean
          sms_opt_in: boolean
          source: string | null
          unsubscribed_at: string | null
          updated_at: string
          user_id: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          whatsapp_opt_in: boolean
        }
        Insert: {
          consent_at?: string | null
          crm_id?: string | null
          custom_fields?: Json
          email_opt_in?: boolean
          sms_opt_in?: boolean
          source?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
          user_id: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          whatsapp_opt_in?: boolean
        }
        Update: {
          consent_at?: string | null
          crm_id?: string | null
          custom_fields?: Json
          email_opt_in?: boolean
          sms_opt_in?: boolean
          source?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
          user_id?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          whatsapp_opt_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "user_marketing_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_marketing_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_marketing_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          source: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          source?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          source?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      user_tags: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          source: string | null
          tag: string
          user_id: string
          value: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          source?: string | null
          tag: string
          user_id: string
          value?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          source?: string | null
          tag?: string
          user_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_tags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_tags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_tags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          country: string | null
          craft_interests: string[] | null
          created_at: string
          deleted_at: string | null
          email: string | null
          first_purchase_at: string | null
          full_name: string | null
          id: string
          is_legacy: boolean
          last_active_at: string | null
          last_purchase_at: string | null
          legacy_source: string | null
          lifetime_revenue_inr: number | null
          member_number: number
          occupation: string | null
          onboarded_at: string | null
          open_to_collaborate: boolean | null
          phone: string | null
          program_vertical: string | null
          purchase_count: number | null
          role: string
          skills: string[] | null
          specific_vertical: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          craft_interests?: string[] | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_purchase_at?: string | null
          full_name?: string | null
          id: string
          is_legacy?: boolean
          last_active_at?: string | null
          last_purchase_at?: string | null
          legacy_source?: string | null
          lifetime_revenue_inr?: number | null
          member_number?: number
          occupation?: string | null
          onboarded_at?: string | null
          open_to_collaborate?: boolean | null
          phone?: string | null
          program_vertical?: string | null
          purchase_count?: number | null
          role?: string
          skills?: string[] | null
          specific_vertical?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          craft_interests?: string[] | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_purchase_at?: string | null
          full_name?: string | null
          id?: string
          is_legacy?: boolean
          last_active_at?: string | null
          last_purchase_at?: string | null
          legacy_source?: string | null
          lifetime_revenue_inr?: number | null
          member_number?: number
          occupation?: string | null
          onboarded_at?: string | null
          open_to_collaborate?: boolean | null
          phone?: string | null
          program_vertical?: string | null
          purchase_count?: number | null
          role?: string
          skills?: string[] | null
          specific_vertical?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      vdocipher_video_views: {
        Row: {
          chapter_id: string
          id: string
          ip_address: unknown
          otp_issued_at: string
          user_agent: string | null
          user_id: string | null
          vdocipher_video_id: string
        }
        Insert: {
          chapter_id: string
          id?: string
          ip_address?: unknown
          otp_issued_at?: string
          user_agent?: string | null
          user_id?: string | null
          vdocipher_video_id: string
        }
        Update: {
          chapter_id?: string
          id?: string
          ip_address?: unknown
          otp_issued_at?: string
          user_agent?: string | null
          user_id?: string | null
          vdocipher_video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vdocipher_video_views_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          error_message: string | null
          event_type: string
          http_status: number | null
          id: number
          next_retry_at: string | null
          payload: Json
          response_excerpt: string | null
          status: string
          subscription_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          event_type: string
          http_status?: number | null
          id?: number
          next_retry_at?: string | null
          payload: Json
          response_excerpt?: string | null
          status?: string
          subscription_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          event_type?: string
          http_status?: number | null
          id?: number
          next_retry_at?: string | null
          payload?: Json
          response_excerpt?: string | null
          status?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "webhook_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_subscriptions: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string | null
          event_types: string[]
          failure_count: number
          id: string
          last_failure_at: string | null
          last_failure_reason: string | null
          last_triggered_at: string | null
          name: string
          secret: string
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_types: string[]
          failure_count?: number
          id?: string
          last_failure_at?: string | null
          last_failure_reason?: string | null
          last_triggered_at?: string | null
          name: string
          secret: string
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_types?: string[]
          failure_count?: number
          id?: string
          last_failure_at?: string | null
          last_failure_reason?: string | null
          last_triggered_at?: string | null
          name?: string
          secret?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlisted_offerings: {
        Row: {
          created_at: string
          id: string
          offering_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          offering_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          offering_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlisted_offerings_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlisted_offerings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlisted_offerings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlisted_offerings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_attendance: {
        Row: {
          created_at: string
          duration_minutes: number | null
          id: string
          joined_at: string | null
          left_at: string | null
          user_id: string
          workshop_id: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          joined_at?: string | null
          left_at?: string | null
          user_id: string
          workshop_id: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          joined_at?: string | null
          left_at?: string | null
          user_id?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_segmented"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_attendance_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      workshops: {
        Row: {
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          is_recurring: boolean
          offering_id: string | null
          recurrence_rule: string | null
          reminder_sent_at: string | null
          scheduled_at: string
          send_reminders: boolean
          status: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          zoom_link: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_recurring?: boolean
          offering_id?: string | null
          recurrence_rule?: string | null
          reminder_sent_at?: string | null
          scheduled_at: string
          send_reminders?: boolean
          status?: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          zoom_link?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_recurring?: boolean
          offering_id?: string | null
          recurrence_rule?: string | null
          reminder_sent_at?: string | null
          scheduled_at?: string
          send_reminders?: boolean
          status?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          zoom_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workshops_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      enrolments_unified: {
        Row: {
          created_at: string | null
          enrolment_kind: string | null
          expires_at: string | null
          id: string | null
          legacy_program_name: string | null
          legacy_purchased_at: string | null
          offering_id: string | null
          offering_slug: string | null
          offering_title: string | null
          payment_order_id: string | null
          source: string | null
          starts_at: string | null
          status: string | null
          total_paid_inr: number | null
          user_email: string | null
          user_full_name: string | null
          user_id: string | null
          user_phone: string | null
        }
        Relationships: []
      }
      events_safe: {
        Row: {
          city: string | null
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          ends_at: string | null
          event_type: string | null
          host_avatar_url: string | null
          host_name: string | null
          host_title: string | null
          id: string | null
          image_url: string | null
          is_active: boolean | null
          is_featured: boolean | null
          max_capacity: number | null
          price_inr: number | null
          pricing_type: string | null
          sort_order: number | null
          starts_at: string | null
          status: string | null
          title: string | null
          updated_at: string | null
          venue_label: string | null
          venue_type: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          ends_at?: string | null
          event_type?: string | null
          host_avatar_url?: string | null
          host_name?: string | null
          host_title?: string | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          max_capacity?: number | null
          price_inr?: number | null
          pricing_type?: string | null
          sort_order?: number | null
          starts_at?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          venue_label?: string | null
          venue_type?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          ends_at?: string | null
          event_type?: string | null
          host_avatar_url?: string | null
          host_name?: string | null
          host_title?: string | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          max_capacity?: number | null
          price_inr?: number | null
          pricing_type?: string | null
          sort_order?: number | null
          starts_at?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          venue_label?: string | null
          venue_type?: string | null
        }
        Relationships: []
      }
      legacy_program_mapping_overview: {
        Row: {
          created_at: string | null
          decision_status: string | null
          id: string | null
          legacy_program_name: string | null
          notes: string | null
          offering_id: string | null
          offering_slug: string | null
          offering_status: string | null
          offering_title: string | null
          pending_enrolments: number | null
          source: string | null
          total_enrolments: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legacy_program_mapping_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      live_sessions_safe: {
        Row: {
          course_id: string | null
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          id: string | null
          recording_url: string | null
          scheduled_at: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string | null
          recording_url?: string | null
          scheduled_at?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          course_id?: string | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string | null
          recording_url?: string | null
          scheduled_at?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      public_user_profiles: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          id: string | null
          member_number: number | null
          occupation: string | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
          member_number?: number | null
          occupation?: string | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
          member_number?: number | null
          occupation?: string | null
        }
        Relationships: []
      }
      quiz_options_public: {
        Row: {
          id: string | null
          option_text: string | null
          question_id: string | null
          sort_order: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      users_segmented: {
        Row: {
          active_enrolment_count: number | null
          city: string | null
          country: string | null
          created_at: string | null
          email: string | null
          email_opt_in: boolean | null
          first_purchase_at: string | null
          full_name: string | null
          id: string | null
          is_legacy: boolean | null
          last_purchase_at: string | null
          legacy_enrolment_count: number | null
          legacy_source: string | null
          lifetime_revenue_inr: number | null
          live_paid_inr: number | null
          member_number: number | null
          phone: string | null
          program_vertical: string | null
          purchase_count: number | null
          role: string | null
          sms_opt_in: boolean | null
          specific_vertical: string | null
          state: string | null
          whatsapp_opt_in: boolean | null
        }
        Relationships: []
      }
      users_unified: {
        Row: {
          city: string | null
          country: string | null
          created_at: string | null
          email: string | null
          first_purchase_at: string | null
          full_name: string | null
          id: string | null
          is_legacy: boolean | null
          is_real: boolean | null
          last_active_at: string | null
          last_purchase_at: string | null
          legacy_source: string | null
          lifetime_revenue_inr: number | null
          member_number: number | null
          phone: string | null
          program_vertical: string | null
          purchase_count: number | null
          role: string | null
          specific_vertical: string | null
          state: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_dashboard_combined: {
        Args: { p_from: string; p_to: string }
        Returns: {
          active_enrolments_total: number
          active_offerings_count: number
          enrolments_in_window: number
          legacy_buyers_in_window: number
          legacy_revenue_inr: number
          live_revenue_inr: number
          new_students_in_window: number
          order_count_in_window: number
          total_revenue_inr_in_window: number
          total_students_unified: number
        }[]
      }
      admin_dashboard_metrics: {
        Args: {
          p_from?: string
          p_max_courses?: number
          p_max_days?: number
          p_recent_limit?: number
          p_to?: string
        }
        Returns: Json
      }
      check_and_increment_rate_limit: {
        Args: { p_key: string; p_max_count: number; p_window_seconds: number }
        Returns: boolean
      }
      claim_event_seat: {
        Args: {
          p_amount?: number
          p_event_id: string
          p_payment_id?: string
          p_user_id: string
        }
        Returns: string
      }
      cleanup_deleted_users: {
        Args: never
        Returns: {
          deleted_email: string
          deleted_user_id: string
        }[]
      }
      create_team_api_key: {
        Args: {
          p_created_by?: string
          p_expires_at?: string
          p_name: string
          p_scope: string
        }
        Returns: {
          hint: string
          key_id: string
          plaintext: string
        }[]
      }
      daily_signups_combined: {
        Args: { p_from: string; p_to: string }
        Returns: {
          day: string
          legacy_buyers: number
          new_users: number
          total: number
        }[]
      }
      delete_email:
        | { Args: { p_msg_id: number }; Returns: boolean }
        | { Args: { message_id: number; queue_name: string }; Returns: boolean }
      emit_event: {
        Args: { p_event_type: string; p_payload: Json }
        Returns: undefined
      }
      enqueue_email:
        | {
            Args: {
              p_from?: string
              p_html: string
              p_reply_to?: string
              p_subject: string
              p_to: string
            }
            Returns: number
          }
        | { Args: { payload: Json; queue_name: string }; Returns: number }
      find_login_identity: {
        Args: { p_email?: string; p_phone?: string }
        Returns: {
          email: string
          id: string
          phone: string
        }[]
      }
      get_attendance_pct: {
        Args: { p_offering_id: string; p_user_id: string }
        Returns: number
      }
      get_cohort_progress: {
        Args: { p_offering_id: string; p_user_id: string }
        Returns: {
          assignment_due_at: string
          assignment_prompt: string
          attendance_marked: boolean
          attended: boolean
          batch_label: string
          cohort_batch_id: string
          description: string
          ends_on: string
          feedback_session_at: string
          live_session_at: string
          live_session_id: string
          live_session_title: string
          live_session_zoom_link: string
          starts_on: string
          submission_feedback: string
          submission_id: string
          submission_rating: number
          submission_status: string
          submission_submitted_at: string
          theme: string
          week_id: string
          week_number: number
          week_status: string
        }[]
      }
      get_event_registration_count: {
        Args: { p_event_id: string }
        Returns: number
      }
      get_event_venue_link: { Args: { p_event_id: string }; Returns: string }
      get_live_session_zoom_link: {
        Args: { p_session_id: string }
        Returns: string
      }
      has_course_access: { Args: { p_course_id: string }; Returns: boolean }
      has_offering_learnings_access: {
        Args: { p_offering_id: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_offering_active: { Args: { p_offering_id: string }; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      is_studio_enabled: { Args: { p_user_id?: string }; Returns: boolean }
      issue_certificate: {
        Args: {
          p_course_id: string
          p_image_url: string
          p_template_id: string
          p_variable_values: Json
        }
        Returns: Json
      }
      lead_capture: {
        Args: {
          p_custom_fields?: Json
          p_email: string
          p_full_name: string
          p_phone: string
          p_source: string
          p_utm?: Json
        }
        Returns: string
      }
      move_to_dlq:
        | { Args: { p_error?: string; p_msg_id: number }; Returns: number }
        | {
            Args: {
              dlq_name: string
              message_id: number
              payload: Json
              source_queue: string
            }
            Returns: number
          }
      next_certificate_number: { Args: never; Returns: string }
      offering_performance_in_range: {
        Args: { p_from: string; p_to: string }
        Returns: {
          active_enrolments: number
          legacy_orders_in_window: number
          legacy_revenue_in_window: number
          live_orders_in_window: number
          live_revenue_in_window: number
          offering_id: string
          offering_slug: string
          offering_title: string
          offering_type: string
          total_enrolments: number
          total_orders_in_window: number
          total_revenue_in_window: number
        }[]
      }
      purge_old_rate_limits: { Args: never; Returns: undefined }
      read_email_batch:
        | {
            Args: { p_batch_size?: number }
            Returns: {
              message: Json
              msg_id: number
            }[]
          }
        | {
            Args: { batch_size: number; queue_name: string; vt: number }
            Returns: {
              message: Json
              msg_id: number
              read_ct: number
            }[]
          }
      redeem_coupon: { Args: { p_coupon_id: string }; Returns: boolean }
      request_account_deletion: { Args: never; Returns: Json }
      revenue_by_offering_in_range: {
        Args: { p_from: string; p_to: string }
        Returns: {
          legacy_order_count: number
          legacy_paid_inr: number
          live_order_count: number
          live_paid_inr: number
          offering_id: string
          offering_slug: string
          offering_title: string
          offering_type: string
          total_order_count: number
          total_paid_inr: number
        }[]
      }
      revenue_by_user_in_range: {
        Args: { p_from: string; p_limit?: number; p_to: string }
        Returns: {
          email: string
          full_name: string
          order_count: number
          paid_inr: number
          phone: string
          user_id: string
        }[]
      }
      revenue_daily: {
        Args: { p_from: string; p_to: string }
        Returns: {
          day: string
          legacy_paid_inr: number
          live_paid_inr: number
          order_count: number
          total_paid_inr: number
        }[]
      }
      revenue_in_range: {
        Args: { p_from: string; p_to: string }
        Returns: {
          legacy_order_count: number
          legacy_paid_inr: number
          legacy_unique_buyers: number
          live_order_count: number
          live_paid_inr: number
          live_unique_buyers: number
          refunded_inr: number
          total_order_count: number
          total_paid_inr: number
        }[]
      }
      set_onboarding_profile: {
        Args: { p_email: string; p_full_name: string }
        Returns: undefined
      }
      submit_quiz: {
        Args: { p_answers: Json; p_quiz_id: string }
        Returns: Json
      }
      unmapped_legacy_revenue: {
        Args: { p_from: string; p_to: string }
        Returns: {
          first_purchase_at: string
          last_purchase_at: string
          legacy_program_name: string
          paid_inr: number
          rows_count: number
        }[]
      }
      user_is_certificate_eligible: {
        Args: { p_offering_id: string; p_user_id: string }
        Returns: boolean
      }
      verify_team_api_key: {
        Args: { p_plaintext: string }
        Returns: {
          created_by: string
          key_id: string
          scope: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
