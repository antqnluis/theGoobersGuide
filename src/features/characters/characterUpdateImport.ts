import { isCharacter } from '../../shared/persistence/validation';
import { characterSaveIssues } from './characterService';
import {
  abilityNames,
  type AbilityName,
  type AbilityValue,
  type Character,
  type CombatStats,
} from './model';

export const CHARACTER_UPDATE_FORMAT = 'the-goobers-guide-character-update';
export const CHARACTER_UPDATE_VERSION = 1;

type CharacterScalarField =
  | 'name'
  | 'playerName'
  | 'className'
  | 'subclass'
  | 'species'
  | 'level'
  | 'background'
  | 'description'
  | 'notes';

type OptionalCharacterField =
  'playerName' | 'subclass' | 'background' | 'description' | 'notes';

type CharacterListField =
  'skills' | 'savingThrows' | 'attacks' | 'inventory' | 'features' | 'spells';

type CharacterCollectionField = CharacterListField | 'currency';

type CollectionTarget =
  | { kind: 'id'; value: string }
  | { kind: 'key'; field: 'name' | 'ability'; value: string };

export type CharacterImportUpdateChange =
  | {
      id: string;
      kind: 'field';
      group: string;
      label: string;
      field: CharacterScalarField;
      current: string | number | undefined;
      incoming: string | number | undefined;
    }
  | {
      id: string;
      kind: 'ability';
      group: string;
      label: string;
      ability: AbilityName;
      current: AbilityValue;
      incoming: AbilityValue;
    }
  | {
      id: string;
      kind: 'combat';
      group: string;
      label: string;
      field: keyof CombatStats;
      current: number;
      incoming: number;
    }
  | {
      id: string;
      kind: 'collection';
      group: string;
      label: string;
      field: CharacterListField;
      operation: 'add' | 'update' | 'remove';
      target: CollectionTarget;
      current: unknown;
      incoming: unknown;
      baseCollection: unknown[];
    }
  | {
      id: string;
      kind: 'currency';
      group: string;
      label: string;
      operation: 'set' | 'remove';
      key: string;
      current: number | undefined;
      incoming: number | undefined;
      baseCollection: Record<string, number>;
    };

export interface CharacterImportUpdate {
  changes: CharacterImportUpdateChange[];
  issues: string[];
  changeIssues: Record<string, string>;
}

type UpdateOptions = { createId?: () => string };

const scalarFieldLabels: Record<CharacterScalarField, string> = {
  name: 'Character name',
  playerName: 'Player name',
  className: 'Class',
  subclass: 'Subclass',
  species: 'Species',
  level: 'Level',
  background: 'Background',
  description: 'Description',
  notes: 'Character notes',
};

const abilityLabels: Record<AbilityName, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

const combatFieldLabels: Record<keyof CombatStats, string> = {
  currentHp: 'Current HP',
  maximumHp: 'Maximum HP',
  temporaryHp: 'Temporary HP',
  armorClass: 'Armor class',
  initiativeModifier: 'Initiative modifier',
  speed: 'Speed',
  proficiencyBonus: 'Proficiency bonus',
};

const collectionLabels: Record<CharacterCollectionField, string> = {
  skills: 'Skills',
  savingThrows: 'Saving throws',
  attacks: 'Attacks',
  inventory: 'Inventory',
  currency: 'Currency',
  features: 'Features',
  spells: 'Spells',
};

const collectionSingularLabels: Record<CharacterListField, string> = {
  skills: 'skill',
  savingThrows: 'saving throw',
  attacks: 'attack',
  inventory: 'inventory item',
  features: 'feature',
  spells: 'spell',
};

const listEntryFields: Record<CharacterListField, string[]> = {
  skills: ['name', 'modifier', 'proficient'],
  savingThrows: ['ability', 'modifier', 'proficient'],
  attacks: ['id', 'name', 'attackBonus', 'damageExpression'],
  inventory: ['id', 'name', 'quantity', 'description'],
  features: ['id', 'name', 'description', 'category'],
  spells: [
    'id',
    'name',
    'level',
    'school',
    'castingTime',
    'range',
    'components',
    'duration',
    'concentration',
    'ritual',
    'prepared',
    'description',
  ],
};

