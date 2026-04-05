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
      courses: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          drm_enabled: boolean
          duration_minutes: number | null
          hero_image_url: string | null
          id: string
          instructor_avatar_url: string | null
          instructor_bio: string | null
          instructor_display_name: string | null
          language: string | null
          level: string | null
          published_at: string | null
          rating_avg: number | null
          rating_count: number | null
          show_as_locked: boolean
          slug: string
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
          description?: string | null
          drm_enabled?: boolean
          duration_minutes?: number | null
          hero_image_url?: string | null
          id?: string
          instructor_avatar_url?: string | null
          instructor_bio?: string | null
          instructor_display_name?: string | null
          language?: string | null
          level?: string | null
          published_at?: string | null
          rating_avg?: number | null
          rating_count?: number | null
          show_as_locked?: boolean
          slug: string
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
          description?: string | null
          drm_enabled?: boolean
          duration_minutes?: number | null
          hero_image_url?: string | null
          id?: string
          instructor_avatar_url?: string | null
          instructor_bio?: string | null
          instructor_display_name?: string | null
          language?: string | null
          level?: string | null
          published_at?: string | null
          rating_avg?: number | null
          rating_count?: number | null
          show_as_locked?: boolean
          slug?: string
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
      offerings: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          gst_mode: string
          gst_rate: number | null
          id: string
          price_inr: number
          razorpay_plan_id: string | null
          refund_policy_days: number | null
          slug: string
          status: string
          subscription_period: string | null
          thumbnail_url: string | null
          title: string
          type: string
          updated_at: string
          validity_days: number | null
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          gst_mode?: string
          gst_rate?: number | null
          id?: string
          price_inr: number
          razorpay_plan_id?: string | null
          refund_policy_days?: number | null
          slug: string
          status?: string
          subscription_period?: string | null
          thumbnail_url?: string | null
          title: string
          type: string
          updated_at?: string
          validity_days?: number | null
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          gst_mode?: string
          gst_rate?: number | null
          id?: string
          price_inr?: number
          razorpay_plan_id?: string | null
          refund_policy_days?: number | null
          slug?: string
          status?: string
          subscription_period?: string | null
          thumbnail_url?: string | null
          title?: string
          type?: string
          updated_at?: string
          validity_days?: number | null
        }
        Relationships: []
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
          user_id: string
        }
        Insert: {
          bump_offering_ids?: string[] | null
          captured_at?: string | null
          coupon_id?: string | null
          created_at?: string
          custom_field_values?: Json | null
          discount_inr?: number
          gst_inr?: number
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
          user_id: string
        }
        Update: {
          bump_offering_ids?: string[] | null
          captured_at?: string | null
          coupon_id?: string | null
          created_at?: string
          custom_field_values?: Json | null
          discount_inr?: number
          gst_inr?: number
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
          user_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
