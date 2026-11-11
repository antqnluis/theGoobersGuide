import {
  emptyAppData,
  SCHEMA_VERSION,
  type AppData,
  type AppRepository,
} from './model';
import {
  isAppData,
  isCampaignNote,
  recoverCampaign,
  recoverCharacter,
} from './validation';
import { DEFAULT_DEMO_USER_ID } from '../../features/auth/demoAuth';

export const APP_STORAGE_KEY = 'the-goobers-guide:data';
const LEGACY_SCHEMA_VERSIONS = [1, 2, 3, 4] as const;

export type StorageStatus =
  | { kind: 'ready' }
  | { kind: 'recovered'; message: string }
  | { kind: 'blocked'; message: string };

type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;

export class LocalStorageRepository implements AppRepository {
  private status: StorageStatus = { kind: 'ready' };
  private recoveredRaw: string | null = null;
  private loaded = false;

  private write(key: string, value: string): void {
    try {
      this.storage.setItem(key, value);
    } catch (cause) {
      if (
        cause instanceof Error &&
        (cause.name === 'QuotaExceededError' ||
          cause.name === 'NS_ERROR_DOM_QUOTA_REACHED')
      )
        throw new Error(
          'Browser storage is full. Remove some saved data or use a smaller image, then try again.',
        );
      throw cause;
    }
  }

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
      const migratingCharacterOwners =
        parsedVersion === 1 || parsedVersion === 2 || parsedVersion === 3;
      const migratingPartyMembership = parsedVersion !== SCHEMA_VERSION;

      // Recover valid records from a damaged current-version payload.
      const record = parsed as Record<string, unknown>;
      const seenCampaigns = new Set<string>();
      const campaigns = Array.isArray(record.campaigns)
        ? record.campaigns
            .map(recoverCampaign)
            .filter((value): value is AppData['campaigns'][number] => {
              if (value === null || seenCampaigns.has(value.id)) return false;
              seenCampaigns.add(value.id);
              return true;
            })
        : [];
      const campaignIds = new Set(campaigns.map((campaign) => campaign.id));
      const seenCharacters = new Set<string>();
      const characters = Array.isArray(record.characters)
        ? record.characters
            .map((value: unknown) =>
              recoverCharacter(
                migratingCharacterOwners &&
                  typeof value === 'object' &&
                  value !== null &&
                  !Array.isArray(value)
                  ? { ...value, ownerUserId: DEFAULT_DEMO_USER_ID }
                  : value,
                campaignIds,
              ),
            )
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
      const campaignsWithMembers = campaigns.map((campaign) => {
        const partyMemberCharacterIds = migratingPartyMembership
          ? characters
              .filter((character) => character.campaignId === campaign.id)
              .map((character) => character.id)
          : campaign.partyMemberCharacterIds.filter(
              (characterId) =>
                characterById.get(characterId)?.campaignId === campaign.id,
            );
        return {
          ...campaign,
          partyMemberCharacterIds: campaign.partyName
            ? partyMemberCharacterIds
            : [],
        };
      });
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
      const migrationDetails = [
        migratingLegacySpells
          ? 'legacy spell text was not carried into the structured spell format'
          : null,
        migratingPreferences ? 'character preferences were added' : null,
        migratingCharacterOwners
          ? 'character ownership was added and existing characters were assigned to Player One'
          : null,
        migratingPartyMembership
          ? 'party membership was added and existing campaign characters were kept in their party'
          : null,
      ].filter((detail): detail is string => detail !== null);
      this.status = {
        kind: 'recovered',
        message: migrationDetails.length
          ? `Saved data was upgraded: ${migrationDetails.join('; ')}. The original data will be kept as a browser backup when you next save.`
          : 'Some saved records could not be loaded. Valid records were recovered. The original data will be kept as a browser backup when you next save.',
      };
      return {
        schemaVersion: SCHEMA_VERSION,
        campaigns: campaignsWithMembers,
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
      const upgradeMessage =
        this.status.kind === 'recovered' ? this.status.message : null;
      const upgradedLegacyData =
        upgradeMessage?.startsWith('Saved data was upgraded') ?? false;
      this.write(
        `${this.key}:recovery:${crypto.randomUUID()}`,
        this.recoveredRaw,
      );
      this.recoveredRaw = null;
      this.status = {
        kind: 'recovered',
        message:
          upgradedLegacyData && upgradeMessage
            ? upgradeMessage.replace(
                'The original data will be kept as a browser backup when you next save.',
                'The original data is preserved as a browser backup.',
              )
            : 'Some saved records could not be loaded. The original data is preserved as a browser backup.',
      };
    }
    this.write(this.key, JSON.stringify(data));
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
