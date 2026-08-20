export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
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
  public: {
    Tables: {
      admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credential_catalogue: {
        Row: {
          active: boolean
          course_url: string | null
          created_at: string
          id: string
          kind: string
          label: string
          platform: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          course_url?: string | null
          created_at?: string
          id?: string
          kind: string
          label: string
          platform: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          course_url?: string | null
          created_at?: string
          id?: string
          kind?: string
          label?: string
          platform?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      practitioner_contacts: {
        Row: {
          contact_email: string
          contact_note: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          updated_at: string
        }
        Insert: {
          contact_email: string
          contact_note?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          contact_email?: string
          contact_note?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      practitioner_review_notes: {
        Row: {
          created_at: string
          note: string
          practitioner_id: string
          updated_at: string
          written_at: string
          written_by: string | null
        }
        Insert: {
          created_at?: string
          note: string
          practitioner_id: string
          updated_at?: string
          written_at?: string
          written_by?: string | null
        }
        Update: {
          created_at?: string
          note?: string
          practitioner_id?: string
          updated_at?: string
          written_at?: string
          written_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practitioner_review_notes_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: true
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
        ]
      }
      practitioners: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          availability: string | null
          bio: string | null
          booking_url: string | null
          contact_id: string
          country_code: string | null
          created_at: string
          focus: string[]
          github_url: string | null
          headline: string | null
          id: string
          linkedin_url: string | null
          location: string | null
          name: string
          owner_assigned_at: string | null
          owner_assigned_by: string | null
          status: Database["public"]["Enums"]["practitioner_status"]
          updated_at: string
          user_id: string | null
          website_url: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          availability?: string | null
          bio?: string | null
          booking_url?: string | null
          contact_id: string
          country_code?: string | null
          created_at?: string
          focus?: string[]
          github_url?: string | null
          headline?: string | null
          id?: string
          linkedin_url?: string | null
          location?: string | null
          name: string
          owner_assigned_at?: string | null
          owner_assigned_by?: string | null
          status?: Database["public"]["Enums"]["practitioner_status"]
          updated_at?: string
          user_id?: string | null
          website_url?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          availability?: string | null
          bio?: string | null
          booking_url?: string | null
          contact_id?: string
          country_code?: string | null
          created_at?: string
          focus?: string[]
          github_url?: string | null
          headline?: string | null
          id?: string
          linkedin_url?: string | null
          location?: string | null
          name?: string
          owner_assigned_at?: string | null
          owner_assigned_by?: string | null
          status?: Database["public"]["Enums"]["practitioner_status"]
          updated_at?: string
          user_id?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practitioners_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "practitioner_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalogue: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_practitioner: {
        Args: { profile_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          availability: string | null
          bio: string | null
          booking_url: string | null
          contact_id: string
          country_code: string | null
          created_at: string
          focus: string[]
          github_url: string | null
          headline: string | null
          id: string
          linkedin_url: string | null
          location: string | null
          name: string
          owner_assigned_at: string | null
          owner_assigned_by: string | null
          status: Database["public"]["Enums"]["practitioner_status"]
          updated_at: string
          user_id: string | null
          website_url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "practitioners"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      contact_is_unattached: { Args: { contact: string }; Returns: boolean }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      owns_contact: { Args: { contact: string }; Returns: boolean }
      owns_profile: { Args: { profile_id: string }; Returns: boolean }
      owns_profile_for_contact: { Args: { contact: string }; Returns: boolean }
      reject_practitioner: {
        Args: { note: string; profile_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          availability: string | null
          bio: string | null
          booking_url: string | null
          contact_id: string
          country_code: string | null
          created_at: string
          focus: string[]
          github_url: string | null
          headline: string | null
          id: string
          linkedin_url: string | null
          location: string | null
          name: string
          owner_assigned_at: string | null
          owner_assigned_by: string | null
          status: Database["public"]["Enums"]["practitioner_status"]
          updated_at: string
          user_id: string | null
          website_url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "practitioners"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      practitioner_status: "pending" | "approved" | "rejected" | "withdrawn"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      practitioner_status: ["pending", "approved", "rejected", "withdrawn"],
    },
  },
} as const

