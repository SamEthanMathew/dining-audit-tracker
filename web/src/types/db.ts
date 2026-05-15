export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" };
  public: {
    Tables: {
      access_logs: {
        Row: {
          action: string;
          created_at: string;
          id: string;
          metadata: Json | null;
          user_id: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          user_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["access_logs"]["Insert"]>;
        Relationships: [];
      };
      audits: {
        Row: {
          audit_date: string;
          audit_mode: Database["public"]["Enums"]["audit_mode"];
          audit_week: string | null;
          bottles_cans_contamination: number;
          bottles_cans_food_present: boolean;
          bottles_cans_notes: string | null;
          bottles_cans_total: number;
          cardboard_contamination: number;
          cardboard_notes: string | null;
          cardboard_total: number;
          compost_contamination: number;
          compost_notes: string | null;
          compost_total: number;
          computed_grades: Json | null;
          computed_score: number | null;
          created_at: string;
          general_comments: string | null;
          id: string;
          landfill_contamination: number;
          landfill_notes: string | null;
          landfill_total: number;
          location_id: string;
          nullified: boolean;
          nullified_at: string | null;
          nullified_by: string | null;
          nullified_reason: string | null;
          submitted_by: string;
          submitted_by_role: Database["public"]["Enums"]["user_role"];
        };
        Insert: Partial<Database["public"]["Tables"]["audits"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["audits"]["Row"]>;
        Relationships: [];
      };
      locations: {
        Row: { active: boolean; created_at: string; id: string; name: string };
        Insert: Partial<Database["public"]["Tables"]["locations"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["locations"]["Row"]>;
        Relationships: [];
      };
      recommendations: {
        Row: {
          active: boolean;
          failure_mode: string;
          id: string;
          recommendation_text: string;
          stream: Database["public"]["Enums"]["waste_stream"];
          threshold_max: number | null;
          threshold_min: number | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["recommendations"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["recommendations"]["Row"]>;
        Relationships: [];
      };
      settings: {
        Row: {
          admin_audit_weight: number;
          audit_mode: Database["public"]["Enums"]["audit_mode"];
          bottles_cans_threshold_a: number;
          cardboard_strict: boolean;
          compost_threshold_a: number;
          decay_floor_days: number;
          decay_half_life_days: number;
          id: string;
          landfill_opportunity_threshold_a: number;
          rep_audit_weight: number;
          tier_thresholds: Json;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["settings"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["settings"]["Row"]>;
        Relationships: [];
      };
      settings_audit_log: {
        Row: {
          after: Json | null;
          before: Json | null;
          changed_by: string | null;
          created_at: string;
          id: string;
          record_id: string | null;
          table_name: string;
        };
        Insert: Partial<Database["public"]["Tables"]["settings_audit_log"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["settings_audit_log"]["Row"]>;
        Relationships: [];
      };
      users: {
        Row: {
          active: boolean;
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          location_id: string | null;
          role: Database["public"]["Enums"]["user_role"];
        };
        Insert: Partial<Database["public"]["Tables"]["users"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["users"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      admin_dashboard_summary: { Args: never; Returns: Json };
      admin_leaderboard: {
        Args: never;
        Returns: { location_id: string; location_name: string; score: number; tier: string }[];
      };
      current_location_score: { Args: { loc: string }; Returns: number };
      current_location_tier: { Args: { score: number }; Returns: string };
      leaderboard: {
        Args: never;
        Returns: { location_id: string; location_name: string; tier: string }[];
      };
      log_event: { Args: { action: string; metadata?: Json }; Returns: undefined };
      nullify_audit: {
        Args: { audit_id: string; reason: string };
        Returns: Database["public"]["Tables"]["audits"]["Row"];
      };
      submit_audit: { Args: { payload: Json }; Returns: Json };
      update_settings: { Args: { payload: Json }; Returns: Database["public"]["Tables"]["settings"]["Row"] };
      upsert_recommendation: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["recommendations"]["Row"];
      };
    };
    Enums: {
      audit_mode: "count" | "weight";
      user_role: "rep" | "admin";
      waste_stream: "landfill" | "bottles_cans" | "compost" | "cardboard";
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type UserRole = Database["public"]["Enums"]["user_role"];
export type WasteStream = Database["public"]["Enums"]["waste_stream"];
export type AuditMode = Database["public"]["Enums"]["audit_mode"];
