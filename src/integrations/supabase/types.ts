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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
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
            referencedRelation: "users"
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
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_comments: {
        Row: {
          chapter_id: string
          comment_text: string
          created_at: string
          id: string
          parent_comment_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          chapter_id: string
          comment_text: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          chapter_id?: string
          comment_text?: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_comments_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "chapter_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
            referencedRelation: "users"
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
            referencedRelation: "users"
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
            referencedRelation: "users"
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
          media_url: string | null
          original_filename: string | null
          section_id: string
          sort_order: number
          subtitle_url: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
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
          media_url?: string | null
          original_filename?: string | null
          section_id: string
          sort_order?: number
          subtitle_url?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
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
          media_url?: string | null
          original_filename?: string | null
          section_id?: string
          sort_order?: number
          subtitle_url?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
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
            referencedRelation: "users"
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
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          content_text: string
          course_tag_id: string | null
          created_at: string
          id: string
          is_admin_post: boolean
          is_pinned: boolean
          media_urls: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content_text: string
          course_tag_id?: string | null
          created_at?: string
          id?: string
          is_admin_post?: boolean
          is_pinned?: boolean
          media_urls?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content_text?: string
          course_tag_id?: string | null
          created_at?: string
          id?: string
          is_admin_post?: boolean
          is_pinned?: boolean
          media_urls?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_course_tag_id_fkey"
            columns: ["course_tag_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
      course_reviews: {
        Row: {
          course_id: string
          created_at: string
          id: string
          rating: number
          review_text: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          rating: number
          review_text?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          rating?: number
          review_text?: string | null
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
            referencedRelation: "users"
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
          hero_image_url: string | null
          id: string
          instructor_avatar_url: string | null
          instructor_bio: string | null
          instructor_display_name: string | null
          language: string | null
          level: string | null
          primary_offering_id: string | null
          product_tier: string
          published_at: string | null
          rating_avg: number | null
          rating_count: number | null
          show_as_locked: boolean
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
          hero_image_url?: string | null
          id?: string
          instructor_avatar_url?: string | null
          instructor_bio?: string | null
          instructor_display_name?: string | null
          language?: string | null
          level?: string | null
          primary_offering_id?: string | null
          product_tier?: string
          published_at?: string | null
          rating_avg?: number | null
          rating_count?: number | null
          show_as_locked?: boolean
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
          hero_image_url?: string | null
          id?: string
          instructor_avatar_url?: string | null
          instructor_bio?: string | null
          instructor_display_name?: string | null
          language?: string | null
          level?: string | null
          primary_offering_id?: string | null
          product_tier?: string
          published_at?: string | null
          rating_avg?: number | null
          rating_count?: number | null
          show_as_locked?: boolean
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
            referencedRelation: "users"
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
          autopay_active: boolean
          created_at: string
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
          updated_at: string
          user_id: string
        }
        Insert: {
          autopay_active?: boolean
          created_at?: string
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
          updated_at?: string
          user_id: string
        }
        Update: {
          autopay_active?: boolean
          created_at?: string
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
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrolments_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
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
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
            foreignKeyName: "event_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
            referencedRelation: "users"
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
            referencedRelation: "users"
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
          starts_at: string
          status: string
          title: string
          updated_at: string
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
          starts_at: string
          status?: string
          title: string
          updated_at?: string
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
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
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
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
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
            referencedRelation: "users"
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
          banner_url: string | null
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
          price_inr: number
          razorpay_plan_id: string | null
          refund_policy_days: number | null
          slug: string
          status: string
          subscription_period: string | null
          subtitle: string | null
          thumbnail_url: string | null
          title: string
          type: string
          updated_at: string
          validity_days: number | null
        }
        Insert: {
          banner_url?: string | null
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
          price_inr: number
          razorpay_plan_id?: string | null
          refund_policy_days?: number | null
          slug: string
          status?: string
          subscription_period?: string | null
          subtitle?: string | null
          thumbnail_url?: string | null
          title: string
          type: string
          updated_at?: string
          validity_days?: number | null
        }
        Update: {
          banner_url?: string | null
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
          price_inr?: number
          razorpay_plan_id?: string | null
          refund_policy_days?: number | null
          slug?: string
          status?: string
          subscription_period?: string | null
          subtitle?: string | null
          thumbnail_url?: string | null
          title?: string
          type?: string
          updated_at?: string
          validity_days?: number | null
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
            referencedRelation: "users"
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
            referencedRelation: "users"
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
          bump_offering_ids: string[] | null
          captured_at: string | null
          coupon_id: string | null
          created_at: string
          custom_field_values: Json | null
          discount_inr: number
          gst_inr: number
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          offering_id: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          refunded_at: string | null
          status: string
          subtotal_inr: number
          total_inr: number
          updated_at: string
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          bump_offering_ids?: string[] | null
          captured_at?: string | null
          coupon_id?: string | null
          created_at?: string
          custom_field_values?: Json | null
          discount_inr?: number
          gst_inr?: number
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          offering_id: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          refunded_at?: string | null
          status?: string
          subtotal_inr: number
          total_inr: number
          updated_at?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          bump_offering_ids?: string[] | null
          captured_at?: string | null
          coupon_id?: string | null
          created_at?: string
          custom_field_values?: Json | null
          discount_inr?: number
          gst_inr?: number
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          offering_id?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          refunded_at?: string | null
          status?: string
          subtotal_inr?: number
          total_inr?: number
          updated_at?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
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
            referencedRelation: "users"
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
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
      users: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          last_active_at: string | null
          member_number: number
          occupation: string | null
          onboarded_at: string | null
          open_to_collaborate: boolean | null
          phone: string | null
          role: string
          skills: string[] | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          last_active_at?: string | null
          member_number?: number
          occupation?: string | null
          onboarded_at?: string | null
          open_to_collaborate?: boolean | null
          phone?: string | null
          role?: string
          skills?: string[] | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          last_active_at?: string | null
          member_number?: number
          occupation?: string | null
          onboarded_at?: string | null
          open_to_collaborate?: boolean | null
          phone?: string | null
          role?: string
          skills?: string[] | null
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
          user_id: string
          vdocipher_video_id: string
        }
        Insert: {
          chapter_id: string
          id?: string
          ip_address?: unknown
          otp_issued_at?: string
          user_agent?: string | null
          user_id: string
          vdocipher_video_id: string
        }
        Update: {
          chapter_id?: string
          id?: string
          ip_address?: unknown
          otp_issued_at?: string
          user_agent?: string | null
          user_id?: string
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
            referencedRelation: "users"
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
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_course_access: { Args: { p_course_id: string }; Returns: boolean }
      increment_coupon_usage: {
        Args: { p_coupon_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
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
