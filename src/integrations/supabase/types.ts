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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      abuse_events: {
        Row: {
          created_at: string
          details: Json
          id: string
          kind: string
          severity: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          kind: string
          severity?: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          severity?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: []
      }
      agent_actions: {
        Row: {
          attempt: number
          created_at: string
          detail: Json
          duration_ms: number | null
          id: string
          kind: string
          label: string
          ok: boolean
          seq: number
          session_id: string
          user_id: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          detail?: Json
          duration_ms?: number | null
          id?: string
          kind: string
          label: string
          ok?: boolean
          seq: number
          session_id: string
          user_id: string
        }
        Update: {
          attempt?: number
          created_at?: string
          detail?: Json
          duration_ms?: number | null
          id?: string
          kind?: string
          label?: string
          ok?: boolean
          seq?: number
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_actions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_credential_secrets: {
        Row: {
          ciphertext: string
          credential_id: string
          iv: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ciphertext: string
          credential_id: string
          iv: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ciphertext?: string
          credential_id?: string
          iv?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_credential_secrets_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: true
            referencedRelation: "agent_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_credentials: {
        Row: {
          created_at: string
          id: string
          label: string
          last_used_at: string | null
          login_url: string | null
          origin: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          last_used_at?: string | null
          login_url?: string | null
          origin: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          last_used_at?: string | null
          login_url?: string | null
          origin?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      agent_screenshots: {
        Row: {
          attempt: number
          caption: string | null
          created_at: string
          data_url: string
          id: string
          kind: string
          session_id: string
          user_id: string
        }
        Insert: {
          attempt?: number
          caption?: string | null
          created_at?: string
          data_url: string
          id?: string
          kind?: string
          session_id: string
          user_id: string
        }
        Update: {
          attempt?: number
          caption?: string | null
          created_at?: string
          data_url?: string
          id?: string
          kind?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_screenshots_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_sessions: {
        Row: {
          approval_note: string | null
          approved_at: string | null
          attempt: number
          created_at: string
          credential_id: string | null
          credits_charged: number
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          goal: string
          id: string
          max_attempts: number
          skip_reason: string | null
          started_at: string | null
          status: string
          summary: string | null
          target_url: string
          task: string
          timeout_ms: number
          user_id: string
        }
        Insert: {
          approval_note?: string | null
          approved_at?: string | null
          attempt?: number
          created_at?: string
          credential_id?: string | null
          credits_charged?: number
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          goal?: string
          id?: string
          max_attempts?: number
          skip_reason?: string | null
          started_at?: string | null
          status?: string
          summary?: string | null
          target_url: string
          task?: string
          timeout_ms?: number
          user_id: string
        }
        Update: {
          approval_note?: string | null
          approved_at?: string | null
          attempt?: number
          created_at?: string
          credential_id?: string | null
          credits_charged?: number
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          goal?: string
          id?: string
          max_attempts?: number
          skip_reason?: string | null
          started_at?: string | null
          status?: string
          summary?: string | null
          target_url?: string
          task?: string
          timeout_ms?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_sessions_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "agent_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          client_id: string | null
          content: string
          created_at: string
          id: string
          latency_ms: number | null
          model: string | null
          role: string
          thread_id: string
          tokens: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          content?: string
          created_at?: string
          id?: string
          latency_ms?: number | null
          model?: string | null
          role: string
          thread_id: string
          tokens?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          content?: string
          created_at?: string
          id?: string
          latency_ms?: number | null
          model?: string | null
          role?: string
          thread_id?: string
          tokens?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          mode: string
          project_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          mode?: string
          project_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          mode?: string
          project_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          code: string
          commission_cents: number
          coupon_id: string
          created_at: string
          credits_granted: number
          discount_cents: number
          id: string
          paid_cents: number
          plan_slug: string | null
          user_id: string
        }
        Insert: {
          code: string
          commission_cents?: number
          coupon_id: string
          created_at?: string
          credits_granted?: number
          discount_cents?: number
          id?: string
          paid_cents?: number
          plan_slug?: string | null
          user_id: string
        }
        Update: {
          code?: string
          commission_cents?: number
          coupon_id?: string
          created_at?: string
          credits_granted?: number
          discount_cents?: number
          id?: string
          paid_cents?: number
          plan_slug?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          bonus_credits: number
          code: string
          commission_pct: number
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          kind: string
          max_redemptions: number | null
          note: string | null
          plan_slug: string | null
          reseller_email: string | null
          reseller_name: string | null
          times_redeemed: number
          updated_at: string
          value: number
        }
        Insert: {
          bonus_credits?: number
          code: string
          commission_pct?: number
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          max_redemptions?: number | null
          note?: string | null
          plan_slug?: string | null
          reseller_email?: string | null
          reseller_name?: string | null
          times_redeemed?: number
          updated_at?: string
          value?: number
        }
        Update: {
          bonus_credits?: number
          code?: string
          commission_pct?: number
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          max_redemptions?: number | null
          note?: string | null
          plan_slug?: string | null
          reseller_email?: string | null
          reseller_name?: string | null
          times_redeemed?: number
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      credit_audit_log: {
        Row: {
          action: string | null
          actor_id: string | null
          created_at: string
          credits: number
          details: Json
          event: string
          id: string
          ledger_id: string | null
          user_id: string
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          created_at?: string
          credits?: number
          details?: Json
          event: string
          id?: string
          ledger_id?: string | null
          user_id: string
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          created_at?: string
          credits?: number
          details?: Json
          event?: string
          id?: string
          ledger_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_audit_log_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "credit_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          action: string
          cost_usd: number
          created_at: string
          credits: number
          id: string
          input_tokens: number
          model: string | null
          output_tokens: number
          reason: string | null
          reversal_of: string | null
          reversed_at: string | null
          thread_id: string | null
          tier: string
          tokens: number
          updated_at: string
          upstream_model: string | null
          user_id: string
        }
        Insert: {
          action: string
          cost_usd?: number
          created_at?: string
          credits?: number
          id?: string
          input_tokens?: number
          model?: string | null
          output_tokens?: number
          reason?: string | null
          reversal_of?: string | null
          reversed_at?: string | null
          thread_id?: string | null
          tier: string
          tokens?: number
          updated_at?: string
          upstream_model?: string | null
          user_id: string
        }
        Update: {
          action?: string
          cost_usd?: number
          created_at?: string
          credits?: number
          id?: string
          input_tokens?: number
          model?: string | null
          output_tokens?: number
          reason?: string | null
          reversal_of?: string | null
          reversed_at?: string | null
          thread_id?: string | null
          tier?: string
          tokens?: number
          updated_at?: string
          upstream_model?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "credit_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          last_check: string | null
          status: string
          target: string | null
          thread_id: string | null
          user_id: string
          verification_token: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          last_check?: string | null
          status?: string
          target?: string | null
          thread_id?: string | null
          user_id: string
          verification_token?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          last_check?: string | null
          status?: string
          target?: string | null
          thread_id?: string | null
          user_id?: string
          verification_token?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_domains_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      github_connection_secrets: {
        Row: {
          ciphertext: string
          iv: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ciphertext: string
          iv: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ciphertext?: string
          iv?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      github_connections: {
        Row: {
          auto_push: boolean
          branch: string
          created_at: string
          last_commit: string | null
          last_pushed_at: string | null
          login: string
          owner: string
          repo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_push?: boolean
          branch?: string
          created_at?: string
          last_commit?: string | null
          last_pushed_at?: string | null
          login: string
          owner: string
          repo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_push?: boolean
          branch?: string
          created_at?: string
          last_commit?: string | null
          last_pushed_at?: string | null
          login?: string
          owner?: string
          repo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          credits_granted: number
          currency: string
          id: string
          note: string | null
          plan_slug: string | null
          provider: string
          provider_ref: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          credits_granted?: number
          currency?: string
          id?: string
          note?: string | null
          plan_slug?: string | null
          provider?: string
          provider_ref?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          credits_granted?: number
          currency?: string
          id?: string
          note?: string | null
          plan_slug?: string | null
          provider?: string
          provider_ref?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          features: Json
          id: string
          is_active: boolean
          monthly_credits: number
          name: string
          price_cents: number
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          monthly_credits?: number
          name: string
          price_cents?: number
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          monthly_credits?: number
          name?: string
          price_cents?: number
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          created_at: string
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          is_public?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          is_public?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          monthly_credit_cents: number
          plan: string
          status: string
          suspended_at: string | null
          suspended_by: string | null
          suspended_reason: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          monthly_credit_cents?: number
          plan?: string
          status?: string
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          monthly_credit_cents?: number
          plan?: string
          status?: string
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      request_traces: {
        Row: {
          attempts: Json
          cost_usd: number
          created_at: string
          credits_charged: number
          endpoint: string
          error_message: string | null
          fallback_count: number
          final_model: string | null
          id: string
          input_tokens: number
          latency_ms: number
          mode: string | null
          output_tokens: number
          plan: string | null
          primary_model: string | null
          prompt_chars: number
          status: string
          task: string | null
          thread_id: string | null
          trace_id: string
          user_id: string | null
        }
        Insert: {
          attempts?: Json
          cost_usd?: number
          created_at?: string
          credits_charged?: number
          endpoint: string
          error_message?: string | null
          fallback_count?: number
          final_model?: string | null
          id?: string
          input_tokens?: number
          latency_ms?: number
          mode?: string | null
          output_tokens?: number
          plan?: string | null
          primary_model?: string | null
          prompt_chars?: number
          status?: string
          task?: string | null
          thread_id?: string | null
          trace_id: string
          user_id?: string | null
        }
        Update: {
          attempts?: Json
          cost_usd?: number
          created_at?: string
          credits_charged?: number
          endpoint?: string
          error_message?: string | null
          fallback_count?: number
          final_model?: string | null
          id?: string
          input_tokens?: number
          latency_ms?: number
          mode?: string | null
          output_tokens?: number
          plan?: string | null
          primary_model?: string | null
          prompt_chars?: number
          status?: string
          task?: string | null
          thread_id?: string | null
          trace_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      thread_collaborators: {
        Row: {
          created_at: string
          email: string | null
          id: string
          invited_by: string | null
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          invited_by?: string | null
          role?: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          invited_by?: string | null
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_collaborators_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_stars: {
        Row: {
          created_at: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_stars_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          credits_total: number
          period_start: string
          plan: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_total?: number
          period_start?: string
          plan?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_total?: number
          period_start?: string
          plan?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          created_at: string
          duration_ms: number | null
          error: string | null
          event: string
          id: string
          payload: Json | null
          response_code: number | null
          status: string
          user_id: string
          webhook_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          event: string
          id?: string
          payload?: Json | null
          response_code?: number | null
          status?: string
          user_id: string
          webhook_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          event?: string
          id?: string
          payload?: Json | null
          response_code?: number | null
          status?: string
          user_id?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          active: boolean
          created_at: string
          events: string[]
          id: string
          label: string
          last_delivery_at: string | null
          last_status: string | null
          secret: string
          url: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          events?: string[]
          id?: string
          label?: string
          last_delivery_at?: string | null
          last_status?: string | null
          secret?: string
          url: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          events?: string[]
          id?: string
          label?: string
          last_delivery_at?: string | null
          last_status?: string | null
          secret?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_grant_credits: {
        Args: { _credits: number; _note?: string; _user_id: string }
        Returns: number
      }
      admin_set_user_status: {
        Args: { _reason?: string; _status: string; _user_id: string }
        Returns: undefined
      }
      assert_account_active: { Args: { _user_id: string }; Returns: undefined }
      can_edit_thread: { Args: { _thread: string }; Returns: boolean }
      check_coupon: {
        Args: { _code: string; _plan_slug?: string }
        Returns: Json
      }
      credit_balance: { Args: { _user_id?: string }; Returns: Json }
      downgrade_to_free: { Args: never; Returns: Json }
      finalize_request_usage: {
        Args: {
          _cost_usd: number
          _final_credits: number
          _input_tokens: number
          _ledger_id: string
          _output_tokens: number
          _upstream?: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id?: string }; Returns: boolean }
      record_abuse_attempt: {
        Args: { _details?: Json; _kind: string; _severity?: string }
        Returns: Json
      }
      record_coupon_redemption: {
        Args: {
          _code: string
          _credits: number
          _paid_cents: number
          _plan_slug: string
          _user_id: string
        }
        Returns: Json
      }
      record_request_cost: {
        Args: {
          _cost_usd: number
          _ledger_id: string
          _tokens: number
          _upstream?: string
        }
        Returns: undefined
      }
      reserve_unlimited_usage: {
        Args: {
          _action: string
          _credits: number
          _model?: string
          _reason?: string
          _thread_id?: string
          _tier: string
        }
        Returns: Json
      }
      rollback_charge: {
        Args: { _ledger_id: string; _reason?: string }
        Returns: Json
      }
      spend_credits: {
        Args: {
          _action: string
          _credits: number
          _model?: string
          _reason?: string
          _thread_id?: string
          _tier: string
          _user_id?: string
        }
        Returns: Json
      }
      thread_role: { Args: { _thread: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
