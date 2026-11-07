import { isCharacter } from '../../shared/persistence/validation';
import { newCharacter } from './characterService';
import type { Character } from './model';

export const CHARACTER_IMPORT_FORMAT = 'the-goobers-guide-character';
export const CHARACTER_IMPORT_VERSION = 2;
export const MAX_CHARACTER_IMPORT_BYTES = 1024 * 1024;

type ImportOptions = {
  createId?: () => string;
  now?: () => string;
  ownerUserId?: import('../auth/demoAuth').DemoUserId;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function replaceEntryIds(value: unknown, createId: () => string): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((entry) =>
    isRecord(entry) ? { ...entry, id: createId() } : entry,
  );
}

export function parseCharacterImport(
  source: string,
  campaignId: string,
  options: ImportOptions = {},
): Character {
  let document: unknown;
  try {
    document = JSON.parse(source);
  } catch {
    throw new Error('This file is not valid JSON.');
  }

  if (!isRecord(document))
    throw new Error('This file is not a character import document.');
  if (document.format !== CHARACTER_IMPORT_FORMAT)
    throw new Error('This JSON file is not a Goober’s Guide character file.');
  if (document.version === 1)
    throw new Error(
      'Character import version 1 uses the old spell format. Regenerate it using the current conversion prompt.',
    );
  if (document.version !== CHARACTER_IMPORT_VERSION)
    throw new Error(
      `Character import version ${String(document.version)} is not supported.`,
    );
  if (!isRecord(document.character))
    throw new Error('The character data is missing from this file.');

  const { portraitDataUrl: _ignoredPortrait, ...portableCharacter } =
    document.character;
  void _ignoredPortrait;

  const createId = options.createId ?? (() => crypto.randomUUID());
  const timestamp = (options.now ?? (() => new Date().toISOString()))();
  const ownerUserId = options.ownerUserId ?? 'player-one';
  const imported = {
    ...newCharacter(campaignId, ownerUserId),
    ...portableCharacter,
    id: createId(),
    campaignId,
    ownerUserId,
    attacks: replaceEntryIds(document.character.attacks, createId),
    inventory: replaceEntryIds(document.character.inventory, createId),
    features: replaceEntryIds(document.character.features, createId),
    spells: replaceEntryIds(document.character.spells, createId),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (!isCharacter(imported))
    throw new Error(
      'Character data is incomplete or uses unsupported values. Open the Markdown guide to check required fields, then correct the JSON and try again.',
    );

  return imported;
}
