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
      certificates: {
        Row: {
          certificate_url: string | null
          completion_pct: number
          course_id: string
          id: string
          issued_at: string
          user_id: string
        }
        Insert: {
          certificate_url?: string | null
          completion_pct?: number
          course_id: string
          id?: string
          issued_at?: string
          user_id: string
        }
        Update: {
          certificate_url?: string | null
          completion_pct?: number
          course_id?: string
          id?: string
          issued_at?: string
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
        ]
      }
      coupon_codes: {
        Row: {
          applicable_course_ids: string[] | null
          code: string
          created_at: string
          current_uses: number
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id: string
          is_active: boolean
          max_uses: number | null
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          applicable_course_ids?: string[] | null
          code: string
          created_at?: string
          current_uses?: number
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          applicable_course_ids?: string[] | null
          code?: string
          created_at?: string
          current_uses?: number
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      course_access_grants: {
        Row: {
          created_at: string
          granted_course_id: string
          id: string
          source_course_id: string
        }
        Insert: {
          created_at?: string
          granted_course_id: string
          id?: string
          source_course_id: string
        }
        Update: {
          created_at?: string
          granted_course_id?: string
          id?: string
          source_course_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_access_grants_granted_course_id_fkey"
            columns: ["granted_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_access_grants_source_course_id_fkey"
            columns: ["source_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_modules: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_schedules: {
        Row: {
          course_id: string
          created_at: string
          day_of_week: number
          end_time: string | null
          id: string
          is_active: boolean
          label: string | null
          slug: string | null
          start_time: string
          updated_at: string
          zoom_link: string | null
        }
        Insert: {
          course_id: string
          created_at?: string
          day_of_week: number
          end_time?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          slug?: string | null
          start_time: string
          updated_at?: string
          zoom_link?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          slug?: string | null
          start_time?: string
          updated_at?: string
          zoom_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_schedules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          access_tags: string[] | null
          category: string
          certificate_enabled: boolean
          certificate_threshold: number | null
          course_type: Database["public"]["Enums"]["course_type"]
          created_at: string
          description: string | null
          difficulty: Database["public"]["Enums"]["difficulty_level"]
          drip_enabled: boolean
          drip_interval_days: number | null
          estimated_duration: string | null
          id: string
          instructor_id: string | null
          instructor_name: string
          is_free: boolean
          is_recurring: boolean
          max_students: number | null
          payment_page_url: string | null
          price: number
          rating: number
          recurrence_rule: Json | null
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["content_status"]
          student_count: number
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          zoom_link: string | null
        }
        Insert: {
          access_tags?: string[] | null
          category?: string
          certificate_enabled?: boolean
          certificate_threshold?: number | null
          course_type?: Database["public"]["Enums"]["course_type"]
          created_at?: string
          description?: string | null
          difficulty?: Database["public"]["Enums"]["difficulty_level"]
          drip_enabled?: boolean
          drip_interval_days?: number | null
          estimated_duration?: string | null
          id?: string
          instructor_id?: string | null
          instructor_name?: string
          is_free?: boolean
          is_recurring?: boolean
          max_students?: number | null
          payment_page_url?: string | null
          price?: number
          rating?: number
          recurrence_rule?: Json | null
          short_description?: string | null
          slug: string
          status?: Database["public"]["Enums"]["content_status"]
          student_count?: number
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          zoom_link?: string | null
        }
        Update: {
          access_tags?: string[] | null
          category?: string
          certificate_enabled?: boolean
          certificate_threshold?: number | null
          course_type?: Database["public"]["Enums"]["course_type"]
          created_at?: string
          description?: string | null
          difficulty?: Database["public"]["Enums"]["difficulty_level"]
          drip_enabled?: boolean
          drip_interval_days?: number | null
          estimated_duration?: string | null
          id?: string
          instructor_id?: string | null
          instructor_name?: string
          is_free?: boolean
          is_recurring?: boolean
          max_students?: number | null
          payment_page_url?: string | null
          price?: number
          rating?: number
          recurrence_rule?: Json | null
          short_description?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["content_status"]
          student_count?: number
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          zoom_link?: string | null
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          completed_at: string | null
          course_id: string
          created_at: string
          enrolled_at: string
          id: string
          schedule_id: string | null
          source_course_id: string | null
          status: Database["public"]["Enums"]["enrollment_status"]
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          created_at?: string
          enrolled_at?: string
          id?: string
          schedule_id?: string | null
          source_course_id?: string | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          user_id: string
        }
        Update: {
          completed_at?: string | null
          course_id?: string
          created_at?: string
          enrolled_at?: string
          id?: string
          schedule_id?: string | null
          source_course_id?: string | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "course_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_source_course_id_fkey"
            columns: ["source_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed_at: string | null
          course_id: string
          created_at: string
          id: string
          lesson_id: string
          progress_pct: number
          status: Database["public"]["Enums"]["progress_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          created_at?: string
          id?: string
          lesson_id: string
          progress_pct?: number
          status?: Database["public"]["Enums"]["progress_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          course_id?: string
          created_at?: string
          id?: string
          lesson_id?: string
          progress_pct?: number
          status?: Database["public"]["Enums"]["progress_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
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
          course_id: string
          created_at: string
          description: string | null
          duration: string | null
          file_url: string | null
          id: string
          is_free: boolean
          module_id: string
          sort_order: number
          title: string
          type: Database["public"]["Enums"]["lesson_type"]
          updated_at: string
          video_url: string | null
        }
        Insert: {
          content?: string | null
          course_id: string
          created_at?: string
          description?: string | null
          duration?: string | null
          file_url?: string | null
          id?: string
          is_free?: boolean
          module_id: string
          sort_order?: number
          title: string
          type?: Database["public"]["Enums"]["lesson_type"]
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          content?: string | null
          course_id?: string
          created_at?: string
          description?: string | null
          duration?: string | null
          file_url?: string | null
          id?: string
          is_free?: boolean
          module_id?: string
          sort_order?: number
          title?: string
          type?: Database["public"]["Enums"]["lesson_type"]
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          course_id: string | null
          created_at: string
          hours_before: number | null
          id: string
          is_active: boolean
          subject: string | null
          template_body: string
          trigger_type: Database["public"]["Enums"]["notification_trigger"]
          updated_at: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          course_id?: string | null
          created_at?: string
          hours_before?: number | null
          id?: string
          is_active?: boolean
          subject?: string | null
          template_body: string
          trigger_type: Database["public"]["Enums"]["notification_trigger"]
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          course_id?: string | null
          created_at?: string
          hours_before?: number | null
          id?: string
          is_active?: boolean
          subject?: string | null
          template_body?: string
          trigger_type?: Database["public"]["Enums"]["notification_trigger"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_projects: {
        Row: {
          appreciations: number
          category: string
          created_at: string
          description: string | null
          duration: string | null
          id: string
          is_pinned: boolean
          thumbnail_url: string | null
          title: string
          tools_used: string[] | null
          updated_at: string
          user_id: string
          video_url: string | null
          views: number
        }
        Insert: {
          appreciations?: number
          category?: string
          created_at?: string
          description?: string | null
          duration?: string | null
          id?: string
          is_pinned?: boolean
          thumbnail_url?: string | null
          title: string
          tools_used?: string[] | null
          updated_at?: string
          user_id: string
          video_url?: string | null
          views?: number
        }
        Update: {
          appreciations?: number
          category?: string
          created_at?: string
          description?: string | null
          duration?: string | null
          id?: string
          is_pinned?: boolean
          thumbnail_url?: string | null
          title?: string
          tools_used?: string[] | null
          updated_at?: string
          user_id?: string
          video_url?: string | null
          views?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          availability: string | null
          avatar_url: string | null
          bio: string | null
          city: string | null
          created_at: string
          experience: string | null
          goal: string | null
          has_completed_onboarding: boolean
          id: string
          interests: string[] | null
          name: string
          phone: string | null
          roles: string[] | null
          skills: string[] | null
          social_links: Json | null
          updated_at: string
        }
        Insert: {
          availability?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          experience?: string | null
          goal?: string | null
          has_completed_onboarding?: boolean
          id: string
          interests?: string[] | null
          name?: string
          phone?: string | null
          roles?: string[] | null
          skills?: string[] | null
          social_links?: Json | null
          updated_at?: string
        }
        Update: {
          availability?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          experience?: string | null
          goal?: string | null
          has_completed_onboarding?: boolean
          id?: string
          interests?: string[] | null
          name?: string
          phone?: string | null
          roles?: string[] | null
          skills?: string[] | null
          social_links?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          coupon_id: string | null
          created_at: string
          id: string
          is_active: boolean
          successful_referrals: number
          total_referrals: number
          updated_at: string
          user_id: string
        }
        Insert: {
          code: string
          coupon_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          successful_referrals?: number
          total_referrals?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string
          coupon_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          successful_referrals?: number
          total_referrals?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupon_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_redemptions: {
        Row: {
          course_id: string | null
          id: string
          redeemed_at: string
          referral_code_id: string
          referred_user_id: string
        }
        Insert: {
          course_id?: string | null
          id?: string
          redeemed_at?: string
          referral_code_id: string
          referred_user_id: string
        }
        Update: {
          course_id?: string | null
          id?: string
          redeemed_at?: string
          referral_code_id?: string
          referred_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_redemptions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_redemptions_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_notifications: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          enrollment_id: string | null
          id: string
          scheduled_for: string
          sent_at: string | null
          template_id: string | null
          user_id: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          enrollment_id?: string | null
          id?: string
          scheduled_for: string
          sent_at?: string | null
          template_id?: string | null
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          enrollment_id?: string | null
          id?: string
          scheduled_for?: string
          sent_at?: string | null
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_notifications_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_notifications_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      waitlists: {
        Row: {
          course_id: string
          created_at: string
          email: string
          id: string
          name: string
          notified: boolean
          phone: string | null
          schedule_id: string | null
          user_id: string | null
        }
        Insert: {
          course_id: string
          created_at?: string
          email: string
          id?: string
          name: string
          notified?: boolean
          phone?: string | null
          schedule_id?: string | null
          user_id?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          notified?: boolean
          phone?: string | null
          schedule_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlists_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlists_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "course_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_student_engagement_score: {
        Args: { _user_id: string }
        Returns: Json
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "student" | "mentor" | "super_admin"
      content_status: "draft" | "published" | "archived"
      course_type: "masterclass" | "workshop" | "cohort"
      difficulty_level: "beginner" | "intermediate" | "advanced"
      discount_type: "percentage" | "fixed"
      enrollment_status: "active" | "completed" | "cancelled" | "expired"
      lesson_type: "video" | "text" | "quiz" | "assignment" | "pdf"
      notification_channel: "email" | "whatsapp"
      notification_trigger:
        | "reminder"
        | "completion"
        | "enrollment"
        | "drip_release"
      progress_status: "not_started" | "in_progress" | "completed"
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
      app_role: ["student", "mentor", "super_admin"],
      content_status: ["draft", "published", "archived"],
      course_type: ["masterclass", "workshop", "cohort"],
      difficulty_level: ["beginner", "intermediate", "advanced"],
      discount_type: ["percentage", "fixed"],
      enrollment_status: ["active", "completed", "cancelled", "expired"],
      lesson_type: ["video", "text", "quiz", "assignment", "pdf"],
      notification_channel: ["email", "whatsapp"],
      notification_trigger: [
        "reminder",
        "completion",
        "enrollment",
        "drip_release",
      ],
      progress_status: ["not_started", "in_progress", "completed"],
    },
  },
} as const
