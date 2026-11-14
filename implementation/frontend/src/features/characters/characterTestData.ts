import type { CharacterItem, CharacterSheet, CharacterSummary } from './characterTypes'
import { defaultSheetBody } from './characterValidation'

export const userId = '00000000-0000-4000-8000-000000000001'
export const campaignId = '00000000-0000-4000-8000-000000000011'

export function character(overrides: Partial<CharacterSummary> = {}): CharacterSummary {
  return {
    id: '00000000-0000-4000-8000-000000000021',
    campaign_id: campaignId,
    owner_id: userId,
    name: 'Brand',
    species: 'Elf',
    class_name: 'Fighter',
    subclass: null,
    background: null,
    level: 3,
    status: 'active',
    in_party: true,
    sheet_visibility: 'private',
    portrait_path: null,
    status_changed_at: '2026-11-13T10:00:00+00:00',
    created_at: '2026-11-13T10:00:00+00:00',
    updated_at: '2026-11-13T10:00:00+00:00',
    ...overrides,
  }
}

export function sheet(overrides: Partial<CharacterSheet> = {}): CharacterSheet {
  return {
    character_id: '00000000-0000-4000-8000-000000000021',
    max_hp: 30,
    current_hp: 12,
    temp_hp: 0,
    armor_class: 15,
    speed: 30,
    cp: 0,
    sp: 0,
    gp: 0,
    updated_at: '2026-11-13T10:05:00+00:00',
    sheet: defaultSheetBody(),
    ...overrides,
  }
}

export function item(overrides: Partial<CharacterItem> = {}): CharacterItem {
  return {
    id: '00000000-0000-4000-8000-000000000031',
    character_id: '00000000-0000-4000-8000-000000000021',
    name: 'Rope',
    quantity: 1,
    weight: null,
    description: null,
    equipped: false,
    attuned: false,
    created_at: '2026-11-14T10:00:00+00:00',
    updated_at: '2026-11-14T10:00:00+00:00',
    ...overrides,
  }
}
