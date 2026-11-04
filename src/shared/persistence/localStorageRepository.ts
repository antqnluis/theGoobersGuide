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
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('schemaVersion' in parsed) ||
        parsed.schemaVersion !== SCHEMA_VERSION
      ) {
        this.status = {
          kind: 'blocked',
          message:
            'Saved browser data cannot be read or uses another version. Existing data has not been changed. Restore or remove it before saving new changes.',
        };
        return emptyAppData();
      }

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

      this.recoveredRaw = stored;
      this.status = {
        kind: 'recovered',
        message:
          'Some saved records could not be loaded. Valid records were recovered. The original data will be kept as a browser backup when you next save.',
      };
      return { schemaVersion: SCHEMA_VERSION, campaigns, characters, notes };
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
      this.storage.setItem(
        `${this.key}:recovery:${crypto.randomUUID()}`,
        this.recoveredRaw,
      );
      this.recoveredRaw = null;
      this.status = {
        kind: 'recovered',
        message:
          'Some saved records could not be loaded. The original data is preserved as a browser backup.',
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
