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
            referencedRelation: "public_user_profiles"
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
          attendance_threshold_pct: number | null
          balance_deadline_days: number | null
          banner_url: string | null
          calendly_url: string | null
          checkout_bullets: Json | null
          checkout_guarantee_text: string | null
          checkout_testimonials: Json | null
          cohort_sessions: Json | null
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
          attendance_threshold_pct?: number | null
          balance_deadline_days?: number | null
          banner_url?: string | null
          calendly_url?: string | null
          checkout_bullets?: Json | null
          checkout_guarantee_text?: string | null
          checkout_testimonials?: Json | null
          cohort_sessions?: Json | null
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
          attendance_threshold_pct?: number | null
          balance_deadline_days?: number | null
          banner_url?: string | null
          calendly_url?: string | null
          checkout_bullets?: Json | null
          checkout_guarantee_text?: string | null
          checkout_testimonials?: Json | null
          cohort_sessions?: Json | null
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
          payment_type: string | null
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
          application_id?: string | null
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
          payment_type?: string | null
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
          application_id?: string | null
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
          payment_type?: string | null
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
        ]
      }
      phone_otp_attempts: {
        Row: {
          attempts: number
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          otp_hash: string
          phone: string
        }
        Insert: {
          attempts?: number
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          otp_hash: string
          phone: string
        }
        Update: {
          attempts?: number
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          otp_hash?: string
          phone?: string
        }
        Relationships: []
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
          deleted_at: string | null
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
          deleted_at?: string | null
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
          deleted_at?: string | null
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
    }
    Functions: {
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
      cleanup_deleted_users: {
        Args: never
        Returns: {
          deleted_email: string
          deleted_user_id: string
        }[]
      }
      cleanup_phone_otps: { Args: never; Returns: undefined }
      delete_email:
        | { Args: { p_msg_id: number }; Returns: boolean }
        | { Args: { message_id: number; queue_name: string }; Returns: boolean }
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
      is_admin: { Args: never; Returns: boolean }
      is_offering_active: { Args: { p_offering_id: string }; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      issue_certificate: {
        Args: {
          p_course_id: string
          p_image_url: string
          p_template_id: string
          p_variable_values: Json
        }
        Returns: Json
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
      submit_quiz: {
        Args: { p_answers: Json; p_quiz_id: string }
        Returns: Json
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
