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
      activity_logs: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      activity_profile_service_types: {
        Row: {
          activity_profile_id: string
          created_at: string
          default_unit_price: number | null
          id: string
          is_active: boolean
          name: string
          sat_key: string
          sat_unit: string
          sort_order: number
        }
        Insert: {
          activity_profile_id: string
          created_at?: string
          default_unit_price?: number | null
          id?: string
          is_active?: boolean
          name: string
          sat_key: string
          sat_unit: string
          sort_order?: number
        }
        Update: {
          activity_profile_id?: string
          created_at?: string
          default_unit_price?: number | null
          id?: string
          is_active?: boolean
          name?: string
          sat_key?: string
          sat_unit?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "activity_profile_service_types_activity_profile_id_fkey"
            columns: ["activity_profile_id"]
            isOneToOne: false
            referencedRelation: "activity_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_profiles: {
        Row: {
          activity_category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          key: string
          name: string
          sort_order: number
        }
        Insert: {
          activity_category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key: string
          name: string
          sort_order?: number
        }
        Update: {
          activity_category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      admin_stamp_grants: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          granted_by: string
          id: string
          reason: string
          stamp_transaction_id: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          granted_by: string
          id?: string
          reason: string
          stamp_transaction_id: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          granted_by?: string
          id?: string
          reason?: string
          stamp_transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_stamp_grants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_stamp_grants_stamp_transaction_id_fkey"
            columns: ["stamp_transaction_id"]
            isOneToOne: false
            referencedRelation: "stamp_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_receipts: {
        Row: {
          amount_cents: number
          cfdi_limit: number
          company_id: string
          created_at: string
          currency: string
          id: string
          kind: string
          period_end: string
          period_start: string
          plan_name: string
          stripe_invoice_id: string
        }
        Insert: {
          amount_cents: number
          cfdi_limit: number
          company_id: string
          created_at?: string
          currency: string
          id?: string
          kind: string
          period_end: string
          period_start: string
          plan_name: string
          stripe_invoice_id: string
        }
        Update: {
          amount_cents?: number
          cfdi_limit?: number
          company_id?: string
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          period_end?: string
          period_start?: string
          plan_name?: string
          stripe_invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          business_category: string | null
          cfdi_use: string | null
          company_id: string | null
          created_at: string
          email: string | null
          id: string
          is_favorite: boolean
          is_technology_platform: boolean
          legal_name: string
          notes: string | null
          phone: string | null
          postal_code: string | null
          rfc: string
          tax_regime: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          business_category?: string | null
          cfdi_use?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_favorite?: boolean
          is_technology_platform?: boolean
          legal_name: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          rfc: string
          tax_regime?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          business_category?: string | null
          cfdi_use?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_favorite?: boolean
          is_technology_platform?: boolean
          legal_name?: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          rfc?: string
          tax_regime?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          activity_profile_id: string | null
          address: string | null
          branch: string | null
          city: string | null
          created_at: string
          csd_cer_url: string | null
          csd_key_url: string | null
          csd_last_error: string | null
          csd_serial_number: string | null
          csd_status: string
          csd_uploaded_at: string | null
          csd_valid_from: string | null
          csd_valid_to: string | null
          default_global_periodicity: string | null
          email: string | null
          facturama_csd_last_error: string | null
          facturama_csd_status: string
          facturama_csd_synced_at: string | null
          id: string
          is_default: boolean
          legal_name: string
          logo_url: string | null
          onboarding_completed: boolean
          phone: string | null
          postal_code: string | null
          rfc: string
          state: string | null
          tax_regime: string | null
          trade_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_profile_id?: string | null
          address?: string | null
          branch?: string | null
          city?: string | null
          created_at?: string
          csd_cer_url?: string | null
          csd_key_url?: string | null
          csd_last_error?: string | null
          csd_serial_number?: string | null
          csd_status?: string
          csd_uploaded_at?: string | null
          csd_valid_from?: string | null
          csd_valid_to?: string | null
          default_global_periodicity?: string | null
          email?: string | null
          facturama_csd_last_error?: string | null
          facturama_csd_status?: string
          facturama_csd_synced_at?: string | null
          id?: string
          is_default?: boolean
          legal_name: string
          logo_url?: string | null
          onboarding_completed?: boolean
          phone?: string | null
          postal_code?: string | null
          rfc: string
          state?: string | null
          tax_regime?: string | null
          trade_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_profile_id?: string | null
          address?: string | null
          branch?: string | null
          city?: string | null
          created_at?: string
          csd_cer_url?: string | null
          csd_key_url?: string | null
          csd_last_error?: string | null
          csd_serial_number?: string | null
          csd_status?: string
          csd_uploaded_at?: string | null
          csd_valid_from?: string | null
          csd_valid_to?: string | null
          default_global_periodicity?: string | null
          email?: string | null
          facturama_csd_last_error?: string | null
          facturama_csd_status?: string
          facturama_csd_synced_at?: string | null
          id?: string
          is_default?: boolean
          legal_name?: string
          logo_url?: string | null
          onboarding_completed?: boolean
          phone?: string | null
          postal_code?: string | null
          rfc?: string
          state?: string | null
          tax_regime?: string | null
          trade_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_activity_profile_id_fkey"
            columns: ["activity_profile_id"]
            isOneToOne: false
            referencedRelation: "activity_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          discount: number
          id: string
          invoice_id: string
          isr_retencion_amount: number
          isr_retencion_rate: number
          iva_amount: number
          iva_rate: number
          iva_retencion_amount: number
          iva_retencion_rate: number
          position: number
          product_id: string | null
          quantity: number
          sat_key: string
          sat_unit: string
          tax_object: string
          unit_name: string | null
          unit_price: number
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          discount?: number
          id?: string
          invoice_id: string
          isr_retencion_amount?: number
          isr_retencion_rate?: number
          iva_amount?: number
          iva_rate?: number
          iva_retencion_amount?: number
          iva_retencion_rate?: number
          position?: number
          product_id?: string | null
          quantity?: number
          sat_key: string
          sat_unit: string
          tax_object?: string
          unit_name?: string | null
          unit_price?: number
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          discount?: number
          id?: string
          invoice_id?: string
          isr_retencion_amount?: number
          isr_retencion_rate?: number
          iva_amount?: number
          iva_rate?: number
          iva_retencion_amount?: number
          iva_retencion_rate?: number
          position?: number
          product_id?: string | null
          quantity?: number
          sat_key?: string
          sat_unit?: string
          tax_object?: string
          unit_name?: string | null
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_profiles: {
        Row: {
          cfdi_type: string
          company_id: string
          created_at: string
          currency: string
          export_code: string
          id: string
          is_default: boolean
          payment_form: string
          payment_method: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cfdi_type?: string
          company_id: string
          created_at?: string
          currency?: string
          export_code?: string
          id?: string
          is_default?: boolean
          payment_form?: string
          payment_method?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cfdi_type?: string
          company_id?: string
          created_at?: string
          currency?: string
          export_code?: string
          id?: string
          is_default?: boolean
          payment_form?: string
          payment_method?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          cancellation_pac_response: Json | null
          cancellation_reason: string | null
          cancellation_replacement_uuid: string | null
          cancellation_requested_at: string | null
          cancellation_status: string | null
          cancelled_at: string | null
          cfdi_type: string
          cfdi_use: string | null
          client_id: string | null
          client_snapshot: Json | null
          company_id: string | null
          company_snapshot: Json | null
          created_at: string
          currency: string
          discount: number
          duplicated_from_invoice_id: string | null
          email_last_error: string | null
          email_sent_at: string | null
          exchange_rate: number
          exportation: string
          facturama_id: string | null
          folio: number
          global_months: string | null
          global_periodicity: string | null
          global_year: number | null
          id: string
          is_global: boolean
          isr_retencion_total: number
          issued_at: string | null
          iva_retencion_total: number
          iva_total: number
          last_stamp_attempt_at: string | null
          notes: string | null
          pac_response: Json | null
          payment_form: string | null
          payment_method: string | null
          pdf_url: string | null
          retentions_total: number
          series: string
          stamp_attempts: number
          stamp_error_code: string | null
          stamp_error_message: string | null
          stamped_at: string | null
          stamping_error: string | null
          stamping_started_at: string | null
          stamping_status: string
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          total: number
          updated_at: string
          user_id: string
          uuid_fiscal: string | null
          xml_url: string | null
        }
        Insert: {
          cancellation_pac_response?: Json | null
          cancellation_reason?: string | null
          cancellation_replacement_uuid?: string | null
          cancellation_requested_at?: string | null
          cancellation_status?: string | null
          cancelled_at?: string | null
          cfdi_type?: string
          cfdi_use?: string | null
          client_id?: string | null
          client_snapshot?: Json | null
          company_id?: string | null
          company_snapshot?: Json | null
          created_at?: string
          currency?: string
          discount?: number
          duplicated_from_invoice_id?: string | null
          email_last_error?: string | null
          email_sent_at?: string | null
          exchange_rate?: number
          exportation?: string
          facturama_id?: string | null
          folio: number
          global_months?: string | null
          global_periodicity?: string | null
          global_year?: number | null
          id?: string
          is_global?: boolean
          isr_retencion_total?: number
          issued_at?: string | null
          iva_retencion_total?: number
          iva_total?: number
          last_stamp_attempt_at?: string | null
          notes?: string | null
          pac_response?: Json | null
          payment_form?: string | null
          payment_method?: string | null
          pdf_url?: string | null
          retentions_total?: number
          series?: string
          stamp_attempts?: number
          stamp_error_code?: string | null
          stamp_error_message?: string | null
          stamped_at?: string | null
          stamping_error?: string | null
          stamping_started_at?: string | null
          stamping_status?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          user_id: string
          uuid_fiscal?: string | null
          xml_url?: string | null
        }
        Update: {
          cancellation_pac_response?: Json | null
          cancellation_reason?: string | null
          cancellation_replacement_uuid?: string | null
          cancellation_requested_at?: string | null
          cancellation_status?: string | null
          cancelled_at?: string | null
          cfdi_type?: string
          cfdi_use?: string | null
          client_id?: string | null
          client_snapshot?: Json | null
          company_id?: string | null
          company_snapshot?: Json | null
          created_at?: string
          currency?: string
          discount?: number
          duplicated_from_invoice_id?: string | null
          email_last_error?: string | null
          email_sent_at?: string | null
          exchange_rate?: number
          exportation?: string
          facturama_id?: string | null
          folio?: number
          global_months?: string | null
          global_periodicity?: string | null
          global_year?: number | null
          id?: string
          is_global?: boolean
          isr_retencion_total?: number
          issued_at?: string | null
          iva_retencion_total?: number
          iva_total?: number
          last_stamp_attempt_at?: string | null
          notes?: string | null
          pac_response?: Json | null
          payment_form?: string | null
          payment_method?: string | null
          pdf_url?: string | null
          retentions_total?: number
          series?: string
          stamp_attempts?: number
          stamp_error_code?: string | null
          stamp_error_message?: string | null
          stamped_at?: string | null
          stamping_error?: string | null
          stamping_started_at?: string | null
          stamping_status?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          user_id?: string
          uuid_fiscal?: string | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_duplicated_from_invoice_id_fkey"
            columns: ["duplicated_from_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          metadata: Json | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          metadata?: Json | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          metadata?: Json | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string | null
          paid_at: string
          payment_form: string | null
          reference: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string | null
          paid_at?: string
          payment_form?: string | null
          reference?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string | null
          paid_at?: string
          payment_form?: string | null
          reference?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          facturas_incluidas: number
          features: Json
          id: string
          is_active: boolean
          key: string
          nombre: string
          precio_mxn: number
          stripe_price_id: string | null
          stripe_price_id_test: string | null
        }
        Insert: {
          created_at?: string
          facturas_incluidas: number
          features?: Json
          id?: string
          is_active?: boolean
          key: string
          nombre: string
          precio_mxn: number
          stripe_price_id?: string | null
          stripe_price_id_test?: string | null
        }
        Update: {
          created_at?: string
          facturas_incluidas?: number
          features?: Json
          id?: string
          is_active?: boolean
          key?: string
          nombre?: string
          precio_mxn?: number
          stripe_price_id?: string | null
          stripe_price_id_test?: string | null
        }
        Relationships: []
      }
      platform_isr_brackets: {
        Row: {
          created_at: string
          fundamento_legal: string | null
          id: string
          is_active: boolean
          isr_pct: number
          iva_retencion_con_rfc_pct: number
          iva_retencion_sin_rfc_pct: number
          max_monthly_income: number | null
          min_monthly_income: number
          platform_activity_type: string
          updated_at: string
          vigente_desde: string
        }
        Insert: {
          created_at?: string
          fundamento_legal?: string | null
          id?: string
          is_active?: boolean
          isr_pct: number
          iva_retencion_con_rfc_pct?: number
          iva_retencion_sin_rfc_pct?: number
          max_monthly_income?: number | null
          min_monthly_income: number
          platform_activity_type: string
          updated_at?: string
          vigente_desde?: string
        }
        Update: {
          created_at?: string
          fundamento_legal?: string | null
          id?: string
          is_active?: boolean
          isr_pct?: number
          iva_retencion_con_rfc_pct?: number
          iva_retencion_sin_rfc_pct?: number
          max_monthly_income?: number | null
          min_monthly_income?: number
          platform_activity_type?: string
          updated_at?: string
          vigente_desde?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          categoria: Database["public"]["Enums"]["product_categoria"]
          category: string | null
          company_id: string | null
          created_at: string
          description: string
          id: string
          image_url: string | null
          internal_code: string | null
          is_active: boolean
          isr_retencion_rate: number | null
          iva_rate: number
          iva_retencion_rate: number | null
          sat_key: string
          sat_unit: string
          tax_object: string
          unit_name: string | null
          unit_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          categoria?: Database["public"]["Enums"]["product_categoria"]
          category?: string | null
          company_id?: string | null
          created_at?: string
          description: string
          id?: string
          image_url?: string | null
          internal_code?: string | null
          is_active?: boolean
          isr_retencion_rate?: number | null
          iva_rate?: number
          iva_retencion_rate?: number | null
          sat_key: string
          sat_unit: string
          tax_object?: string
          unit_name?: string | null
          unit_price?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          categoria?: Database["public"]["Enums"]["product_categoria"]
          category?: string | null
          company_id?: string | null
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          internal_code?: string | null
          is_active?: boolean
          isr_retencion_rate?: number | null
          iva_rate?: number
          iva_retencion_rate?: number | null
          sat_key?: string
          sat_unit?: string
          tax_object?: string
          unit_name?: string | null
          unit_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sat_economic_activities: {
        Row: {
          activity_profile_id: string | null
          created_at: string
          description: string
          id: string
          scian_code: string | null
        }
        Insert: {
          activity_profile_id?: string | null
          created_at?: string
          description: string
          id?: string
          scian_code?: string | null
        }
        Update: {
          activity_profile_id?: string | null
          created_at?: string
          description?: string
          id?: string
          scian_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sat_economic_activities_activity_profile_id_fkey"
            columns: ["activity_profile_id"]
            isOneToOne: false
            referencedRelation: "activity_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          biometrics_enabled: boolean
          default_cfdi_use: string | null
          default_payment_form: string | null
          default_payment_method: string | null
          notification_preferences: Json | null
          notifications_enabled: boolean
          pin_enabled: boolean
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          biometrics_enabled?: boolean
          default_cfdi_use?: string | null
          default_payment_form?: string | null
          default_payment_method?: string | null
          notification_preferences?: Json | null
          notifications_enabled?: boolean
          pin_enabled?: boolean
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          biometrics_enabled?: boolean
          default_cfdi_use?: string | null
          default_payment_form?: string | null
          default_payment_method?: string | null
          notification_preferences?: Json | null
          notifications_enabled?: boolean
          pin_enabled?: boolean
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stamp_transactions: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          id: string
          reference_id: string | null
          subscription_id: string | null
          type: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          id?: string
          reference_id?: string | null
          subscription_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          id?: string
          reference_id?: string | null
          subscription_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stamp_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stamp_transactions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      stamp_wallets: {
        Row: {
          balance: number
          company_id: string
          reserved_stamps: number
          updated_at: string
        }
        Insert: {
          balance?: number
          company_id: string
          reserved_stamps?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          company_id?: string
          reserved_stamps?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stamp_wallets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          company_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          company_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          company_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_withholding_rules: {
        Row: {
          activity_category: string
          client_type: string
          created_at: string
          fundamento_legal: string | null
          id: string
          is_active: boolean
          isr_retencion_pct: number
          iva_retencion_pct: number
          notes: string | null
          objeto_imp: string
          tax_regime: string
          updated_at: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          activity_category: string
          client_type: string
          created_at?: string
          fundamento_legal?: string | null
          id?: string
          is_active?: boolean
          isr_retencion_pct?: number
          iva_retencion_pct?: number
          notes?: string | null
          objeto_imp?: string
          tax_regime: string
          updated_at?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          activity_category?: string
          client_type?: string
          created_at?: string
          fundamento_legal?: string | null
          id?: string
          is_active?: boolean
          isr_retencion_pct?: number
          iva_retencion_pct?: number
          notes?: string | null
          objeto_imp?: string
          tax_regime?: string
          updated_at?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: []
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
          role?: Database["public"]["Enums"]["app_role"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_grant_free_invoices: {
        Args: { p_amount: number; p_company_id: string; p_reason: string }
        Returns: Json
      }
      admin_list_companies: {
        Args: { p_search?: string }
        Returns: {
          company_id: string
          created_at: string
          email: string
          legal_name: string
          phone: string
          plan_key: string
          plan_nombre: string
          rfc: string
          stamp_balance: number
          subscription_status: string
          trade_name: string
        }[]
      }
      claim_cfdi_stamp: { Args: { p_invoice_id: string }; Returns: boolean }
      consume_invoice_stamp: {
        Args: { p_company_id: string; p_invoice_id: string }
        Returns: number
      }
      current_user_is_admin: { Args: never; Returns: boolean }
      finalize_cfdi_cancellation: {
        Args: {
          p_cancelled: boolean
          p_cancelled_at: string
          p_invoice_id: string
          p_motive: string
          p_pac_response: Json
          p_request_date: string
          p_uuid_replacement: string
        }
        Returns: undefined
      }
      finalize_cfdi_stamp: {
        Args: {
          p_invoice_id: string
          p_pac_response: Json
          p_pdf_url: string
          p_uuid_fiscal: string
          p_xml_url: string
        }
        Returns: {
          balance: number
        }[]
      }
      finalize_cfdi_stamp_reconciliation: {
        Args: {
          p_invoice_id: string
          p_pac_response: Json
          p_pdf_url: string
          p_uuid_fiscal: string
          p_xml_url: string
        }
        Returns: {
          balance: number
        }[]
      }
      finalize_cfdi_stamp_reconciliation_auto: {
        Args: {
          p_invoice_id: string
          p_pac_response: Json
          p_pdf_url: string
          p_uuid_fiscal: string
          p_xml_url: string
        }
        Returns: {
          balance: number
        }[]
      }
      fn_consume_stamp: {
        Args: { p_company_id: string; p_invoice_id: string }
        Returns: boolean
      }
      get_csd_encryption_key: { Args: never; Returns: string }
      get_dashboard_metrics: { Args: never; Returns: Json }
      get_dashboard_metrics_internal: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_cfdi_cancellation_error: {
        Args: { p_invoice_id: string; p_pac_response: Json }
        Returns: undefined
      }
      mark_cfdi_stamp_reconciliation_required: {
        Args: { p_error: string; p_invoice_id: string; p_pac_response?: Json }
        Returns: undefined
      }
      record_invoice_email_delivery: {
        Args: { p_error?: string; p_invoice_id: string; p_sent: boolean }
        Returns: undefined
      }
      release_cfdi_stamp_claim: {
        Args: { p_error: string; p_invoice_id: string }
        Returns: undefined
      }
      release_cfdi_stamp_reconciliation: {
        Args: { p_invoice_id: string; p_note: string }
        Returns: undefined
      }
      reverse_invoice_stamp: {
        Args: { p_company_id: string; p_invoice_id: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "user" | "admin_grants"
      invoice_status: "draft" | "issued" | "cancelled" | "error" | "processing"
      product_categoria: "contabilidad" | "fiscal" | "laboral" | "mercantil"
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
      app_role: ["admin", "user", "admin_grants"],
      invoice_status: ["draft", "issued", "cancelled", "error", "processing"],
      product_categoria: ["contabilidad", "fiscal", "laboral", "mercantil"],
    },
  },
} as const
