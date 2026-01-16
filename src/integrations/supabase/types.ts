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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      documentation_verifications: {
        Row: {
          completed_at: string | null
          created_at: string
          documentation_preview: string | null
          documentation_source: string
          documentation_url: string | null
          failed_steps: number
          id: string
          passed_steps: number
          project_id: string
          status: string
          total_steps: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          documentation_preview?: string | null
          documentation_source: string
          documentation_url?: string | null
          failed_steps?: number
          id?: string
          passed_steps?: number
          project_id: string
          status?: string
          total_steps?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          documentation_preview?: string | null
          documentation_source?: string
          documentation_url?: string | null
          failed_steps?: number
          id?: string
          passed_steps?: number
          project_id?: string
          status?: string
          total_steps?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentation_verifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_tests: {
        Row: {
          azure_devops_id: string | null
          created_at: string
          estimated_cost: number | null
          execution_time_ms: number | null
          expected_result: string | null
          id: string
          last_run_at: string | null
          priority: string
          project_id: string | null
          prompt: string
          result_reasoning: string | null
          result_summary: string | null
          source_type: string | null
          status: string
          step_count: number | null
          task_id: string | null
          test_suite_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          azure_devops_id?: string | null
          created_at?: string
          estimated_cost?: number | null
          execution_time_ms?: number | null
          expected_result?: string | null
          id?: string
          last_run_at?: string | null
          priority?: string
          project_id?: string | null
          prompt: string
          result_reasoning?: string | null
          result_summary?: string | null
          source_type?: string | null
          status?: string
          step_count?: number | null
          task_id?: string | null
          test_suite_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          azure_devops_id?: string | null
          created_at?: string
          estimated_cost?: number | null
          execution_time_ms?: number | null
          expected_result?: string | null
          id?: string
          last_run_at?: string | null
          priority?: string
          project_id?: string | null
          prompt?: string
          result_reasoning?: string | null
          result_summary?: string | null
          source_type?: string | null
          status?: string
          step_count?: number | null
          task_id?: string | null
          test_suite_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_tests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_tests_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_tests_test_suite_id_fkey"
            columns: ["test_suite_id"]
            isOneToOne: false
            referencedRelation: "test_suites"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          prompt: string
          steps: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          prompt: string
          steps?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          prompt?: string
          steps?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      operation_trainings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          source_content: string | null
          source_type: string | null
          structured_instructions: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          source_content?: string | null
          source_type?: string | null
          structured_instructions?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          source_content?: string | null
          source_type?: string | null
          structured_instructions?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_credentials: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          password: string
          project_id: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          password: string
          project_id: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          password?: string
          project_id?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_credentials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          base_url: string | null
          batch_delay_seconds: number | null
          browser_profile_id: string | null
          created_at: string
          description: string | null
          id: string
          max_steps: number
          name: string
          record_video: boolean
          setup_prompt: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          base_url?: string | null
          batch_delay_seconds?: number | null
          browser_profile_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          max_steps?: number
          name: string
          record_video?: boolean
          setup_prompt?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          base_url?: string | null
          batch_delay_seconds?: number | null
          browser_profile_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          max_steps?: number
          name?: string
          record_video?: boolean
          setup_prompt?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          browser_use_task_id: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          live_url: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          prompt: string
          recordings: string[] | null
          result: Json | null
          screenshots: string[] | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          step_count: number | null
          steps: Json | null
          task_type: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          browser_use_task_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          live_url?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          prompt: string
          recordings?: string[] | null
          result?: Json | null
          screenshots?: string[] | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          step_count?: number | null
          steps?: Json | null
          task_type?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          browser_use_task_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          live_url?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          prompt?: string
          recordings?: string[] | null
          result?: Json | null
          screenshots?: string[] | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          step_count?: number | null
          steps?: Json | null
          task_type?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      test_batch_runs: {
        Row: {
          batch_size: number | null
          completed_at: string | null
          completed_tests: number | null
          created_at: string | null
          current_test_id: string | null
          error_message: string | null
          failed_tests: number | null
          id: string
          passed_tests: number | null
          paused: boolean | null
          started_at: string | null
          status: string | null
          test_ids: string[]
          total_tests: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          batch_size?: number | null
          completed_at?: string | null
          completed_tests?: number | null
          created_at?: string | null
          current_test_id?: string | null
          error_message?: string | null
          failed_tests?: number | null
          id?: string
          passed_tests?: number | null
          paused?: boolean | null
          started_at?: string | null
          status?: string | null
          test_ids: string[]
          total_tests: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          batch_size?: number | null
          completed_at?: string | null
          completed_tests?: number | null
          created_at?: string | null
          current_test_id?: string | null
          error_message?: string | null
          failed_tests?: number | null
          id?: string
          passed_tests?: number | null
          paused?: boolean | null
          started_at?: string | null
          status?: string | null
          test_ids?: string[]
          total_tests?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      test_cases: {
        Row: {
          created_at: string
          expected_result: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          prompt: string
          test_suite_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expected_result?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          prompt: string
          test_suite_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expected_result?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          prompt?: string
          test_suite_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_cases_test_suite_id_fkey"
            columns: ["test_suite_id"]
            isOneToOne: false
            referencedRelation: "test_suites"
            referencedColumns: ["id"]
          },
        ]
      }
      test_suites: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_suites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_steps: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          result: string | null
          status: string
          step_description: string
          step_number: number
          task_id: string | null
          verification_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          result?: string | null
          status?: string
          step_description: string
          step_number: number
          task_id?: string | null
          verification_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          result?: string | null
          status?: string
          step_description?: string
          step_number?: number
          task_id?: string | null
          verification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_steps_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_steps_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "documentation_verifications"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      task_priority: "low" | "medium" | "high"
      task_status: "pending" | "running" | "completed" | "failed" | "cancelled"
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
      task_priority: ["low", "medium", "high"],
      task_status: ["pending", "running", "completed", "failed", "cancelled"],
    },
  },
} as const
