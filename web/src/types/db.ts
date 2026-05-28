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
        Insert: Partial<Database["public"]["Tables"]["access_logs"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["access_logs"]["Row"]>;
        Relationships: [];
      };
      audit_photos: {
        Row: {
          audit_id: string;
          created_at: string;
          id: string;
          storage_path: string;
          stream: Database["public"]["Enums"]["waste_stream"];
          uploaded_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_photos"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["audit_photos"]["Row"]>;
        Relationships: [];
      };
      audits: {
        Row: {
          audit_date: string;
          audit_form_mode: Database["public"]["Enums"]["audit_form_mode"];
          audit_mode: Database["public"]["Enums"]["audit_mode"];
          audit_week: string | null;
          bottles_cans_additional_description: string | null;
          bottles_cans_cleared_contamination: boolean;
          bottles_cans_contamination: number;
          bottles_cans_contamination_pct: number | null;
          bottles_cans_food_present: boolean;
          bottles_cans_total: number;
          bottles_cans_total_dustbins: number | null;
          cardboard_additional_description: string | null;
          cardboard_cleared_contamination: boolean;
          cardboard_contamination: number;
          cardboard_contamination_pct: number | null;
          cardboard_to_baler: boolean | null;
          cardboard_total: number;
          cardboard_total_dustbins: number | null;
          compost_additional_description: string | null;
          compost_cleared_contamination: boolean;
          compost_contamination: number;
          compost_contamination_pct: number | null;
          compost_total: number;
          compost_total_dustbins: number | null;
          computed_grades: Json | null;
          computed_score: number | null;
          created_at: string;
          donates_cmu_food_pantry: boolean | null;
          donates_forinto: boolean | null;
          done_by_dining_team: boolean;
          energy_conservation_plan: boolean | null;
          general_comments: string | null;
          id: string;
          is_sustainability_champion: boolean;
          landfill_additional_description: string | null;
          landfill_cleared_contamination: boolean;
          landfill_contamination: number;
          landfill_contamination_pct: number | null;
          landfill_total: number;
          landfill_total_dustbins: number | null;
          location_id: string;
          nullified: boolean;
          nullified_at: string | null;
          nullified_by: string | null;
          nullified_reason: string | null;
          reuse_program: boolean | null;
          simple_responses: Json | null;
          submitted_by: string;
          submitted_by_role: Database["public"]["Enums"]["user_role"];
          submitter_name: string | null;
          sustainability_contact: Json | null;
          water_conservation_plan: boolean | null;
        };
        Insert: Partial<Database["public"]["Tables"]["audits"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["audits"]["Row"]>;
        Relationships: [];
      };
      email_outbox: {
        Row: {
          attempts: number;
          audit_id: string | null;
          cc_emails: string[] | null;
          created_at: string;
          html: string;
          id: string;
          last_error: string | null;
          sent_at: string | null;
          status: Database["public"]["Enums"]["email_status"];
          subject: string;
          to_emails: string[];
        };
        Insert: Partial<Database["public"]["Tables"]["email_outbox"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["email_outbox"]["Row"]>;
        Relationships: [];
      };
      locations: {
        Row: {
          account_username: string | null;
          active: boolean;
          contact_email: string | null;
          created_at: string;
          id: string;
          name: string;
        };
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
          audit_form_mode_for_reps: Database["public"]["Enums"]["audit_form_mode"];
          audit_mode: Database["public"]["Enums"]["audit_mode"];
          bonus_for_cleared_contamination: number;
          bottles_cans_threshold_a: number;
          cardboard_strict: boolean;
          compost_threshold_a: number;
          decay_floor_days: number;
          decay_half_life_days: number;
          dining_sustainability_email: string | null;
          id: string;
          landfill_opportunity_threshold_a: number;
          recommended_audit_windows: Json;
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
          username: string | null;
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
      create_location: { Args: { payload: Json }; Returns: Database["public"]["Tables"]["locations"]["Row"] };
      recommended_audit_window: { Args: { loc: string }; Returns: string };
      resolve_username: { Args: { p_username: string }; Returns: string };
      submit_audit: { Args: { payload: Json }; Returns: Json };
      update_location: { Args: { payload: Json }; Returns: Database["public"]["Tables"]["locations"]["Row"] };
      update_settings: { Args: { payload: Json }; Returns: Database["public"]["Tables"]["settings"]["Row"] };
      upsert_recommendation: { Args: { payload: Json }; Returns: Database["public"]["Tables"]["recommendations"]["Row"] };
    };
    Enums: {
      audit_form_mode: "simple" | "detailed";
      audit_mode: "count" | "weight";
      email_status: "pending" | "sent" | "failed";
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
export type AuditFormMode = Database["public"]["Enums"]["audit_form_mode"];
