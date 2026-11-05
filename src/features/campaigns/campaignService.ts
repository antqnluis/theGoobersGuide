import type { AppData, AppRepository } from '../../shared/persistence/model';
import type { Campaign } from './model';

export type CampaignDetails = Pick<Campaign, 'name' | 'description'>;
export type CampaignContextDetails = Pick<
  Campaign,
  'currentLocation' | 'status'
>;

function clean(details: CampaignDetails): CampaignDetails {
  return {
    name: details.name.trim(),
    description: details.description?.trim() || undefined,
  };
}

function requireDetails(details: CampaignDetails): CampaignDetails {
  const result = clean(details);
  if (!result.name) {
    throw new Error('Enter a campaign name.');
  }
  return result;
}

export function createCampaign(
  repository: AppRepository,
  data: AppData,
  details: CampaignDetails,
): { data: AppData; campaign: Campaign } {
  const now = new Date().toISOString();
  const campaign: Campaign = {
    ...requireDetails(details),
    partyMemberCharacterIds: [],
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  const next = { ...data, campaigns: [...data.campaigns, campaign] };
  repository.save(next);
  return { data: next, campaign };
}

export function updateCampaignContext(
  repository: AppRepository,
  data: AppData,
  id: string,
  details: CampaignContextDetails,
): AppData {
  if (!data.campaigns.some((campaign) => campaign.id === id)) {
    throw new Error('Campaign no longer exists.');
  }
  const values = {
    currentLocation: details.currentLocation?.trim() || undefined,
    status: details.status?.trim() || undefined,
  };
  const next = {
    ...data,
    campaigns: data.campaigns.map((campaign) =>
      campaign.id === id
        ? { ...campaign, ...values, updatedAt: new Date().toISOString() }
        : campaign,
    ),
  };
  repository.save(next);
  return next;
}

export function updateCampaign(
  repository: AppRepository,
  data: AppData,
  id: string,
  details: CampaignDetails,
): AppData {
  if (!data.campaigns.some((campaign) => campaign.id === id)) {
    throw new Error('Campaign no longer exists.');
  }
  const values = requireDetails(details);
  const next = {
    ...data,
    campaigns: data.campaigns.map((campaign) =>
      campaign.id === id
        ? { ...campaign, ...values, updatedAt: new Date().toISOString() }
        : campaign,
    ),
  };
  repository.save(next);
  return next;
}

export function deleteCampaign(
  repository: AppRepository,
  data: AppData,
  id: string,
): AppData {
  const selectedCharacterByCampaign = {
    ...data.preferences.selectedCharacterByCampaign,
  };
  delete selectedCharacterByCampaign[id];
  const next = {
    ...data,
    campaigns: data.campaigns.filter((campaign) => campaign.id !== id),
    characters: data.characters.filter(
      (character) => character.campaignId !== id,
    ),
    notes: data.notes.filter((note) => note.campaignId !== id),
    preferences: {
      ...data.preferences,
      selectedCharacterByCampaign,
    },
  };
  repository.save(next);
  return next;
}
