export interface Campaign {
  id: string;
  name: string;
  partyName?: string;
  partyMemberCharacterIds: string[];
  description?: string;
  currentLocation?: string;
  status?: string;
  mapDataUrl?: string;
  createdAt: string;
  updatedAt: string;
}
