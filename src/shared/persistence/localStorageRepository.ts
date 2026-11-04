import {
  emptyAppData,
  SCHEMA_VERSION,
  type AppData,
  type AppRepository,
} from './model';
import {
  isAppData,
  isCampaign,
  isCampaignNote,
  recoverCharacter,
} from './validation';

export const APP_STORAGE_KEY = 'the-goobers-guide:data';
const LEGACY_SCHEMA_VERSIONS = [1, 2] as const;

export type StorageStatus =
  | { kind: 'ready' }
  | { kind: 'recovered'; message: string }
  | { kind: 'blocked'; message: string };

type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;

export class LocalStorageRepository implements AppRepository {
  private status: StorageStatus = { kind: 'ready' };
  private recoveredRaw: string | null = null;
  private loaded = false;

  constructor(
    private readonly storage: StoragePort,
    private readonly key = APP_STORAGE_KEY,
  ) {}

  getStatus(): StorageStatus {
    return this.status;
  }

  load(): AppData {
    this.loaded = true;
    this.recoveredRaw = null;
    try {
      const stored = this.storage.getItem(this.key);
      if (stored === null) {
        this.status = { kind: 'ready' };
        return emptyAppData();
      }

      const parsed: unknown = JSON.parse(stored);
      if (isAppData(parsed)) {
        this.status = { kind: 'ready' };
        return parsed;
      }
      if (typeof parsed !== 'object' || parsed === null) {
        this.status = {
          kind: 'blocked',
          message:
            'Saved browser data cannot be read or uses another version. Existing data has not been changed. Restore or remove it before saving new changes.',
        };
        return emptyAppData();
      }

      const parsedVersion =
        'schemaVersion' in parsed ? parsed.schemaVersion : undefined;
      if (
        parsedVersion !== SCHEMA_VERSION &&
        !LEGACY_SCHEMA_VERSIONS.some((version) => version === parsedVersion)
      ) {
        this.status = {
          kind: 'blocked',
          message:
            'Saved browser data cannot be read or uses another version. Existing data has not been changed. Restore or remove it before saving new changes.',
        };
        return emptyAppData();
      }

      const migratingLegacySpells = parsedVersion === 1;
      const migratingPreferences = parsedVersion === 2;

      // Recover valid records from a damaged current-version payload.
      const record = parsed as Record<string, unknown>;
      const seenCampaigns = new Set<string>();
      const campaigns = Array.isArray(record.campaigns)
        ? record.campaigns.filter(
            (value: unknown): value is AppData['campaigns'][number] => {
              if (!isCampaign(value) || seenCampaigns.has(value.id))
                return false;
              seenCampaigns.add(value.id);
              return true;
            },
          )
        : [];
      const campaignIds = new Set(campaigns.map((campaign) => campaign.id));
      const seenCharacters = new Set<string>();
      const characters = Array.isArray(record.characters)
        ? record.characters
            .map((value: unknown) => recoverCharacter(value, campaignIds))
            .filter((value): value is AppData['characters'][number] => {
              if (value === null || seenCharacters.has(value.id)) return false;
              seenCharacters.add(value.id);
              return true;
            })
        : [];
      const seenNotes = new Set<string>();
      const notes = Array.isArray(record.notes)
        ? record.notes.filter(
            (value: unknown): value is AppData['notes'][number] => {
              if (
                !isCampaignNote(value) ||
                !campaignIds.has(value.campaignId) ||
                seenNotes.has(value.id)
              )
                return false;
              seenNotes.add(value.id);
              return true;
            },
          )
        : [];
      const characterById = new Map(
        characters.map((character) => [character.id, character]),
      );
      const preferenceSource =
        record.preferences &&
        typeof record.preferences === 'object' &&
        !Array.isArray(record.preferences) &&
        'selectedCharacterByCampaign' in record.preferences &&
        record.preferences.selectedCharacterByCampaign &&
        typeof record.preferences.selectedCharacterByCampaign === 'object' &&
        !Array.isArray(record.preferences.selectedCharacterByCampaign)
          ? (record.preferences.selectedCharacterByCampaign as Record<
              string,
              unknown
            >)
          : {};
      const selectedCharacterByCampaign: Record<string, string> = {};
      for (const [campaignId, characterId] of Object.entries(
        preferenceSource,
      )) {
        if (
          typeof characterId === 'string' &&
          characterById.get(characterId)?.campaignId === campaignId
        )
          selectedCharacterByCampaign[campaignId] = characterId;
      }

      this.recoveredRaw = stored;
      this.status = {
        kind: 'recovered',
        message: migratingLegacySpells
          ? 'Saved data was upgraded. Existing spell text was not carried into the new spell format. The original data will be kept as a browser backup when you next save.'
          : migratingPreferences
            ? 'Saved data was upgraded with character preferences. The original data will be kept as a browser backup when you next save.'
            : 'Some saved records could not be loaded. Valid records were recovered. The original data will be kept as a browser backup when you next save.',
      };
      return {
        schemaVersion: SCHEMA_VERSION,
        campaigns,
        characters,
        notes,
        preferences: { selectedCharacterByCampaign },
      };
    } catch {
      this.status = {
        kind: 'blocked',
        message:
          'Saved browser data could not be read. Existing data has not been changed. Restore or remove it before saving new changes.',
      };
      return emptyAppData();
    }
  }

  save(data: AppData): void {
    if (!this.loaded) this.load();
    if (this.status.kind === 'blocked')
      throw new Error(
        'Existing browser data is protected from being replaced.',
      );
    if (!isAppData(data)) {
      throw new TypeError('Cannot save invalid application data');
    }
    if (this.recoveredRaw !== null) {
      const upgradedLegacyData =
        this.status.kind === 'recovered' &&
        this.status.message.startsWith('Saved data was upgraded.');
      this.storage.setItem(
        `${this.key}:recovery:${crypto.randomUUID()}`,
        this.recoveredRaw,
      );
      this.recoveredRaw = null;
      this.status = {
        kind: 'recovered',
        message: upgradedLegacyData
          ? 'Saved data was upgraded. The original data is preserved as a browser backup.'
          : 'Some saved records could not be loaded. The original data is preserved as a browser backup.',
      };
    }
    this.storage.setItem(this.key, JSON.stringify(data));
  }
}

export function browserLocalStorageRepository(): LocalStorageRepository {
  try {
    return new LocalStorageRepository(window.localStorage);
  } catch {
    const unavailable: StoragePort = {
      getItem: () => {
        throw new Error('Browser storage is unavailable.');
      },
      setItem: () => {
        throw new Error('Browser storage is unavailable.');
      },
    };
    return new LocalStorageRepository(unavailable);
  }
}