const listClearFields: Partial<Record<CharacterListField, string[]>> = {
  inventory: ['description'],
  features: ['category'],
};

const abilitySetFields = ['score', 'modifier'];
const combatFields = Object.keys(combatFieldLabels);
const scalarFields = Object.keys(scalarFieldLabels);
const optionalCharacterFields: OptionalCharacterField[] = [
  'playerName',
  'subclass',
  'background',
  'description',
  'notes',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function assertAllowedKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
) {
  const unexpected = Object.keys(record).find((key) => !allowed.includes(key));
  if (unexpected)
    throw new Error(`${label} contains unsupported field “${unexpected}”.`);
}

function requireRecord(
  value: unknown,
  message: string,
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(message);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${label} must be a finite number.`);
  return value;
}

function canonicalValue(value: unknown, ignoreEntryIds = false): unknown {
  if (Array.isArray(value))
    return value.map((entry) => canonicalValue(entry, ignoreEntryIds));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !ignoreEntryIds || key !== 'id')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalValue(entry)]),
  );
}

function valuesEqual(
  left: unknown,
  right: unknown,
  ignoreEntryIds = false,
): boolean {
  return (
    JSON.stringify(canonicalValue(left, ignoreEntryIds)) ===
    JSON.stringify(canonicalValue(right, ignoreEntryIds))
  );
}

function parseDocument(source: string): {
  changes: Record<string, unknown>;
  issues: string[];
} {
  let document: unknown;
  try {
    document = JSON.parse(source);
  } catch {
    throw new Error('This file is not valid JSON.');
  }

  const parsed = requireRecord(
    document,
    'This is not a character update file.',
  );
  if (parsed.format !== CHARACTER_UPDATE_FORMAT)
    throw new Error('This JSON is not a Goober’s Guide character update file.');
  if (parsed.version !== CHARACTER_UPDATE_VERSION)
    throw new Error(
      `Character update version ${String(parsed.version)} is not supported.`,
    );
  assertAllowedKeys(
    parsed,
    ['format', 'version', 'changes', 'issues'],
    'Update file',
  );

  const changes = requireRecord(
    parsed.changes,
    'The update changes are missing or invalid.',
  );
  assertAllowedKeys(changes, ['fields', 'collections'], 'Update changes');
  const issues = hasOwn(parsed, 'issues') ? parsed.issues : [];
  if (
    !Array.isArray(issues) ||
    issues.some((issue) => typeof issue !== 'string')
  )
    throw new Error('Update issues must be an array of text.');
  return { changes, issues: issues as string[] };
}

function validateFields(raw: unknown): {
  set: Record<string, unknown>;
  clear: OptionalCharacterField[];
} {
  const fields = requireRecord(raw, 'Update fields are invalid.');
  assertAllowedKeys(fields, ['set', 'clear'], 'Update fields');
  const set =
    fields.set === undefined
      ? {}
      : requireRecord(fields.set, 'Field changes must be an object.');
  const clearRaw = hasOwn(fields, 'clear') ? fields.clear : [];
  if (
    !Array.isArray(clearRaw) ||
    clearRaw.some((field) => typeof field !== 'string')
  )
    throw new Error('Cleared fields must be an array of field names.');
  const clear = clearRaw as string[];
  if (new Set(clear).size !== clear.length)
    throw new Error('Cleared fields cannot be repeated.');
  const allowedSetFields = [...scalarFields, 'abilityScores', 'combat'];
  assertAllowedKeys(set, allowedSetFields, 'Field changes');
  for (const field of clear) {
    if (!optionalCharacterFields.includes(field as OptionalCharacterField))
      throw new Error(`Field “${field}” cannot be cleared.`);
    if (hasOwn(set, field))
      throw new Error(`Field “${field}” cannot be set and cleared together.`);
  }

  for (const [field, value] of Object.entries(set)) {
    if (field === 'abilityScores' || field === 'combat') continue;
    if (field === 'level') requireNumber(value, 'Level');
    else if (typeof value !== 'string')
      throw new Error(
        `${scalarFieldLabels[field as CharacterScalarField]} must be text.`,
      );
  }

  if (set.abilityScores !== undefined) {
    const abilities = requireRecord(
      set.abilityScores,
      'Ability score updates must be an object.',
    );
    assertAllowedKeys(abilities, abilityNames, 'Ability score updates');
    for (const ability of abilityNames) {
      if (!hasOwn(abilities, ability)) continue;
      const score = requireRecord(
        abilities[ability],
        `${abilityLabels[ability]} must include a score and modifier.`,
      );
      assertAllowedKeys(
        score,
        abilitySetFields,
        `${abilityLabels[ability]} update`,
      );
      if (!hasOwn(score, 'score') || !hasOwn(score, 'modifier'))
        throw new Error(
          `${abilityLabels[ability]} updates must include both score and modifier.`,
        );
      requireNumber(score.score, `${abilityLabels[ability]} score`);
      requireNumber(score.modifier, `${abilityLabels[ability]} modifier`);
    }
  }

  if (set.combat !== undefined) {
    const combat = requireRecord(
      set.combat,
      'Combat updates must be an object.',
    );
    assertAllowedKeys(combat, combatFields, 'Combat updates');
    for (const [field, value] of Object.entries(combat))
      requireNumber(value, combatFieldLabels[field as keyof CombatStats]);
  }

  return { set, clear: clear as OptionalCharacterField[] };
}

function entryFields(field: CharacterListField, raw: unknown, label: string) {
  const record = requireRecord(raw, `${label} must be an object.`);
  assertAllowedKeys(record, listEntryFields[field], label);
  return record;
}

function validateListOperation(field: CharacterListField, raw: unknown) {
  const op = requireRecord(
    raw,
    `${collectionLabels[field]} operation is invalid.`,
  );
  if (op.op !== 'add' && op.op !== 'update' && op.op !== 'remove')
    throw new Error(
      `${collectionLabels[field]} operation must be add, update, or remove.`,
    );
  const isIdField = ['attacks', 'inventory', 'features', 'spells'].includes(
    field,
  );
  const targetField = field === 'skills' ? 'name' : 'ability';

  if (op.op === 'add') {
    assertAllowedKeys(op, ['op', 'entry'], `${collectionLabels[field]} add`);
    const entry = entryFields(
      field,
      op.entry,
      `${collectionLabels[field]} entry`,
    );
    if (isIdField && hasOwn(entry, 'id'))
      throw new Error(
        'New list entries must not include an ID; the app assigns it.',
      );
    return { op: 'add' as const, entry };
  }

  if (isIdField) {
    assertAllowedKeys(
      op,
      op.op === 'update' ? ['op', 'id', 'set', 'clear'] : ['op', 'id'],
      `${collectionLabels[field]} ${op.op}`,
    );
    const id = requireString(op.id, `${collectionLabels[field]} target ID`);
    if (op.op === 'remove')
      return {
        op: 'remove' as const,
        target: { kind: 'id' as const, value: id },
      };
    const set = entryFields(field, op.set, `${collectionLabels[field]} update`);
    if (hasOwn(set, 'id'))
      throw new Error('Existing entry IDs cannot be changed.');
    const clear = validateEntryClear(
      field,
      hasOwn(op, 'clear') ? op.clear : [],
    );
    assertNoClearOverlap(set, clear);
    if (Object.keys(set).length === 0 && clear.length === 0)
      throw new Error('An update operation must change at least one value.');
    return {
      op: 'update' as const,
      target: { kind: 'id' as const, value: id },
      set,
      clear,
    };
  }

  assertAllowedKeys(
    op,
    op.op === 'update' ? ['op', 'key', 'set', 'clear'] : ['op', 'key'],
    `${collectionLabels[field]} ${op.op}`,
  );
  const key = requireString(op.key, `${collectionLabels[field]} match key`);
  if (field === 'savingThrows' && !abilityNames.includes(key as AbilityName))
    throw new Error('Saving throw match keys must be an ability name.');
  if (op.op === 'remove')
    return {
      op: 'remove' as const,
      target: {
        kind: 'key' as const,
        field: targetField as 'name' | 'ability',
        value: key,
      },
    };
  const set = entryFields(field, op.set, `${collectionLabels[field]} update`);
  if (hasOwn(set, targetField))
    throw new Error(
      `Change a ${collectionSingularLabels[field]} match key by removing and adding the entry.`,
    );
  const clear = validateEntryClear(field, hasOwn(op, 'clear') ? op.clear : []);
  assertNoClearOverlap(set, clear);
  if (Object.keys(set).length === 0 && clear.length === 0)
    throw new Error('An update operation must change at least one value.');
  return {
    op: 'update' as const,
    target: {
      kind: 'key' as const,
      field: targetField as 'name' | 'ability',
      value: key,
    },
    set,
    clear,
  };
}

function validateEntryClear(field: CharacterListField, raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.some((value) => typeof value !== 'string'))
    throw new Error('Entry clear operations must be an array of field names.');
  const allowed = listClearFields[field] ?? [];
  for (const key of raw) {
    if (!allowed.includes(key as string))
      throw new Error(
        `The ${collectionSingularLabels[field]} field “${String(key)}” cannot be cleared.`,
      );
  }
  if (new Set(raw).size !== raw.length)
    throw new Error('Entry clear fields cannot be repeated.');
  return raw as string[];
}

function assertNoClearOverlap(set: Record<string, unknown>, clear: string[]) {
  const overlap = clear.find((field) => hasOwn(set, field));
  if (overlap)
    throw new Error(
      `Entry field “${overlap}” cannot be set and cleared together.`,
    );
}

function findTargetIndex(
  entries: unknown[],
  target: CollectionTarget,
): number[] {
  return entries.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const matches =
      target.kind === 'id'
        ? entry.id === target.value
        : entry[target.field] === target.value;
    return matches ? [index] : [];
  });
}

function entryDisplayName(field: CharacterListField, entry: unknown): string {
  if (!isRecord(entry)) return 'entry';
  if (field === 'savingThrows') return String(entry.ability ?? 'saving throw');
  return String(entry.name ?? collectionSingularLabels[field]);
}

function validateCurrency(raw: unknown) {
  const currency = requireRecord(raw, 'Currency updates must be an object.');
  assertAllowedKeys(currency, ['set', 'remove'], 'Currency updates');
  const set =
    currency.set === undefined
      ? {}
      : requireRecord(currency.set, 'Currency set values must be an object.');
  for (const [key, amount] of Object.entries(set)) {
    if (!key.trim()) throw new Error('Currency names cannot be empty.');
    if (['__proto__', 'constructor', 'prototype'].includes(key))
      throw new Error(`Currency name “${key}” is not supported.`);
    requireNumber(amount, `Currency ${key}`);
  }
  const remove = hasOwn(currency, 'remove') ? currency.remove : [];
  if (
    !Array.isArray(remove) ||
    remove.some((key) => typeof key !== 'string' || !key.trim())
  )
    throw new Error('Currency removals must be an array of names.');
  if (
    remove.some((key) =>
      ['__proto__', 'constructor', 'prototype'].includes(key as string),
    )
  )
    throw new Error('Currency names are invalid.');
  if (Object.keys(set).length === 0 && remove.length === 0)
    throw new Error('Currency updates must set or remove at least one value.');
  if (remove.some((key) => hasOwn(set, key as string)))
    throw new Error('Currency cannot be set and removed together.');
  if (new Set(remove).size !== remove.length)
    throw new Error('Currency removals cannot be repeated.');
  return { set, remove: remove as string[] };
}

function scalarGroup(field: CharacterScalarField): string {
  return field === 'notes' ? 'Notes' : 'Identity';
}

export function parseCharacterUpdateImport(
  source: string,
  current: Character,
  options: UpdateOptions = {},
): CharacterImportUpdate {
  const parsed = parseDocument(source);
  const patchFields =
    parsed.changes.fields === undefined
      ? { set: {}, clear: [] as OptionalCharacterField[] }
      : validateFields(parsed.changes.fields);
  const rawCollections =
    parsed.changes.collections === undefined
      ? {}
      : requireRecord(
          parsed.changes.collections,
          'Collection updates must be an object.',
        );
  assertAllowedKeys(
    rawCollections,
    Object.keys(collectionLabels),
    'Collection updates',
  );

  const changes: CharacterImportUpdateChange[] = [];
  const issues = [...parsed.issues];
  const addFieldChange = (change: CharacterImportUpdateChange) => {
    if (
      change.kind === 'field' ||
      change.kind === 'ability' ||
      change.kind === 'combat'
    ) {
      if (!valuesEqual(change.current, change.incoming)) changes.push(change);
    }
  };

  const setFields = patchFields.set;
  for (const field of scalarFields as CharacterScalarField[]) {
    if (!hasOwn(setFields, field)) continue;
    addFieldChange({
      id: `field:${field}`,
      kind: 'field',
      group: scalarGroup(field),
      label: scalarFieldLabels[field],
      field,
      current: current[field],
      incoming: setFields[field] as string | number,
    });
  }
  for (const field of patchFields.clear) {
    addFieldChange({
      id: `clear:${field}`,
      kind: 'field',
      group: scalarGroup(field),
      label: `Clear ${scalarFieldLabels[field]}`,
      field,
      current: current[field],
      incoming: undefined,
    });
  }

  const setAbilities = setFields.abilityScores;
  if (isRecord(setAbilities)) {
    for (const ability of abilityNames) {
      if (!hasOwn(setAbilities, ability)) continue;
      const incoming = setAbilities[ability] as AbilityValue;
      addFieldChange({
        id: `ability:${ability}`,
        kind: 'ability',
        group: 'Ability scores',
        label: abilityLabels[ability],
        ability,
        current: current.abilityScores[ability],
        incoming,
      });
    }
  }

  const setCombat = setFields.combat;
  if (isRecord(setCombat)) {
    for (const field of combatFields as (keyof CombatStats)[]) {
      if (!hasOwn(setCombat, field)) continue;
      addFieldChange({
        id: `combat:${field}`,
        kind: 'combat',
        group: 'Combat',
        label: combatFieldLabels[field],
        field,
        current: current.combat[field],
        incoming: setCombat[field] as number,
      });
    }
  }

  const createId = options.createId ?? (() => crypto.randomUUID());
  const occupiedEntryIds = new Set(
    [
      ...current.attacks,
      ...current.inventory,
      ...current.features,
      ...current.spells,
    ].map((entry) => entry.id),
  );
  const createEntryId = () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const id = createId();
      if (id && !occupiedEntryIds.has(id)) {
        occupiedEntryIds.add(id);
        return id;
      }
    }
    throw new Error('A unique ID could not be assigned to a new entry.');
  };
  let operationIndex = 0;
  const listFields: CharacterListField[] = [
    'skills',
    'savingThrows',
    'attacks',
    'inventory',
    'features',
    'spells',
  ];
  for (const field of listFields) {
    const rawOperations = rawCollections[field];
    if (rawOperations === undefined) continue;
    if (!Array.isArray(rawOperations))
      throw new Error(`${collectionLabels[field]} updates must be an array.`);
    const normalized = rawOperations.map((operation) =>
      validateListOperation(field, operation),
    );
    const targetCounts = new Map<string, number>();
    for (const operation of normalized) {
      if (operation.op === 'add') continue;
      const target = operation.target;
      const key = `${target.kind}:${target.value}`;
      targetCounts.set(key, (targetCounts.get(key) ?? 0) + 1);
    }
    const entries = current[field] as unknown[];
    for (const operation of normalized) {
      if (operation.op === 'add') {
        let entry: Record<string, unknown> = { ...operation.entry };
        if (['attacks', 'inventory', 'features', 'spells'].includes(field))
          entry.id = createEntryId();
        const target: CollectionTarget =
          'id' in entry && typeof entry.id === 'string'
            ? { kind: 'id', value: entry.id }
            : field === 'savingThrows'
              ? { kind: 'key', field: 'ability', value: String(entry.ability) }
              : { kind: 'key', field: 'name', value: String(entry.name) };
        if (
          target.kind === 'key' &&
          (entries.some(
            (item) => isRecord(item) && item[target.field] === target.value,
          ) ||
            normalized.some(
              (other) =>
                other !== operation &&
                other.op === 'add' &&
                (field === 'savingThrows'
                  ? String(other.entry.ability) === target.value
                  : String(other.entry.name) === target.value),
            ))
        ) {
          issues.push(
            `Cannot add ${collectionSingularLabels[field]} “${target.value}” because that match key already exists.`,
          );
          continue;
        }
        const changeId = `collection:${field}:${operationIndex++}`;
        changes.push({
          id: changeId,
          kind: 'collection',
          group: collectionLabels[field],
          label: `Add ${collectionSingularLabels[field]}: ${entryDisplayName(field, entry)}`,
          field,
          operation: 'add',
          target,
          current: undefined,
          incoming: entry,
          baseCollection: structuredClone(entries),
        });
        continue;
      }

      const key = `${operation.target.kind}:${operation.target.value}`;
      if (targetCounts.get(key) !== 1) {
        issues.push(
          `More than one ${collectionSingularLabels[field]} operation targets “${operation.target.value}”.`,
        );
        continue;
      }
      const matches = findTargetIndex(entries, operation.target);
      if (matches.length !== 1) {
        issues.push(
          matches.length === 0
            ? `Could not find one ${collectionSingularLabels[field]} matching “${operation.target.value}”.`
            : `More than one ${collectionSingularLabels[field]} matches “${operation.target.value}”.`,
        );
        continue;
      }
      const currentEntry = entries[matches[0]];
      let incomingEntry: unknown;
      if (operation.op === 'update') {
        const updatedEntry = {
          ...(currentEntry as Record<string, unknown>),
          ...operation.set,
        };
        for (const clear of operation.clear) delete updatedEntry[clear];
        incomingEntry = updatedEntry;
        if (valuesEqual(currentEntry, incomingEntry)) continue;
      }
      const operationName = operation.op;
      changes.push({
        id: `collection:${field}:${operationIndex++}`,
        kind: 'collection',
        group: collectionLabels[field],
        label: `${operationName === 'update' ? 'Update' : 'Remove'} ${collectionSingularLabels[field]}: ${entryDisplayName(field, currentEntry)}`,
        field,
        operation: operationName,
        target: operation.target,
        current: currentEntry,
        incoming: incomingEntry,
        baseCollection: structuredClone(entries),
      });
    }
  }

  if (rawCollections.currency !== undefined) {
    const currency = validateCurrency(rawCollections.currency);
    const base = structuredClone(current.currency);
    for (const [key, amount] of Object.entries(currency.set)) {
      const currentAmount = hasOwn(current.currency, key)
        ? current.currency[key]
        : undefined;
      if (currentAmount === amount) continue;
      changes.push({
        id: `currency:set:${key}`,
        kind: 'currency',
        group: 'Currency',
        label: `Set currency ${key}`,
        operation: 'set',
        key,
        current: currentAmount,
        incoming: amount as number,
        baseCollection: base,
      });
    }
    for (const key of currency.remove) {
      if (!hasOwn(current.currency, key)) {
        issues.push(`Currency “${key}” is not present and cannot be removed.`);
        continue;
      }
      changes.push({
        id: `currency:remove:${key}`,
        kind: 'currency',
        group: 'Currency',
        label: `Remove currency ${key}`,
        operation: 'remove',
        key,
        current: current.currency[key],
        incoming: undefined,
        baseCollection: base,
      });
    }
  }

  const candidate = mergeChanges(current, changes);
  if (!isCharacter(candidate))
    throw new Error(
      'The update contains values that do not form a valid character. Correct the patch and try again.',
    );
  const unchangedSaveIssues = new Set(characterSaveIssues(current));
  const changeIssues: Record<string, string> = {};
  for (const change of changes) {
    const candidateForChange = mergeChanges(current, [change]);
    const introducedIssue = characterSaveIssues(candidateForChange).find(
      (issue) => !unchangedSaveIssues.has(issue),
    );
    if (introducedIssue) changeIssues[change.id] = introducedIssue;
  }
  return { changes, issues, changeIssues };
}

function targetMatches(entry: unknown, target: CollectionTarget): boolean {
  if (!isRecord(entry)) return false;
  return target.kind === 'id'
    ? entry.id === target.value
    : entry[target.field] === target.value;
}

function changeValueStillCurrent(
  current: Character,
  change: CharacterImportUpdateChange,
): boolean {
  switch (change.kind) {
    case 'field':
      return valuesEqual(current[change.field], change.current);
    case 'ability':
      return valuesEqual(current.abilityScores[change.ability], change.current);
    case 'combat':
      return valuesEqual(current.combat[change.field], change.current);
    case 'collection':
      return valuesEqual(current[change.field], change.baseCollection, false);
    case 'currency':
      return valuesEqual(current.currency, change.baseCollection);
  }
}

function mergeChanges(
  current: Character,
  changes: CharacterImportUpdateChange[],
): Character {
  let next = structuredClone(current);
  for (const change of changes) {
    switch (change.kind) {
      case 'field':
        next = { ...next, [change.field]: change.incoming };
        break;
      case 'ability':
        next = {
          ...next,
          abilityScores: {
            ...next.abilityScores,
            [change.ability]: change.incoming,
          },
        };
        break;
      case 'combat':
        next = {
          ...next,
          combat: { ...next.combat, [change.field]: change.incoming },
        };
        break;
      case 'collection': {
        const entries = next[change.field] as unknown[];
        if (change.operation === 'add') {
          next = {
            ...next,
            [change.field]: [...entries, structuredClone(change.incoming)],
          };
        } else if (change.operation === 'remove') {
          next = {
            ...next,
            [change.field]: entries.filter(
              (entry) => !targetMatches(entry, change.target),
            ),
          };
        } else {
          next = {
            ...next,
            [change.field]: entries.map((entry) =>
              targetMatches(entry, change.target)
                ? structuredClone(change.incoming)
                : entry,
            ),
          };
        }
        break;
      }
      case 'currency': {
        const currency = { ...next.currency };
        if (change.operation === 'set') currency[change.key] = change.incoming!;
        else delete currency[change.key];
        next = { ...next, currency };
        break;
      }
    }
  }
  return next;
}

export function applyCharacterImportUpdate(
  current: Character,
  update: CharacterImportUpdate,
  selectedChangeIds: ReadonlySet<string>,
): Character {
  if (update.issues.length > 0)
    throw new Error(
      'Resolve the blocking update issues before applying changes.',
    );
  const selected = update.changes.filter((change) =>
    selectedChangeIds.has(change.id),
  );
  if (selected.some((change) => update.changeIssues[change.id]))
    throw new Error('Remove the changes with save issues before applying.');
  if (selected.some((change) => !changeValueStillCurrent(current, change)))
    throw new Error(
      'This character changed while you were reviewing. Review the updated values before applying changes.',
    );

  return mergeChanges(current, selected);
}
