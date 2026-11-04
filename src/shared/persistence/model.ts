import type { Campaign } from '../../features/campaigns/model';
import type { Character } from '../../features/characters/model';
import type { CampaignNote } from '../../features/notes/model';

export const SCHEMA_VERSION = 1 as const;

export interface AppData {
  schemaVersion: typeof SCHEMA_VERSION;
  campaigns: Campaign[];
  characters: Character[];
  notes: CampaignNote[];
}

export interface AppRepository {
  load(): AppData;
  save(data: AppData): void;
}

export function emptyAppData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    campaigns: [],
    characters: [],
    notes: [],
  };
}
