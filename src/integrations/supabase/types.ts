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
