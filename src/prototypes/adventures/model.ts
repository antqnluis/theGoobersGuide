export const statuses = [
  'Pending',
  'In progress',
  'On hold',
  'Completed',
] as const;
export type AdventureStatus = (typeof statuses)[number];
export type AdventureType = 'Personal' | 'Side';

export interface PreviewAccount {
  id: string;
  name: string;
  role?: string;
}
export interface PreviewCampaign {
  id: string;
  name: string;
  partyName?: string;
  partyCharacterIds: string[];
}
export interface PreviewCharacter {
  id: string;
  campaignId: string;
  ownerId: string;
  name: string;
}
export interface AdventureDraft {
  title: string;
  type: AdventureType;
  status: AdventureStatus;
  description: string;
  nextStep: string;
}
export interface Adventure extends AdventureDraft {
  id: string;
  campaignId: string;
  creatorId: string;
  participantCharacterIds: string[];
  visibility: 'Participants only';
  createdAt: string;
  updatedAt: string;
  membershipRevision: number;
}
export interface MembershipRequest {
  id: string;
  adventureId: string;
  campaignId: string;
  kind: 'invite' | 'remove';
  targetCharacterId: string;
  proposerCharacterId: string;
  membershipRevision: number;
  approvedCharacterIds: string[];
  status:
    'approving' | 'invited' | 'accepted' | 'declined' | 'rejected' | 'canceled';
}
export interface AdventureActivity {
  id: string;
  adventureId: string;
  actorId: string;
  characterId: string;
  at: string;
  message: string;
  note?: string;
}
export interface PreviewState {
  adventures: Adventure[];
  requests: MembershipRequest[];
  activity: AdventureActivity[];
  viewerId: string;
  campaignId: string;
  selectedCharacterId: string | null;
  failNextSave: boolean;
  error: string | null;
  feedback: string | null;
}
export const blankDraft = (): AdventureDraft => ({
  title: '',
  type: 'Personal',
  status: 'Pending',
  description: '',
  nextStep: '',
});
