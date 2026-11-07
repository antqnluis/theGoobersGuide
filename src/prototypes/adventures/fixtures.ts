import type {
  Adventure,
  PreviewAccount,
  PreviewCampaign,
  PreviewCharacter,
} from './model';

export const accounts: PreviewAccount[] = [
  { id: 'preview-ari', name: 'Ari' },
  { id: 'preview-bea', name: 'Bea' },
  { id: 'preview-cato', name: 'Cato', role: 'Party reader' },
  { id: 'preview-dena', name: 'Dena', role: 'Organizer' },
];
export const campaigns: PreviewCampaign[] = [
  {
    id: 'lantern-coast',
    name: 'Lantern Coast',
    partyName: 'The Tidekeepers',
    partyCharacterIds: ['ari-lark', 'bea-moss', 'cato-wren'],
  },
  { id: 'quiet-reach', name: 'Quiet Reach', partyCharacterIds: [] },
];
export const characters: PreviewCharacter[] = [
  {
    id: 'ari-lark',
    campaignId: 'lantern-coast',
    ownerId: 'preview-ari',
    name: 'Lark Fen',
  },
  {
    id: 'ari-ash',
    campaignId: 'lantern-coast',
    ownerId: 'preview-ari',
    name: 'Ash Vale',
  },
  {
    id: 'bea-moss',
    campaignId: 'lantern-coast',
    ownerId: 'preview-bea',
    name: 'Moss Bell',
  },
  {
    id: 'cato-wren',
    campaignId: 'lantern-coast',
    ownerId: 'preview-cato',
    name: 'Wren Pike',
  },
  {
    id: 'dena-reed',
    campaignId: 'lantern-coast',
    ownerId: 'preview-dena',
    name: 'Reed Stone',
  },
  {
    id: 'ari-fern',
    campaignId: 'quiet-reach',
    ownerId: 'preview-ari',
    name: 'Fern Grey',
  },
];
const date = '2026-11-07T00:00:00.000Z';
const seeds: Adventure[] = [
  {
    id: 'lighthouse-letter',
    campaignId: 'lantern-coast',
    creatorId: 'preview-ari',
    participantCharacterIds: ['ari-lark'],
    visibility: 'Participants only',
    title: 'Return the lighthouse keeper’s letter',
    type: 'Personal',
    status: 'Pending',
    description:
      'A letter tucked inside an old chart is still waiting for its recipient.',
    nextStep: 'Ask at the harbor before the evening tide.',
    createdAt: date,
    updatedAt: date,
  },
  {
    id: 'salt-road',
    campaignId: 'lantern-coast',
    creatorId: 'preview-ari',
    participantCharacterIds: ['ari-ash'],
    visibility: 'Participants only',
    title: 'Follow the old salt road',
    type: 'Side',
    status: 'On hold',
    description: '',
    nextStep: 'Find a guide who remembers the northern crossing.',
    createdAt: date,
    updatedAt: date,
  },
  {
    id: 'silver-compass',
    campaignId: 'lantern-coast',
    creatorId: 'preview-ari',
    participantCharacterIds: ['ari-lark'],
    visibility: 'Participants only',
    title: 'Recover the silver compass',
    type: 'Personal',
    status: 'Completed',
    description: 'A player-maintained objective, ready to reopen if needed.',
    nextStep: '',
    createdAt: date,
    updatedAt: date,
  },
  {
    id: 'garden-gate',
    campaignId: 'lantern-coast',
    creatorId: 'preview-bea',
    participantCharacterIds: ['bea-moss'],
    visibility: 'Participants only',
    title: 'Speak to the gardener at the east gate',
    type: 'Personal',
    status: 'In progress',
    description: '',
    nextStep: 'Return when the market closes.',
    createdAt: date,
    updatedAt: date,
  },
];
export function fixtureAdventures(): Adventure[] {
  return seeds.map((adventure) => ({
    ...adventure,
    participantCharacterIds: [...adventure.participantCharacterIds],
  }));
}
