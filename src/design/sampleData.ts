import type { Campaign } from '../features/campaigns/model';
import type { Character } from '../features/characters/model';
import type { CampaignNote } from '../features/notes/model';

export const sampleCampaign: Campaign = {
  id: 'sample-asterholm',
  name: 'Journey to Asterholm',
  partyName: 'The Bad Company',
  description:
    'A winding road through old borderlands and the mysteries beyond them.',
  currentLocation: 'Dunmar Pass',
  status: 'Active campaign',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-04T00:00:00.000Z',
};

export const sampleCharacter: Character = {
  id: 'sample-mara',
  campaignId: sampleCampaign.id,
  name: 'Mara Vell',
  playerName: 'Sample player',
  className: 'Ranger',
  subclass: 'Gloom Stalker',
  species: 'Half-elf',
  level: 5,
  background: 'Cartographer',
  description:
    'A patient pathfinder who keeps the party moving when the road disappears.',
  abilityScores: {
    strength: { score: 11, modifier: 0 },
    dexterity: { score: 17, modifier: 3 },
    constitution: { score: 14, modifier: 2 },
    intelligence: { score: 12, modifier: 1 },
    wisdom: { score: 16, modifier: 3 },
    charisma: { score: 10, modifier: 0 },
  },
  combat: {
    currentHp: 31,
    maximumHp: 38,
    temporaryHp: 0,
    armorClass: 16,
    initiativeModifier: 3,
    speed: 30,
    proficiencyBonus: 3,
  },
  skills: [
    { name: 'Perception', modifier: 6, proficient: true },
    { name: 'Stealth', modifier: 6, proficient: true },
    { name: 'Survival', modifier: 6, proficient: true },
    { name: 'Investigation', modifier: 1, proficient: false },
    { name: 'Nature', modifier: 4, proficient: true },
  ],
  savingThrows: [
    { ability: 'strength', modifier: 3, proficient: true },
    { ability: 'dexterity', modifier: 6, proficient: true },
    { ability: 'constitution', modifier: 2, proficient: false },
    { ability: 'intelligence', modifier: 1, proficient: false },
    { ability: 'wisdom', modifier: 3, proficient: false },
    { ability: 'charisma', modifier: 0, proficient: false },
  ],
  attacks: [
    {
      id: 'longbow',
      name: 'Longbow',
      attackBonus: 7,
      damageExpression: '1d8 + 3 piercing',
    },
    {
      id: 'shortsword',
      name: 'Shortsword',
      attackBonus: 6,
      damageExpression: '1d6 + 3 piercing',
    },
  ],
  inventory: [
    { id: 'rope', name: 'Hemp rope', quantity: 1, description: '50 ft.' },
    {
      id: 'rations',
      name: 'Rations',
      quantity: 4,
      description: 'One day each',
    },
    {
      id: 'map',
      name: 'Map case',
      quantity: 1,
      description: 'With field maps',
    },
  ],
  currency: { gp: 24, sp: 8, cp: 3 },
  features: [
    {
      id: 'dread-ambusher',
      name: 'Dread Ambusher',
      description: 'A strong opening turn when danger appears.',
      category: 'Class feature',
    },
    {
      id: 'darkvision',
      name: 'Darkvision',
      description:
        'See in dim light and darkness within the character’s range.',
      category: 'Species trait',
    },
  ],
  notes:
    'Keep the old bridge marked on the map. The western trail is still untested.',
  spells: [
    {
      id: 'hunters-mark',
      name: 'Hunter’s Mark',
      level: 1,
      school: 'Divination',
      castingTime: '1 bonus action',
      range: '90 feet',
      components: 'V',
      duration: 'Up to 1 hour',
      concentration: true,
      ritual: false,
      prepared: true,
      description:
        'Mark a creature you can see. Attacks against it deal extra damage while the spell lasts.',
    },
    {
      id: 'cure-wounds',
      name: 'Cure Wounds',
      level: 1,
      school: 'Abjuration',
      castingTime: '1 action',
      range: 'Touch',
      components: 'V, S',
      duration: 'Instantaneous',
      concentration: false,
      ritual: false,
      prepared: false,
      description: 'Restore hit points to a creature you touch.',
    },
    {
      id: 'fog-cloud',
      name: 'Fog Cloud',
      level: 1,
      school: 'Conjuration',
      castingTime: '1 action',
      range: '120 feet',
      components: 'V, S',
      duration: 'Up to 1 hour',
      concentration: true,
      ritual: false,
      prepared: false,
      description: 'Create a sphere of fog that heavily obscures its area.',
    },
  ],
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-04T00:00:00.000Z',
};

export const sampleNotes: CampaignNote[] = [
  {
    id: 'sample-note-1',
    campaignId: sampleCampaign.id,
    title: 'The road north',
    content:
      'The old bridge is passable, but the watchtower was occupied at dusk.',
    category: 'Session Notes',
    createdAt: '2026-11-03T00:00:00.000Z',
    updatedAt: '2026-11-03T00:00:00.000Z',
  },
  {
    id: 'sample-note-2',
    campaignId: sampleCampaign.id,
    title: 'Dunmar Pass',
    content: 'A narrow crossing beyond the pine line.',
    category: 'Locations',
    createdAt: '2026-11-02T00:00:00.000Z',
    updatedAt: '2026-11-02T00:00:00.000Z',
  },
];
