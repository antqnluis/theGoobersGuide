export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      adventure_handoffs: {
        Row: {
          adventure_id: string
          applied: NonNullable<Json>
          campaign_id: string
          change_count: number
          id: string
          imported_at: string
          imported_by: string
          kind: string
          source_label: string | null
          source_text: string
        }
        ComputedFields: never
        Insert: {
          adventure_id: string
          applied?: NonNullable<Json>
          campaign_id: string
          change_count: number
          id?: string
          imported_at?: string
          imported_by?: string
          kind: string
          source_label?: string | null
          source_text: string
        }
        Update: {
          adventure_id?: string
          applied?: NonNullable<Json>
          campaign_id?: string
          change_count?: number
          id?: string
          imported_at?: string
          imported_by?: string
          kind?: string
          source_label?: string | null
          source_text?: string
        }
        Relationships: [
          {
            foreignKeyName: 'adventure_handoffs_adventure_fkey'
            columns: ['adventure_id', 'campaign_id']
            isOneToOne: false
            referencedRelation: 'adventures'
            referencedColumns: ['id', 'campaign_id']
          },
          {
            foreignKeyName: 'adventure_handoffs_imported_by_fkey'
            columns: ['imported_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      adventure_invite_approvals: {
        Row: {
          approved_at: string
          approver_id: string
          participant_id: string
        }
        ComputedFields: never
        Insert: {
          approved_at?: string
          approver_id: string
          participant_id: string
        }
        Update: {
          approved_at?: string
          approver_id?: string
          participant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'adventure_invite_approvals_approver_id_fkey'
            columns: ['approver_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'adventure_invite_approvals_participant_id_fkey'
            columns: ['participant_id']
            isOneToOne: false
            referencedRelation: 'adventure_participants'
            referencedColumns: ['id']
          },
        ]
      }
      adventure_objectives: {
        Row: {
          adventure_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          done: boolean
          handoff_id: string | null
          id: string
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          adventure_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          done?: boolean
          handoff_id?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          adventure_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          done?: boolean
          handoff_id?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'adventure_objectives_adventure_id_fkey'
            columns: ['adventure_id']
            isOneToOne: false
            referencedRelation: 'adventures'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'adventure_objectives_completed_by_fkey'
            columns: ['completed_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'adventure_objectives_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'adventure_objectives_handoff_id_fkey'
            columns: ['handoff_id']
            isOneToOne: false
            referencedRelation: 'adventure_handoffs'
            referencedColumns: ['id']
          },
        ]
      }
      adventure_participants: {
        Row: {
          adventure_id: string
          campaign_id: string
          character_id: string
          created_at: string
          id: string
          invited_by: string | null
          profile_id: string
          responded_at: string | null
          share_consent: boolean
          share_consent_at: string | null
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          adventure_id: string
          campaign_id: string
          character_id: string
          created_at?: string
          id?: string
          invited_by?: string | null
          profile_id: string
          responded_at?: string | null
          share_consent?: boolean
          share_consent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          adventure_id?: string
          campaign_id?: string
          character_id?: string
          created_at?: string
          id?: string
          invited_by?: string | null
          profile_id?: string
          responded_at?: string | null
          share_consent?: boolean
          share_consent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'adventure_participants_adventure_fkey'
            columns: ['adventure_id', 'campaign_id']
            isOneToOne: false
            referencedRelation: 'adventures'
            referencedColumns: ['id', 'campaign_id']
          },
          {
            foreignKeyName: 'adventure_participants_character_campaign_fkey'
            columns: ['character_id', 'campaign_id']
            isOneToOne: false
            referencedRelation: 'characters'
            referencedColumns: ['id', 'campaign_id']
          },
          {
            foreignKeyName: 'adventure_participants_character_owner_fkey'
            columns: ['character_id', 'profile_id']
            isOneToOne: false
            referencedRelation: 'characters'
            referencedColumns: ['id', 'owner_id']
          },
          {
            foreignKeyName: 'adventure_participants_invited_by_fkey'
            columns: ['invited_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      adventure_updates: {
        Row: {
          adventure_id: string
          author_id: string
          body: string
          created_at: string
          handoff_id: string | null
          id: string
        }
        ComputedFields: never
        Insert: {
          adventure_id: string
          author_id?: string
          body: string
          created_at?: string
          handoff_id?: string | null
          id?: string
        }
        Update: {
          adventure_id?: string
          author_id?: string
          body?: string
          created_at?: string
          handoff_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'adventure_updates_adventure_id_fkey'
            columns: ['adventure_id']
            isOneToOne: false
            referencedRelation: 'adventures'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'adventure_updates_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'adventure_updates_handoff_id_fkey'
            columns: ['handoff_id']
            isOneToOne: false
            referencedRelation: 'adventure_handoffs'
            referencedColumns: ['id']
          },
        ]
      }
      adventures: {
        Row: {
          archived_at: string | null
          campaign_id: string
          created_at: string
          created_by: string
          description: string
          id: string
          next_step: string
          reference: string
          status: string
          status_changed_at: string | null
          status_changed_by: string | null
          title: string
          type: string
          updated_at: string
          updated_by: string | null
          visibility: string
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          campaign_id: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          next_step?: string
          reference?: string
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          title: string
          type: string
          updated_at?: string
          updated_by?: string | null
          visibility: string
        }
        Update: {
          archived_at?: string | null
          campaign_id?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          next_step?: string
          reference?: string
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          title?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: 'adventures_campaign_id_fkey'
            columns: ['campaign_id']
            isOneToOne: false
            referencedRelation: 'campaigns'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'adventures_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'adventures_status_changed_by_fkey'
            columns: ['status_changed_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'adventures_updated_by_fkey'
            columns: ['updated_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
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
      character_imports: {
        Row: {
          change_count: number
          character_id: string
          id: string
          imported_at: string
          imported_by: string
          kind: string
          source_label: string | null
        }
        ComputedFields: never
        Insert: {
          change_count: number
          character_id: string
          id?: string
          imported_at?: string
          imported_by: string
          kind: string
          source_label?: string | null
        }
        Update: {
          change_count?: number
          character_id?: string
          id?: string
          imported_at?: string
          imported_by?: string
          kind?: string
          source_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'character_imports_character_id_fkey'
            columns: ['character_id']
            isOneToOne: false
            referencedRelation: 'characters'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'character_imports_imported_by_fkey'
            columns: ['imported_by']
            isOneToOne: false
            referencedRelation: 'profiles'
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
      dice_rolls: {
        Row: {
          campaign_id: string
          character_id: string | null
          created_at: string
          dice: NonNullable<Json>
          expression: string
          id: string
          label: string | null
          roller_id: string
          source: string
          terms: NonNullable<Json>
          total: number
          visibility: string
        }
        ComputedFields: never
        Insert: {
          campaign_id: string
          character_id?: string | null
          created_at?: string
          dice: NonNullable<Json>
          expression: string
          id?: string
          label?: string | null
          roller_id: string
          source: string
          terms: NonNullable<Json>
          total: number
          visibility: string
        }
        Update: {
          campaign_id?: string
          character_id?: string | null
          created_at?: string
          dice?: NonNullable<Json>
          expression?: string
          id?: string
          label?: string | null
          roller_id?: string
          source?: string
          terms?: NonNullable<Json>
          total?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: 'dice_rolls_campaign_id_fkey'
            columns: ['campaign_id']
            isOneToOne: false
            referencedRelation: 'campaigns'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'dice_rolls_character_campaign_fkey'
            columns: ['character_id', 'campaign_id']
            isOneToOne: false
            referencedRelation: 'characters'
            referencedColumns: ['id', 'campaign_id']
          },
          {
            foreignKeyName: 'dice_rolls_character_owner_fkey'
            columns: ['character_id', 'roller_id']
            isOneToOne: false
            referencedRelation: 'characters'
            referencedColumns: ['id', 'owner_id']
          },
          {
            foreignKeyName: 'dice_rolls_roller_id_fkey'
            columns: ['roller_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      notes: {
        Row: {
          author_id: string
          body: string
          campaign_id: string
          character_id: string | null
          created_at: string
          id: string
          title: string
          updated_at: string
          updated_by: string | null
          visibility: string
        }
        ComputedFields: never
        Insert: {
          author_id?: string
          body?: string
          campaign_id: string
          character_id?: string | null
          created_at?: string
          id?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          visibility?: string
        }
        Update: {
          author_id?: string
          body?: string
          campaign_id?: string
          character_id?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: 'notes_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notes_campaign_id_fkey'
            columns: ['campaign_id']
            isOneToOne: false
            referencedRelation: 'campaigns'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notes_character_fkey'
            columns: ['character_id', 'campaign_id']
            isOneToOne: false
            referencedRelation: 'characters'
            referencedColumns: ['id', 'campaign_id']
          },
          {
            foreignKeyName: 'notes_updated_by_fkey'
            columns: ['updated_by']
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
      apply_character_update: {
        Args: {
          p_changes: Json
          p_character_id: string
          p_expected: Json
          p_source_label?: string
        }
        Returns: string
      }
      approve_adventure_participant: { Args: { p_participant_id: string }; Returns: undefined }
      attach_adventure_handoff: {
        Args: {
          p_adventure_id: string
          p_changes: Json
          p_expected: Json
          p_source_label?: string
          p_source_text: string
        }
        Returns: string
      }
      cancel_adventure_participant: { Args: { p_participant_id: string }; Returns: undefined }
      cancel_campaign_invitation: { Args: { p_invitation_id: string }; Returns: undefined }
      count_my_adventure_requests: { Args: { p_campaign_id: string }; Returns: number }
      create_adventure: {
        Args: {
          p_campaign_id: string
          p_character_id?: string
          p_description?: string
          p_next_step?: string
          p_title: string
          p_type: string
        }
        Returns: string
      }
      create_adventure_from_handoff: {
        Args: {
          p_campaign_id: string
          p_changes: Json
          p_character_id: string
          p_source_label?: string
          p_source_text: string
          p_type: string
        }
        Returns: string
      }
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
      import_character: {
        Args: { p_campaign_id: string; p_character: Json; p_source_label?: string }
        Returns: string
      }
      leave_adventure: { Args: { p_adventure_id: string }; Returns: undefined }
      leave_campaign: { Args: { p_campaign_id: string }; Returns: undefined }
      list_campaign_outgoing_invitations: {
        Args: { p_campaign_id: string }
        Returns: {
          id: string
          recipient_username: string
        }[]
      }
      list_my_adventure_invitations: {
        Args: { p_campaign_id: string }
        Returns: {
          adventure_id: string
          character_id: string
          invited_at: string
          invited_by: string
          participant_id: string
          shared_with_party: boolean
          title: string
          type: string
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
      propose_adventure_participant: {
        Args: { p_adventure_id: string; p_character_id: string }
        Returns: string
      }
      remove_campaign_member: {
        Args: { p_campaign_id: string; p_profile_id: string }
        Returns: undefined
      }
      resolve_username_email: { Args: { account_username: string }; Returns: string }
      respond_to_adventure_invitation: {
        Args: { p_accept: boolean; p_keep_shared?: boolean; p_participant_id: string }
        Returns: undefined
      }
      respond_to_campaign_invitation: {
        Args: { p_accept: boolean; p_invitation_id: string }
        Returns: undefined
      }
      roll_dice: {
        Args: {
          p_campaign_id: string
          p_character_id?: string
          p_label?: string
          p_source?: string
          p_terms: Json
          p_visibility?: string
        }
        Returns: {
          campaign_id: string
          character_id: string | null
          created_at: string
          dice: NonNullable<Json>
          expression: string
          id: string
          label: string | null
          roller_id: string
          source: string
          terms: NonNullable<Json>
          total: number
          visibility: string
        }
        SetofOptions: {
          from: '*'
          to: 'dice_rolls'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_campaign_invitation: {
        Args: { p_campaign_id: string; p_username: string }
        Returns: string
      }
      set_adventure_share_consent: {
        Args: { p_adventure_id: string; p_consent: boolean }
        Returns: undefined
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
