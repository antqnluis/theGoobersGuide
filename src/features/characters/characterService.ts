import type { AppData, AppRepository } from '../../shared/persistence/model';
import type { DemoUserId } from '../auth/demoAuth';
import { abilityNames, type Character } from './model';

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function selectedCharacterId(
  data: AppData,
  campaignId: string,
  ownerUserId?: DemoUserId,
): string | null {
  const selected = data.preferences.selectedCharacterByCampaign[campaignId];
  if (
    selected &&
    data.characters.some(
      (character) =>
        character.id === selected &&
        character.campaignId === campaignId &&
        (!ownerUserId || character.ownerUserId === ownerUserId),
    )
  )
    return selected;
  const owned = data.characters.find(
    (character) =>
      character.campaignId === campaignId &&
      (!ownerUserId || character.ownerUserId === ownerUserId),
  );
  if (owned) return owned.id;
  return (
    data.characters.find((character) => character.campaignId === campaignId)
      ?.id ?? null
  );
}

export function selectCharacter(
  repository: AppRepository,
  data: AppData,
  campaignId: string,
  characterId: string,
): AppData {
  if (
    !data.characters.some(
      (character) =>
        character.id === characterId && character.campaignId === campaignId,
    )
  )
    throw new Error('Character not found in this campaign.');
  if (data.preferences.selectedCharacterByCampaign[campaignId] === characterId)
    return data;
  const next = {
    ...data,
    preferences: {
      ...data.preferences,
      selectedCharacterByCampaign: {
        ...data.preferences.selectedCharacterByCampaign,
        [campaignId]: characterId,
      },
    },
  };
  repository.save(next);
  return next;
}

export function newCharacter(
  campaignId: string,
  ownerUserId: DemoUserId = 'player-one',
): Character {
  const now = new Date().toISOString();
  const standardSkills = [
    'Acrobatics',
    'Animal Handling',
    'Arcana',
    'Athletics',
    'Deception',
    'History',
    'Insight',
    'Intimidation',
    'Investigation',
    'Medicine',
    'Nature',
    'Perception',
    'Performance',
    'Persuasion',
    'Religion',
    'Sleight of Hand',
    'Stealth',
    'Survival',
  ];
  return {
    id: crypto.randomUUID(),
    campaignId,
    ownerUserId,
    name: '',
    className: '',
    species: '',
    level: 1,
    abilityScores: Object.fromEntries(
      abilityNames.map((name) => [name, { score: 10, modifier: 0 }]),
    ) as Character['abilityScores'],
    combat: {
      currentHp: 0,
      maximumHp: 0,
      temporaryHp: 0,
      armorClass: 0,
      initiativeModifier: 0,
      speed: 0,
      proficiencyBonus: 0,
    },
    skills: standardSkills.map((name) => ({
      name,
      modifier: 0,
      proficient: false,
    })),
    savingThrows: abilityNames.map((ability) => ({
      ability,
      modifier: 0,
      proficient: false,
    })),
    attacks: [],
    inventory: [],
    currency: { gp: 0, sp: 0, cp: 0 },
    features: [],
    spells: [],
    createdAt: now,
    updatedAt: now,
  };
}

function validate(data: AppData, character: Character) {
  if (!data.campaigns.some((c) => c.id === character.campaignId))
    throw new Error('Campaign no longer exists.');
  if (!character.name.trim()) throw new Error('Enter a character name.');
  if (!Number.isInteger(character.level) || character.level < 1)
    throw new Error('Level must be at least 1.');
  if (
    [
      character.combat.maximumHp,
      character.combat.temporaryHp,
      character.combat.currentHp,
    ].some((value) => !Number.isInteger(value) || value < 0)
  )
    throw new Error('HP must be a nonnegative whole number.');
  if (
    character.inventory.some(
      (i) => !i.name.trim() || !Number.isInteger(i.quantity) || i.quantity < 0,
    )
  )
    throw new Error('Items need a name and a nonnegative whole quantity.');
  if (character.attacks.some((a) => !a.name.trim()))
    throw new Error('Attacks need a name.');
  if (character.features.some((f) => !f.name.trim()))
    throw new Error('Features need a name.');
  if (character.spells.some((spell) => !spell.name.trim()))
    throw new Error('Spells need a name.');
  if (
    character.spells.some(
      (spell) =>
        !Number.isInteger(spell.level) || spell.level < 0 || spell.level > 9,
    )
  )
    throw new Error('Spell levels must be whole numbers from 0 to 9.');
  if (
    Object.values(character.currency).some((v) => !Number.isInteger(v) || v < 0)
  )
    throw new Error('Currency must be a nonnegative whole number.');
}

export function saveCharacter(
  repository: AppRepository,
  data: AppData,
  character: Character,
  actorUserId: DemoUserId,
): AppData {
  validate(data, character);
  const existing = data.characters.find((c) => c.id === character.id);
  if (existing && existing.campaignId !== character.campaignId)
    throw new Error('Character belongs to another campaign.');
  if (existing && existing.ownerUserId !== actorUserId)
    throw new Error('You can only edit your own characters.');
  const saved = {
    ...character,
    ownerUserId: existing?.ownerUserId ?? actorUserId,
    name: character.name.trim(),
    updatedAt: new Date().toISOString(),
  };
  const next = {
    ...data,
    characters: existing
      ? data.characters.map((c) => (c.id === saved.id ? saved : c))
      : [...data.characters, saved],
  };
  repository.save(next);
  return next;
}

export function deleteCharacter(
  repository: AppRepository,
  data: AppData,
  campaignId: string,
  characterId: string,
  actorUserId: DemoUserId,
): AppData {
  const character = data.characters.find(
    (c) => c.id === characterId && c.campaignId === campaignId,
  );
  if (!character) throw new Error('Character not found in this campaign.');
  if (character.ownerUserId !== actorUserId)
    throw new Error('You can only delete your own characters.');
  const selectedCharacterByCampaign = {
    ...data.preferences.selectedCharacterByCampaign,
  };
  if (selectedCharacterByCampaign[campaignId] === characterId)
    delete selectedCharacterByCampaign[campaignId];
  const next = {
    ...data,
    characters: data.characters.filter((c) => c.id !== characterId),
    campaigns: data.campaigns.map((campaign) =>
      campaign.id === campaignId
        ? {
            ...campaign,
            partyMemberCharacterIds: campaign.partyMemberCharacterIds.filter(
              (memberId) => memberId !== characterId,
            ),
          }
        : campaign,
    ),
    preferences: {
      ...data.preferences,
      selectedCharacterByCampaign,
    },
  };
  repository.save(next);
  return next;
}
