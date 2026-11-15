export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      campaign_appearances: {
        Row: {
          campaign_id: string
          cloak: number
          created_at: string
          headwear: string
          pack: string
          profile_id: string
          skin: number
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          campaign_id: string
          cloak: number
          created_at?: string
          headwear: string
          pack: string
          profile_id?: string
          skin: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          cloak?: number
          created_at?: string
          headwear?: string
          pack?: string
          profile_id?: string
          skin?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'campaign_appearances_campaign_id_fkey'
            columns: ['campaign_id']
            isOneToOne: false
            referencedRelation: 'campaigns'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'campaign_appearances_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      campaign_invitations: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          inviter_id: string
          recipient_id: string
          resolved_at: string | null
          status: string
        }
        ComputedFields: never
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          inviter_id: string
          recipient_id: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          inviter_id?: string
          recipient_id?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'campaign_invitations_campaign_id_fkey'
            columns: ['campaign_id']
            isOneToOne: false
            referencedRelation: 'campaigns'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'campaign_invitations_inviter_id_fkey'
            columns: ['inviter_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'campaign_invitations_recipient_id_fkey'
            columns: ['recipient_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      campaign_members: {
        Row: {
          campaign_id: string
          id: string
          joined_at: string
          profile_id: string
          role: string
        }
        ComputedFields: never
        Insert: {
          campaign_id: string
          id?: string
          joined_at?: string
          profile_id: string
          role?: string
        }
        Update: {
          campaign_id?: string
          id?: string
          joined_at?: string
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: 'campaign_members_campaign_id_fkey'
            columns: ['campaign_id']
            isOneToOne: false
            referencedRelation: 'campaigns'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'campaign_members_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'campaigns_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      character_currency_log: {
        Row: {
          character_id: string
          cp_after: number
          cp_delta: number
          created_at: string
          gp_after: number
          gp_delta: number
          id: string
          seq: number
          sp_after: number
          sp_delta: number
        }
        ComputedFields: never
        Insert: {
          character_id: string
          cp_after: number
          cp_delta: number
          created_at?: string
          gp_after: number
          gp_delta: number
          id?: string
          seq?: never
          sp_after: number
          sp_delta: number
        }
        Update: {
          character_id?: string
          cp_after?: number
          cp_delta?: number
          created_at?: string
          gp_after?: number
          gp_delta?: number
          id?: string
          seq?: never
          sp_after?: number
          sp_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: 'character_currency_log_character_id_fkey'
            columns: ['character_id']
            isOneToOne: false
            referencedRelation: 'characters'
            referencedColumns: ['id']
          },
        ]
      }
      character_items: {
        Row: {
          attuned: boolean
          character_id: string
          created_at: string
          description: string | null
          equipped: boolean
          id: string
          name: string
          quantity: number
          updated_at: string
          weight: number | null
        }
        ComputedFields: never
        Insert: {
          attuned?: boolean
          character_id: string
          created_at?: string
          description?: string | null
          equipped?: boolean
          id?: string
          name: string
          quantity?: number
          updated_at?: string
          weight?: number | null
        }
        Update: {
          attuned?: boolean
          character_id?: string
          created_at?: string
          description?: string | null
          equipped?: boolean
          id?: string
          name?: string
          quantity?: number
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'character_items_character_id_fkey'
            columns: ['character_id']
            isOneToOne: false
            referencedRelation: 'characters'
            referencedColumns: ['id']
          },
        ]
      }
      character_sheets: {
        Row: {
          armor_class: number | null
          character_id: string
          cp: number
          current_hp: number | null
          gp: number
          max_hp: number | null
          sheet: NonNullable<Json>
          sp: number
          speed: number | null
          temp_hp: number
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          armor_class?: number | null
          character_id: string
          cp?: number
          current_hp?: number | null
          gp?: number
          max_hp?: number | null
          sheet?: NonNullable<Json>
          sp?: number
          speed?: number | null
          temp_hp?: number
          updated_at?: string
        }
        Update: {
          armor_class?: number | null
          character_id?: string
          cp?: number
          current_hp?: number | null
          gp?: number
          max_hp?: number | null
          sheet?: NonNullable<Json>
          sp?: number
          speed?: number | null
          temp_hp?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'character_sheets_character_id_fkey'
            columns: ['character_id']
            isOneToOne: true
            referencedRelation: 'characters'
            referencedColumns: ['id']
          },
        ]
      }
      characters: {
        Row: {
          background: string | null
          campaign_id: string
          class_name: string | null
          created_at: string
          id: string
          in_party: boolean
          level: number
          name: string
          owner_id: string
          portrait_path: string | null
          sheet_visibility: string
          species: string | null
          status: string
          status_changed_at: string
          subclass: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          background?: string | null
          campaign_id: string
          class_name?: string | null
          created_at?: string
          id?: string
          in_party?: boolean
          level?: number
          name: string
          owner_id?: string
          portrait_path?: string | null
          sheet_visibility?: string
          species?: string | null
          status?: string
          status_changed_at?: string
          subclass?: string | null
          updated_at?: string
        }
        Update: {
          background?: string | null
          campaign_id?: string
          class_name?: string | null
          created_at?: string
          id?: string
          in_party?: boolean
          level?: number
          name?: string
          owner_id?: string
          portrait_path?: string | null
          sheet_visibility?: string
          species?: string | null
          status?: string
          status_changed_at?: string
          subclass?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'characters_campaign_id_fkey'
            columns: ['campaign_id']
            isOneToOne: false
            referencedRelation: 'campaigns'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'characters_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          username: string | null
        }
        ComputedFields: never
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_character_currency: {
        Args: { p_character_id: string; p_cp?: number; p_gp?: number; p_sp?: number }
        Returns: {
          cp: number
          gp: number
          sp: number
          updated_at: string
        }[]
      }
      adjust_character_item_quantity: {
        Args: { p_delta: number; p_item_id: string }
        Returns: number
      }
      cancel_campaign_invitation: { Args: { p_invitation_id: string }; Returns: undefined }
      create_character: {
        Args: {
          p_background?: string
          p_campaign_id: string
          p_class_name?: string
          p_in_party?: boolean
          p_level?: number
          p_name: string
          p_species?: string
          p_subclass?: string
        }
        Returns: string
      }
      get_campaign_party: {
        Args: { p_campaign_id: string }
        Returns: {
          display_name: string
          profile_id: string
          role: string
          username: string
        }[]
      }
      get_campaign_roster: {
        Args: { p_campaign_id: string }
        Returns: {
          profile_id: string
          role: string
          username: string
        }[]
      }
      leave_campaign: { Args: { p_campaign_id: string }; Returns: undefined }
      list_campaign_outgoing_invitations: {
        Args: { p_campaign_id: string }
        Returns: {
          id: string
          recipient_username: string
        }[]
      }
      list_my_campaign_invitations: {
        Args: Record<PropertyKey, never>
        Returns: {
          campaign_name: string
          id: string
          inviter_username: string
        }[]
      }
      remove_campaign_member: {
        Args: { p_campaign_id: string; p_profile_id: string }
        Returns: undefined
      }
      resolve_username_email: { Args: { account_username: string }; Returns: string }
      respond_to_campaign_invitation: {
        Args: { p_accept: boolean; p_invitation_id: string }
        Returns: undefined
      }
      send_campaign_invitation: {
        Args: { p_campaign_id: string; p_username: string }
        Returns: string
      }
      set_campaign_appearance: {
        Args: {
          p_campaign_id: string
          p_cloak: number
          p_headwear: string
          p_pack: string
          p_skin: number
        }
        Returns: undefined
      }
      set_character_in_party: {
        Args: { p_character_id: string; p_in_party: boolean }
        Returns: undefined
      }
      set_character_status: {
        Args: { p_character_id: string; p_status: string }
        Returns: undefined
      }
      transfer_campaign_ownership: {
        Args: { p_campaign_id: string; p_profile_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
