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

type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;

export class LocalStorageRepository implements AppRepository {
  constructor(
    private readonly storage: StoragePort,
    private readonly key = APP_STORAGE_KEY,
  ) {}

  load(): AppData {
    try {
      const stored = this.storage.getItem(this.key);
      if (stored === null) return emptyAppData();

      const parsed: unknown = JSON.parse(stored);
      if (isAppData(parsed)) return parsed;
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('schemaVersion' in parsed) ||
        parsed.schemaVersion !== SCHEMA_VERSION
      ) {
        return emptyAppData();
      }

      // Recover valid records from a damaged current-version payload.
      const record = parsed as Record<string, unknown>;
      const campaigns = Array.isArray(record.campaigns)
        ? record.campaigns.filter(isCampaign)
        : [];
      const campaignIds = new Set(campaigns.map((campaign) => campaign.id));
      const characters = Array.isArray(record.characters)
        ? record.characters
            .map((value: unknown) => recoverCharacter(value, campaignIds))
            .filter(
              (value): value is AppData['characters'][number] => value !== null,
            )
        : [];
      const notes = Array.isArray(record.notes)
        ? record.notes.filter(
            (value: unknown): value is AppData['notes'][number] =>
              isCampaignNote(value) && campaignIds.has(value.campaignId),
          )
        : [];

      return { schemaVersion: SCHEMA_VERSION, campaigns, characters, notes };
    } catch {
      return emptyAppData();
    }
  }

  save(data: AppData): void {
    if (!isAppData(data)) {
      throw new TypeError('Cannot save invalid application data');
    }
    this.storage.setItem(this.key, JSON.stringify(data));
  }
}
