export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      admin_subscription_grants: {
        Row: {
          admin_id: string | null;
          created_at: string;
          days: number;
          expires_at: string | null;
          id: string;
          reason: string | null;
          user_id: string;
        };
        Insert: {
          admin_id?: string | null;
          created_at?: string;
          days?: number;
          expires_at?: string | null;
          id?: string;
          reason?: string | null;
          user_id: string;
        };
        Update: {
          admin_id?: string | null;
          created_at?: string;
          days?: number;
          expires_at?: string | null;
          id?: string;
          reason?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_subscription_grants_admin_id_fkey";
            columns: ["admin_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_subscription_grants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_explanations: {
        Row: {
          content_checksum: string | null;
          created_at: string;
          created_by: string | null;
          explanation: string | null;
          model: string | null;
          question_id: string;
          updated_at: string;
        };
        Insert: {
          content_checksum?: string | null;
          created_at?: string;
          created_by?: string | null;
          explanation?: string | null;
          model?: string | null;
          question_id: string;
          updated_at?: string;
        };
        Update: {
          content_checksum?: string | null;
          created_at?: string;
          created_by?: string | null;
          explanation?: string | null;
          model?: string | null;
          question_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_explanations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_explanations_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: true;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_settings: {
        Row: {
          api_key: string | null;
          cache_enabled: boolean;
          id: boolean;
          model: string;
          provider: string;
          updated_at: string;
        };
        Insert: {
          api_key?: string | null;
          cache_enabled?: boolean;
          id?: boolean;
          model?: string;
          provider?: string;
          updated_at?: string;
        };
        Update: {
          api_key?: string | null;
          cache_enabled?: boolean;
          id?: boolean;
          model?: string;
          provider?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: Json;
        };
        Insert: {
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
        };
        Update: {
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      attempt_answers: {
        Row: {
          answered_at: string;
          attempt_id: string;
          id: string;
          is_correct: boolean | null;
          question_id: string;
          score_awarded: number;
          selected_option_id: string | null;
        };
        Insert: {
          answered_at?: string;
          attempt_id: string;
          id?: string;
          is_correct?: boolean | null;
          question_id: string;
          score_awarded?: number;
          selected_option_id?: string | null;
        };
        Update: {
          answered_at?: string;
          attempt_id?: string;
          id?: string;
          is_correct?: boolean | null;
          question_id?: string;
          score_awarded?: number;
          selected_option_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "attempt_answers_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: false;
            referencedRelation: "exam_attempts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attempt_answers_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attempt_answers_selected_option_id_fkey";
            columns: ["selected_option_id"];
            isOneToOne: false;
            referencedRelation: "question_options";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string | null;
          actor_id: string | null;
          actor_name: string | null;
          created_at: string;
          details: Json;
          entity: string | null;
          entity_id: string | null;
          id: string;
        };
        Insert: {
          action?: string | null;
          actor_id?: string | null;
          actor_name?: string | null;
          created_at?: string;
          details?: Json;
          entity?: string | null;
          entity_id?: string | null;
          id?: string;
        };
        Update: {
          action?: string | null;
          actor_id?: string | null;
          actor_name?: string | null;
          created_at?: string;
          details?: Json;
          entity?: string | null;
          entity_id?: string | null;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          created_at: string;
          description: string | null;
          display_order: number;
          id: string;
          name: string;
          parent_id: string | null;
          slug: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          display_order?: number;
          id?: string;
          name: string;
          parent_id?: string | null;
          slug: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          display_order?: number;
          id?: string;
          name?: string;
          parent_id?: string | null;
          slug?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      error_logs: {
        Row: {
          correlation_id: string | null;
          created_at: string;
          error_code: string | null;
          id: string;
          message: string;
          metadata: Json;
          operation: string | null;
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          severity: string;
          source: string;
          user_id: string | null;
        };
        Insert: {
          correlation_id?: string | null;
          created_at?: string;
          error_code?: string | null;
          id?: string;
          message: string;
          metadata?: Json;
          operation?: string | null;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          severity?: string;
          source: string;
          user_id?: string | null;
        };
        Update: {
          correlation_id?: string | null;
          created_at?: string;
          error_code?: string | null;
          id?: string;
          message?: string;
          metadata?: Json;
          operation?: string | null;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          severity?: string;
          source?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "error_logs_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "error_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_assignments: {
        Row: {
          assigned_at: string;
          candidate_id: string;
          exam_id: string;
          id: string;
        };
        Insert: {
          assigned_at?: string;
          candidate_id: string;
          exam_id: string;
          id?: string;
        };
        Update: {
          assigned_at?: string;
          candidate_id?: string;
          exam_id?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_assignments_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_assignments_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_attempts: {
        Row: {
          candidate_id: string;
          category_ids: string[] | null;
          correct_count: number;
          created_at: string;
          earned_score: number;
          exam_id: string;
          expires_at: string | null;
          id: string;
          incorrect_count: number;
          passed: boolean;
          started_at: string;
          status: string;
          submitted_at: string | null;
          total_score: number;
          unanswered_count: number;
        };
        Insert: {
          candidate_id: string;
          category_ids?: string[] | null;
          correct_count?: number;
          created_at?: string;
          earned_score?: number;
          exam_id: string;
          expires_at?: string | null;
          id?: string;
          incorrect_count?: number;
          passed?: boolean;
          started_at?: string;
          status?: string;
          submitted_at?: string | null;
          total_score?: number;
          unanswered_count?: number;
        };
        Update: {
          candidate_id?: string;
          category_ids?: string[] | null;
          correct_count?: number;
          created_at?: string;
          earned_score?: number;
          exam_id?: string;
          expires_at?: string | null;
          id?: string;
          incorrect_count?: number;
          passed?: boolean;
          started_at?: string;
          status?: string;
          submitted_at?: string | null;
          total_score?: number;
          unanswered_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "exam_attempts_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_attempts_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_categories: {
        Row: {
          category_id: string;
          created_at: string;
          exam_id: string;
          id: string;
        };
        Insert: {
          category_id: string;
          created_at?: string;
          exam_id: string;
          id?: string;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          exam_id?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_categories_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_categories_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_questions: {
        Row: {
          created_at: string;
          display_order: number;
          exam_id: string;
          exam_subject_id: string | null;
          id: string;
          question_id: string;
          score: number;
        };
        Insert: {
          created_at?: string;
          display_order?: number;
          exam_id: string;
          exam_subject_id?: string | null;
          id?: string;
          question_id: string;
          score?: number;
        };
        Update: {
          created_at?: string;
          display_order?: number;
          exam_id?: string;
          exam_subject_id?: string | null;
          id?: string;
          question_id?: string;
          score?: number;
        };
        Relationships: [
          {
            foreignKeyName: "exam_questions_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_questions_exam_subject_id_fkey";
            columns: ["exam_subject_id"];
            isOneToOne: false;
            referencedRelation: "exam_subjects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_questions_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_subjects: {
        Row: {
          coefficient: number;
          created_at: string;
          display_order: number;
          exam_id: string;
          id: string;
          negative_marking: boolean;
          question_count: number;
          subject_id: string;
          time_limit_minutes: number | null;
        };
        Insert: {
          coefficient?: number;
          created_at?: string;
          display_order?: number;
          exam_id: string;
          id?: string;
          negative_marking?: boolean;
          question_count?: number;
          subject_id: string;
          time_limit_minutes?: number | null;
        };
        Update: {
          coefficient?: number;
          created_at?: string;
          display_order?: number;
          exam_id?: string;
          id?: string;
          negative_marking?: boolean;
          question_count?: number;
          subject_id?: string;
          time_limit_minutes?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "exam_subjects_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_subjects_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
        ];
      };
      exams: {
        Row: {
          access_type: string;
          category_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          duration_minutes: number;
          id: string;
          is_free: boolean;
          keywords: string | null;
          level: string | null;
          max_attempts: number;
          meta_description: string | null;
          meta_title: string | null;
          organization_id: string | null;
          passing_score: number;
          period: string | null;
          price: number;
          randomize_options: boolean;
          randomize_questions: boolean;
          round: string | null;
          show_correct_answers: boolean;
          slug: string;
          status: string;
          title: string;
          updated_at: string;
          year: number | null;
        };
        Insert: {
          access_type?: string;
          category_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          is_free?: boolean;
          keywords?: string | null;
          level?: string | null;
          max_attempts?: number;
          meta_description?: string | null;
          meta_title?: string | null;
          organization_id?: string | null;
          passing_score?: number;
          period?: string | null;
          price?: number;
          randomize_options?: boolean;
          randomize_questions?: boolean;
          round?: string | null;
          show_correct_answers?: boolean;
          slug: string;
          status?: string;
          title: string;
          updated_at?: string;
          year?: number | null;
        };
        Update: {
          access_type?: string;
          category_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          is_free?: boolean;
          keywords?: string | null;
          level?: string | null;
          max_attempts?: number;
          meta_description?: string | null;
          meta_title?: string | null;
          organization_id?: string | null;
          passing_score?: number;
          period?: string | null;
          price?: number;
          randomize_options?: boolean;
          randomize_questions?: boolean;
          round?: string | null;
          show_correct_answers?: boolean;
          slug?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          year?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "exams_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exams_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exams_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      learning_resources: {
        Row: {
          category_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          display_order: number;
          id: string;
          is_active: boolean;
          language: string;
          resource_type: string;
          subject_id: string | null;
          title: string;
          topic: string | null;
          updated_at: string;
          url: string;
        };
        Insert: {
          category_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          language?: string;
          resource_type: string;
          subject_id?: string | null;
          title: string;
          topic?: string | null;
          updated_at?: string;
          url: string;
        };
        Update: {
          category_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          language?: string;
          resource_type?: string;
          subject_id?: string | null;
          title?: string;
          topic?: string | null;
          updated_at?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "learning_resources_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "learning_resources_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "learning_resources_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          description: string | null;
          display_order: number;
          id: string;
          logo_url: string | null;
          name: string;
          slug: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          display_order?: number;
          id?: string;
          logo_url?: string | null;
          name: string;
          slug: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          display_order?: number;
          id?: string;
          logo_url?: string | null;
          name?: string;
          slug?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      otp_codes: {
        Row: {
          attempts: number;
          code_hash: string;
          consumed_at: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          max_attempts: number;
          phone_e164: string;
        };
        Insert: {
          attempts?: number;
          code_hash: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at: string;
          id?: string;
          max_attempts?: number;
          phone_e164: string;
        };
        Update: {
          attempts?: number;
          code_hash?: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          max_attempts?: number;
          phone_e164?: string;
        };
        Relationships: [];
      };
      payment_gateway_settings: {
        Row: {
          callback_path: string;
          currency: string;
          description: string;
          enabled: boolean;
          gateway: string;
          id: boolean;
          merchant_id: string | null;
          sandbox: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          callback_path?: string;
          currency?: string;
          description?: string;
          enabled?: boolean;
          gateway?: string;
          id?: boolean;
          merchant_id?: string | null;
          sandbox?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          callback_path?: string;
          currency?: string;
          description?: string;
          enabled?: boolean;
          gateway?: string;
          id?: boolean;
          merchant_id?: string | null;
          sandbox?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payment_gateway_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_refunds: {
        Row: {
          amount: number;
          completed_at: string | null;
          created_at: string;
          currency: string;
          error_code: string | null;
          id: string;
          idempotency_key: string;
          payment_id: string;
          provider: string;
          provider_reference: string | null;
          reason: string | null;
          requested_by: string | null;
          status: string;
        };
        Insert: {
          amount: number;
          completed_at?: string | null;
          created_at?: string;
          currency: string;
          error_code?: string | null;
          id?: string;
          idempotency_key: string;
          payment_id: string;
          provider: string;
          provider_reference?: string | null;
          reason?: string | null;
          requested_by?: string | null;
          status?: string;
        };
        Update: {
          amount?: number;
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          error_code?: string | null;
          id?: string;
          idempotency_key?: string;
          payment_id?: string;
          provider?: string;
          provider_reference?: string | null;
          reason?: string | null;
          requested_by?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_refunds_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_refunds_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          authority: string | null;
          card_pan: string | null;
          created_at: string;
          currency: string;
          failure_reason: string | null;
          gateway: string;
          gateway_meta: Json;
          id: string;
          manual_verified_at: string | null;
          manual_verified_by: string | null;
          paid_at: string | null;
          plan_id: string | null;
          ref_id: string | null;
          refunded_amount: number;
          refunded_at: string | null;
          status: string;
          subscription_id: string | null;
          transaction_id: string | null;
          updated_at: string;
          user_id: string;
          verified_at: string | null;
        };
        Insert: {
          amount?: number;
          authority?: string | null;
          card_pan?: string | null;
          created_at?: string;
          currency?: string;
          failure_reason?: string | null;
          gateway?: string;
          gateway_meta?: Json;
          id?: string;
          manual_verified_at?: string | null;
          manual_verified_by?: string | null;
          paid_at?: string | null;
          plan_id?: string | null;
          ref_id?: string | null;
          refunded_amount?: number;
          refunded_at?: string | null;
          status?: string;
          subscription_id?: string | null;
          transaction_id?: string | null;
          updated_at?: string;
          user_id: string;
          verified_at?: string | null;
        };
        Update: {
          amount?: number;
          authority?: string | null;
          card_pan?: string | null;
          created_at?: string;
          currency?: string;
          failure_reason?: string | null;
          gateway?: string;
          gateway_meta?: Json;
          id?: string;
          manual_verified_at?: string | null;
          manual_verified_by?: string | null;
          paid_at?: string | null;
          plan_id?: string | null;
          ref_id?: string | null;
          refunded_amount?: number;
          refunded_at?: string | null;
          status?: string;
          subscription_id?: string | null;
          transaction_id?: string | null;
          updated_at?: string;
          user_id?: string;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_manual_verified_by_fkey";
            columns: ["manual_verified_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      phone_login_attempts: {
        Row: {
          blocked_until: string | null;
          created_at: string;
          last_request_at: string;
          phone_e164: string;
          request_count_1h: number;
          updated_at: string;
        };
        Insert: {
          blocked_until?: string | null;
          created_at?: string;
          last_request_at?: string;
          phone_e164: string;
          request_count_1h?: number;
          updated_at?: string;
        };
        Update: {
          blocked_until?: string | null;
          created_at?: string;
          last_request_at?: string;
          phone_e164?: string;
          request_count_1h?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      plans: {
        Row: {
          archived_at: string | null;
          created_at: string;
          currency: string;
          display_order: number;
          duration_months: number;
          exam_quota: number | null;
          features: Json;
          id: string;
          is_active: boolean;
          practice_quota: number | null;
          price: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          currency?: string;
          display_order?: number;
          duration_months?: number;
          exam_quota?: number | null;
          features?: Json;
          id?: string;
          is_active?: boolean;
          practice_quota?: number | null;
          price?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          currency?: string;
          display_order?: number;
          duration_months?: number;
          exam_quota?: number | null;
          features?: Json;
          id?: string;
          is_active?: boolean;
          practice_quota?: number | null;
          price?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      practice_answers: {
        Row: {
          answered_at: string;
          id: string;
          is_correct: boolean | null;
          question_id: string;
          selected_option_id: string | null;
          session_id: string;
        };
        Insert: {
          answered_at?: string;
          id?: string;
          is_correct?: boolean | null;
          question_id: string;
          selected_option_id?: string | null;
          session_id: string;
        };
        Update: {
          answered_at?: string;
          id?: string;
          is_correct?: boolean | null;
          question_id?: string;
          selected_option_id?: string | null;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "practice_answers_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_answers_selected_option_id_fkey";
            columns: ["selected_option_id"];
            isOneToOne: false;
            referencedRelation: "question_options";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_answers_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "practice_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_sessions: {
        Row: {
          category_id: string | null;
          correct_count: number;
          created_at: string;
          difficulty: string | null;
          exam_id: string | null;
          finished_at: string | null;
          id: string;
          incorrect_count: number;
          organization_id: string | null;
          question_ids: string[];
          status: string;
          subject_ids: string[];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          category_id?: string | null;
          correct_count?: number;
          created_at?: string;
          difficulty?: string | null;
          exam_id?: string | null;
          finished_at?: string | null;
          id?: string;
          incorrect_count?: number;
          organization_id?: string | null;
          question_ids?: string[];
          status?: string;
          subject_ids?: string[];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          category_id?: string | null;
          correct_count?: number;
          created_at?: string;
          difficulty?: string | null;
          exam_id?: string | null;
          finished_at?: string | null;
          id?: string;
          incorrect_count?: number;
          organization_id?: string | null;
          question_ids?: string[];
          status?: string;
          subject_ids?: string[];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "practice_sessions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_sessions_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_sessions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          full_name: string;
          has_used_trial: boolean;
          id: string;
          mobile: string | null;
          status: string;
          trial_ends_at: string | null;
          trial_started_at: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          has_used_trial?: boolean;
          id: string;
          mobile?: string | null;
          status?: string;
          trial_ends_at?: string | null;
          trial_started_at?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          has_used_trial?: boolean;
          id?: string;
          mobile?: string | null;
          status?: string;
          trial_ends_at?: string | null;
          trial_started_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      question_import_batches: {
        Row: {
          completed_at: string | null;
          created_at: string;
          created_by: string;
          duplicate_rows: number;
          error_report_url: string | null;
          exam_id: string | null;
          file_name: string | null;
          file_type: string | null;
          id: string;
          imported_rows: number;
          invalid_rows: number;
          status: string;
          total_rows: number;
          valid_rows: number;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          created_by: string;
          duplicate_rows?: number;
          error_report_url?: string | null;
          exam_id?: string | null;
          file_name?: string | null;
          file_type?: string | null;
          id?: string;
          imported_rows?: number;
          invalid_rows?: number;
          status?: string;
          total_rows?: number;
          valid_rows?: number;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string;
          duplicate_rows?: number;
          error_report_url?: string | null;
          exam_id?: string | null;
          file_name?: string | null;
          file_type?: string | null;
          id?: string;
          imported_rows?: number;
          invalid_rows?: number;
          status?: string;
          total_rows?: number;
          valid_rows?: number;
        };
        Relationships: [
          {
            foreignKeyName: "question_import_batches_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
        ];
      };
      question_import_chunks: {
        Row: {
          batch_id: string;
          chunk_number: number;
          created_at: string;
          duplicates: number;
          failed: number;
          id: string;
          imported: number;
          processed: number;
          status: string;
        };
        Insert: {
          batch_id: string;
          chunk_number: number;
          created_at?: string;
          duplicates?: number;
          failed?: number;
          id?: string;
          imported?: number;
          processed?: number;
          status?: string;
        };
        Update: {
          batch_id?: string;
          chunk_number?: number;
          created_at?: string;
          duplicates?: number;
          failed?: number;
          id?: string;
          imported?: number;
          processed?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_import_chunks_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "question_import_batches";
            referencedColumns: ["id"];
          },
        ];
      };
      question_import_errors: {
        Row: {
          batch_id: string;
          created_at: string;
          error_code: string | null;
          error_message: string | null;
          field_name: string | null;
          id: string;
          raw_value: string | null;
          row_number: number;
        };
        Insert: {
          batch_id: string;
          created_at?: string;
          error_code?: string | null;
          error_message?: string | null;
          field_name?: string | null;
          id?: string;
          raw_value?: string | null;
          row_number: number;
        };
        Update: {
          batch_id?: string;
          created_at?: string;
          error_code?: string | null;
          error_message?: string | null;
          field_name?: string | null;
          id?: string;
          raw_value?: string | null;
          row_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "question_import_errors_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "question_import_batches";
            referencedColumns: ["id"];
          },
        ];
      };
      question_options: {
        Row: {
          created_at: string;
          display_order: number;
          id: string;
          is_correct: boolean;
          option_text: string;
          question_id: string;
        };
        Insert: {
          created_at?: string;
          display_order?: number;
          id?: string;
          is_correct?: boolean;
          option_text: string;
          question_id: string;
        };
        Update: {
          created_at?: string;
          display_order?: number;
          id?: string;
          is_correct?: boolean;
          option_text?: string;
          question_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_options_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      question_reports: {
        Row: {
          admin_note: string | null;
          attempt_id: string | null;
          created_at: string;
          description: string | null;
          exam_id: string | null;
          id: string;
          question_id: string;
          reason: string;
          reporter_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          admin_note?: string | null;
          attempt_id?: string | null;
          created_at?: string;
          description?: string | null;
          exam_id?: string | null;
          id?: string;
          question_id: string;
          reason: string;
          reporter_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          admin_note?: string | null;
          attempt_id?: string | null;
          created_at?: string;
          description?: string | null;
          exam_id?: string | null;
          id?: string;
          question_id?: string;
          reason?: string;
          reporter_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_reports_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: false;
            referencedRelation: "exam_attempts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_reports_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_reports_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      questions: {
        Row: {
          category_id: string | null;
          content_hash: string | null;
          created_at: string;
          created_by: string | null;
          default_score: number;
          difficulty: string;
          explanation: string | null;
          external_id: string | null;
          id: string;
          import_batch_id: string | null;
          media: Json | null;
          question_text: string;
          status: string;
          subject_id: string | null;
          updated_at: string;
        };
        Insert: {
          category_id?: string | null;
          content_hash?: string | null;
          created_at?: string;
          created_by?: string | null;
          default_score?: number;
          difficulty?: string;
          explanation?: string | null;
          external_id?: string | null;
          id?: string;
          import_batch_id?: string | null;
          media?: Json | null;
          question_text: string;
          status?: string;
          subject_id?: string | null;
          updated_at?: string;
        };
        Update: {
          category_id?: string | null;
          content_hash?: string | null;
          created_at?: string;
          created_by?: string | null;
          default_score?: number;
          difficulty?: string;
          explanation?: string | null;
          external_id?: string | null;
          id?: string;
          import_batch_id?: string | null;
          media?: Json | null;
          question_text?: string;
          status?: string;
          subject_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "questions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "questions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "questions_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
        ];
      };
      sms_campaigns: {
        Row: {
          audience: string;
          created_at: string;
          created_by: string | null;
          failed_count: number;
          id: string;
          message: string;
          provider: string;
          sent_count: number;
          skipped_count: number;
          test_mode: boolean;
          title: string | null;
          total_count: number;
        };
        Insert: {
          audience?: string;
          created_at?: string;
          created_by?: string | null;
          failed_count?: number;
          id?: string;
          message: string;
          provider: string;
          sent_count?: number;
          skipped_count?: number;
          test_mode?: boolean;
          title?: string | null;
          total_count?: number;
        };
        Update: {
          audience?: string;
          created_at?: string;
          created_by?: string | null;
          failed_count?: number;
          id?: string;
          message?: string;
          provider?: string;
          sent_count?: number;
          skipped_count?: number;
          test_mode?: boolean;
          title?: string | null;
          total_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sms_campaigns_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sms_delivery_logs: {
        Row: {
          campaign_id: string | null;
          created_at: string;
          dedupe_key: string | null;
          error_message: string | null;
          id: string;
          message: string | null;
          mobile_masked: string | null;
          provider_status: number | null;
          purpose: string | null;
          sent_by: string | null;
          success: boolean | null;
        };
        Insert: {
          campaign_id?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          error_message?: string | null;
          id?: string;
          message?: string | null;
          mobile_masked?: string | null;
          provider_status?: number | null;
          purpose?: string | null;
          sent_by?: string | null;
          success?: boolean | null;
        };
        Update: {
          campaign_id?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          error_message?: string | null;
          id?: string;
          message?: string | null;
          mobile_masked?: string | null;
          provider_status?: number | null;
          purpose?: string | null;
          sent_by?: string | null;
          success?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "sms_delivery_logs_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "sms_campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sms_delivery_logs_sent_by_fkey";
            columns: ["sent_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sms_otp_codes: {
        Row: {
          attempts: number;
          code_hash: string;
          consumed_at: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          mobile: string;
          request_ip: string | null;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          code_hash: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at: string;
          id?: string;
          mobile: string;
          request_ip?: string | null;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          code_hash?: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          mobile?: string;
          request_ip?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      sms_send_log: {
        Row: {
          created_at: string;
          error: string | null;
          id: string;
          phone_e164: string;
          provider: string;
          provider_message_id: string | null;
          status: string;
          template: string | null;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          id?: string;
          phone_e164: string;
          provider: string;
          provider_message_id?: string | null;
          status: string;
          template?: string | null;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          id?: string;
          phone_e164?: string;
          provider?: string;
          provider_message_id?: string | null;
          status?: string;
          template?: string | null;
        };
        Relationships: [];
      };
      sms_settings: {
        Row: {
          api_key: string | null;
          enabled: boolean;
          id: boolean;
          provider: string;
          sender_line: string | null;
          test_mode: boolean;
          updated_at: string;
          updated_by: string | null;
          verify_template_id: string | null;
          welcome_template_id: string | null;
        };
        Insert: {
          api_key?: string | null;
          enabled?: boolean;
          id?: boolean;
          provider?: string;
          sender_line?: string | null;
          test_mode?: boolean;
          updated_at?: string;
          updated_by?: string | null;
          verify_template_id?: string | null;
          welcome_template_id?: string | null;
        };
        Update: {
          api_key?: string | null;
          enabled?: boolean;
          id?: boolean;
          provider?: string;
          sender_line?: string | null;
          test_mode?: boolean;
          updated_at?: string;
          updated_by?: string | null;
          verify_template_id?: string | null;
          welcome_template_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sms_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      subjects: {
        Row: {
          created_at: string;
          description: string | null;
          display_order: number;
          id: string;
          name: string;
          slug: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          display_order?: number;
          id?: string;
          name: string;
          slug: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          display_order?: number;
          id?: string;
          name?: string;
          slug?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          created_at: string;
          created_by: string | null;
          expires_at: string | null;
          id: string;
          plan_id: string | null;
          started_at: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          plan_id?: string | null;
          started_at?: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          plan_id?: string | null;
          started_at?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      trial_claims: {
        Row: {
          claimed_at: string;
          email: string;
          first_user_id: string | null;
        };
        Insert: {
          claimed_at?: string;
          email: string;
          first_user_id?: string | null;
        };
        Update: {
          claimed_at?: string;
          email?: string;
          first_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "trial_claims_first_user_id_fkey";
            columns: ["first_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_exam_question: {
        Args: { p_exam_id: string; p_question_id: string };
        Returns: undefined;
      };
      admin_analytics_overview:
        { Args: never; Returns: Json } | { Args: { p_range: number }; Returns: Json };
      admin_audit_facets: { Args: never; Returns: Json };
      admin_begin_refund: {
        Args: {
          p_amount: number;
          p_idempotency_key: string;
          p_payment_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      admin_cancel_subscription: {
        Args: { p_reason: string; p_user_id: string };
        Returns: Json;
      };
      admin_create_question_import_batch: {
        Args: {
          p_exam_id?: string;
          p_file_name?: string;
          p_file_type?: string;
          p_invalid_rows?: number;
          p_total_rows?: number;
          p_valid_rows?: number;
        };
        Returns: string;
      };
      admin_db_health: { Args: never; Returns: Json };
      admin_delete_plan: {
        Args: { p_id: string; p_reason?: string };
        Returns: Json;
      };
      admin_download_question_import_errors: {
        Args: { p_batch_id: string };
        Returns: Json;
      };
      admin_error_stats: { Args: never; Returns: Json };
      admin_finalize_refund: {
        Args: {
          p_error_code?: string;
          p_provider_reference?: string;
          p_refund_id: string;
          p_success: boolean;
        };
        Returns: Json;
      };
      admin_get_question_import_batch: {
        Args: { p_batch_id: string };
        Returns: Json;
      };
      admin_get_question_import_progress: {
        Args: { p_batch_id: string };
        Returns: Json;
      };
      admin_get_user_detail: { Args: { p_user_id: string }; Returns: Json };
      admin_grant_subscription: {
        Args: {
          p_days: number;
          p_plan_id?: string;
          p_reason?: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      admin_import_questions: {
        Args: {
          p_batch_id: string;
          p_chunk_number?: number;
          p_duplicate_policy?: string;
          p_exam_id: string;
          p_is_last_chunk?: boolean;
          p_rows: Json;
          p_status?: string;
        };
        Returns: Json;
      };
      admin_import_questions_chunk: {
        Args: {
          p_batch_id: string;
          p_chunk_number?: number;
          p_duplicate_policy?: string;
          p_exam_id: string;
          p_rows: Json;
          p_status?: string;
          p_total_chunks?: number;
        };
        Returns: Json;
      };
      admin_list_audit: {
        Args: {
          p_action?: string;
          p_actor_id?: string;
          p_entity?: string;
          p_entity_id?: string;
          p_from?: string;
          p_page?: number;
          p_page_size?: number;
          p_result?: string;
          p_search?: string;
          p_to?: string;
        };
        Returns: Json;
      };
      admin_list_errors: {
        Args: {
          p_page?: number;
          p_page_size?: number;
          p_severity?: string;
          p_source?: string;
          p_unresolved_only?: boolean;
        };
        Returns: Json;
      };
      admin_list_exams: {
        Args: {
          p_access_type?: string;
          p_category_id?: string;
          p_page?: number;
          p_page_size?: number;
          p_search?: string;
          p_status?: string;
        };
        Returns: Json;
      };
      admin_list_payments: {
        Args: { p_limit?: number; p_search?: string; p_status?: string };
        Returns: Json;
      };
      admin_list_question_import_batches: {
        Args: { p_limit?: number; p_offset?: number; p_status?: string };
        Returns: Json;
      };
      admin_list_subscriptions: {
        Args: { p_search?: string; p_status?: string };
        Returns: Json;
      };
      admin_list_users: {
        Args: {
          p_from?: string;
          p_has_active_sub?: boolean;
          p_page?: number;
          p_page_size?: number;
          p_role?: Database["public"]["Enums"]["app_role"];
          p_search?: string;
          p_status?: string;
          p_to?: string;
        };
        Returns: Json;
      };
      admin_log_error: {
        Args: {
          p_correlation_id?: string;
          p_error_code?: string;
          p_message: string;
          p_metadata?: Json;
          p_operation?: string;
          p_severity: string;
          p_source: string;
        };
        Returns: string;
      };
      admin_manual_verify_payment: {
        Args: { p_payment_id: string; p_reason: string; p_reference: string };
        Returns: Json;
      };
      admin_payment_stats: { Args: never; Returns: Json };
      admin_recent_audit: { Args: { p_limit?: number }; Returns: Json };
      admin_resolve_error: {
        Args: { p_id: string; p_note?: string };
        Returns: Json;
      };
      admin_rollback_question_import: {
        Args: { p_batch_id: string };
        Returns: Json;
      };
      admin_rollback_question_import_v2: {
        Args: { p_batch_id: string };
        Returns: Json;
      };
      admin_save_plan: {
        Args: {
          p_currency?: string;
          p_display_order?: number;
          p_duration_months: number;
          p_exam_quota?: number;
          p_features?: Json;
          p_id: string;
          p_is_active: boolean;
          p_practice_quota?: number;
          p_price: number;
          p_reason?: string;
          p_title: string;
        };
        Returns: Json;
      };
      admin_save_setting: {
        Args: {
          p_expected_updated_at?: string;
          p_key: string;
          p_reason?: string;
          p_value: Json;
        };
        Returns: Json;
      };
      admin_set_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: undefined;
      };
      admin_set_subscription_status: {
        Args: { p_reason?: string; p_status: string; p_user_id: string };
        Returns: Json;
      };
      admin_set_user_role: {
        Args: {
          p_reason?: string;
          p_role: Database["public"]["Enums"]["app_role"];
          p_user_id: string;
        };
        Returns: Json;
      };
      admin_set_user_status: {
        Args: { p_reason?: string; p_status: string; p_user_id: string };
        Returns: Json;
      };
      admin_subscription_stats: { Args: never; Returns: Json };
      admin_validate_question_import: { Args: { p_rows: Json }; Returns: Json };
      answer_practice_question: {
        Args: {
          p_option_id: string;
          p_question_id: string;
          p_session_id: string;
        };
        Returns: Json;
      };
      assign_candidates: {
        Args: { p_candidate_ids: string[]; p_exam_id: string };
        Returns: undefined;
      };
      attempt_per_subject: { Args: { p_attempt_id: string }; Returns: Json };
      attempts_timeline: {
        Args: { p_limit?: number; p_user_id?: string };
        Returns: Json;
      };
      build_candidate_analytics: {
        Args: {
          p_exam_id?: string;
          p_from?: string;
          p_to?: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      bulk_import_link_exam_subject: {
        Args: {
          p_coefficient?: number;
          p_exam_id: string;
          p_subject_id: string;
        };
        Returns: Json;
      };
      can_view_exam: { Args: { _exam_id: string }; Returns: boolean };
      candidate_analytics_self: {
        Args: { p_from?: string; p_to?: string };
        Returns: Json;
      };
      candidate_analytics_summary: {
        Args: { p_from?: string; p_to?: string; p_user_id: string };
        Returns: Json;
      };
      claim_first_admin: { Args: never; Returns: boolean };
      create_category_for_bulk_import: {
        Args: {
          p_description?: string;
          p_display_order?: number;
          p_name: string;
          p_parent_id?: string;
          p_slug?: string;
          p_status?: string;
        };
        Returns: Json;
      };
      create_exam_for_bulk_import: {
        Args: {
          p_access_type?: string;
          p_category_id?: string;
          p_description?: string;
          p_duration_minutes?: number;
          p_is_free?: boolean;
          p_level?: string;
          p_max_attempts?: number;
          p_organization_id?: string;
          p_passing_score?: number;
          p_period?: string;
          p_price?: number;
          p_round?: string;
          p_slug?: string;
          p_status?: string;
          p_subject_id?: string;
          p_title: string;
          p_year?: number;
        };
        Returns: Json;
      };
      create_organization_for_bulk_import: {
        Args: { p_name: string; p_slug?: string };
        Returns: string;
      };
      create_payment_intent: {
        Args: { p_gateway?: string; p_plan_id: string };
        Returns: Json;
      };
      create_subject_for_bulk_import: {
        Args: {
          p_description?: string;
          p_display_order?: number;
          p_name: string;
          p_slug?: string;
          p_status?: string;
        };
        Returns: Json;
      };
      delete_category: { Args: { p_id: string }; Returns: undefined };
      delete_exam: { Args: { p_id: string }; Returns: undefined };
      delete_organization: { Args: { p_id: string }; Returns: undefined };
      delete_subject: { Args: { p_id: string }; Returns: undefined };
      exam_candidate_analytics: {
        Args: { p_exam_id: string; p_user_id: string };
        Returns: Json;
      };
      exam_catalog_tree: { Args: never; Returns: Json };
      finalize_gateway_payment: {
        Args: {
          p_amount?: number;
          p_card_pan?: string;
          p_payment_id: string;
          p_ref_id: string;
        };
        Returns: Json;
      };
      finish_practice_session: { Args: { p_session_id: string }; Returns: Json };
      get_ai_explanation: { Args: { p_question_id: string }; Returns: Json };
      get_attempt_review: { Args: { p_attempt_id: string }; Returns: Json };
      get_attempt_state: { Args: { p_attempt_id: string }; Returns: Json };
      get_exam_admin: { Args: { p_exam_id: string }; Returns: Json };
      get_exam_public: { Args: { p_slug: string }; Returns: Json };
      get_exam_topics: { Args: { p_exam_id: string }; Returns: Json };
      get_practice_session: { Args: { p_session_id: string }; Returns: Json };
      has_active_subscription: { Args: { _user_id: string }; Returns: boolean };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      import_questions: {
        Args: {
          p_category_ids: string[];
          p_exam_id: string;
          p_exam_title: string;
          p_rows: Json;
        };
        Returns: Json;
      };
      is_admin: { Args: never; Returns: boolean };
      list_attempts_admin: {
        Args: {
          p_exam_id?: string;
          p_page?: number;
          p_page_size?: number;
          p_search?: string;
          p_status?: string;
        };
        Returns: Json;
      };
      list_exams_public: {
        Args: {
          p_category_id?: string;
          p_exam_type?: string;
          p_is_free?: boolean;
          p_level?: string;
          p_organization_id?: string;
          p_page?: number;
          p_page_size?: number;
          p_search?: string;
          p_subject_id?: string;
          p_year?: number;
        };
        Returns: Json;
      };
      list_practice_questions:
        | {
            Args: {
              p_category_id?: string;
              p_difficulty?: string;
              p_exam_id?: string;
              p_limit?: number;
              p_offset?: number;
              p_organization_id?: string;
              p_search?: string;
              p_subject_id?: string;
            };
            Returns: Json;
          }
        | {
            Args: {
              p_category_id?: string;
              p_difficulty?: string;
              p_exam_id?: string;
              p_limit?: number;
              p_offset?: number;
              p_organization_id?: string;
              p_search?: string;
              p_subject_id?: string;
              p_subject_ids?: string[];
            };
            Returns: Json;
          };
      list_practice_sessions: {
        Args: { p_exam_id?: string; p_limit?: number };
        Returns: Json;
      };
      list_question_reports: { Args: never; Returns: Json };
      list_questions_admin: {
        Args: {
          p_category_id?: string;
          p_page?: number;
          p_page_size?: number;
          p_search?: string;
        };
        Returns: Json;
      };
      log_audit: {
        Args: {
          _action: string;
          _details?: Json;
          _entity: string;
          _entity_id: string;
        };
        Returns: string;
      };
      mark_gateway_payment_failed: {
        Args: { p_payment_id: string; p_reason?: string; p_status?: string };
        Returns: Json;
      };
      my_subscription: { Args: never; Returns: Json };
      normalize_for_hash: { Args: { p_text: string }; Returns: string };
      practice_filters: { Args: never; Returns: Json };
      question_checksum: { Args: { _question_id: string }; Returns: string };
      question_content_hash: {
        Args: {
          p_category_id: string;
          p_difficulty: string;
          p_options: string[];
          p_question_text: string;
        };
        Returns: string;
      };
      question_difficulty_stats: { Args: { p_user_id?: string }; Returns: Json };
      question_matches_subjects: {
        Args: { _question_id: string; _subject_ids: string[] };
        Returns: boolean;
      };
      question_subject_ids: {
        Args: { _question_id: string };
        Returns: string[];
      };
      remove_exam_question: {
        Args: { p_exam_id: string; p_question_id: string };
        Returns: undefined;
      };
      report_question: {
        Args: {
          p_attempt_id?: string;
          p_description?: string;
          p_exam_id?: string;
          p_question_id: string;
          p_reason: string;
        };
        Returns: string;
      };
      resources_for_topics: {
        Args: {
          p_category_ids?: string[];
          p_limit?: number;
          p_subject_ids?: string[];
        };
        Returns: Json;
      };
      save_answer: {
        Args: {
          p_attempt_id: string;
          p_option_id: string;
          p_question_id: string;
        };
        Returns: undefined;
      };
      save_category: {
        Args: {
          p_description?: string;
          p_display_order?: number;
          p_id: string;
          p_name: string;
          p_parent_id?: string;
          p_slug: string;
          p_status?: string;
        };
        Returns: string;
      };
      save_exam_v2: {
        Args: {
          p_access_type: string;
          p_category_id: string;
          p_description: string;
          p_duration_minutes: number;
          p_id: string;
          p_is_free: boolean;
          p_keywords: string;
          p_level: string;
          p_max_attempts: number;
          p_meta_description: string;
          p_meta_title: string;
          p_organization_id: string;
          p_passing_score: number;
          p_period: string;
          p_price: number;
          p_randomize_options: boolean;
          p_randomize_questions: boolean;
          p_round: string;
          p_show_correct_answers: boolean;
          p_slug: string;
          p_status: string;
          p_title: string;
          p_year: number;
        };
        Returns: string;
      };
      save_organization: {
        Args: {
          p_description?: string;
          p_display_order?: number;
          p_id: string;
          p_name: string;
          p_slug: string;
          p_status?: string;
        };
        Returns: string;
      };
      save_question: {
        Args: {
          p_category_id: string;
          p_difficulty: string;
          p_id: string;
          p_options: Json;
          p_score: number;
          p_status: string;
          p_text: string;
        };
        Returns: string;
      };
      save_subject: {
        Args: {
          p_description?: string;
          p_display_order?: number;
          p_id: string;
          p_name: string;
          p_slug: string;
          p_status?: string;
        };
        Returns: string;
      };
      set_exam_categories: {
        Args: { p_category_ids: string[]; p_exam_id: string };
        Returns: undefined;
      };
      set_exam_subjects: {
        Args: { p_exam_id: string; p_rows: Json };
        Returns: undefined;
      };
      start_attempt: {
        Args: { p_category_ids?: string[]; p_exam_id: string };
        Returns: string;
      };
      start_practice_session: {
        Args: {
          p_category_id?: string;
          p_count?: number;
          p_difficulty?: string;
          p_exam_id?: string;
          p_organization_id?: string;
          p_subject_ids?: string[];
        };
        Returns: string;
      };
      submit_attempt: { Args: { p_attempt_id: string }; Returns: Json };
      unassign_candidate: {
        Args: { p_candidate_id: string; p_exam_id: string };
        Returns: undefined;
      };
      weak_topics_for_user: {
        Args: { p_limit?: number; p_user_id?: string };
        Returns: Json;
      };
    };
    Enums: {
      app_role: "admin" | "candidate";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "candidate"],
    },
  },
} as const;
