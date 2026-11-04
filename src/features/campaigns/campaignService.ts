import type { AppData, AppRepository } from '../../shared/persistence/model';
import type { Campaign } from './model';

export type CampaignDetails = Pick<
  Campaign,
  'name' | 'partyName' | 'description' | 'currentLocation' | 'status'
>;

function clean(details: CampaignDetails): CampaignDetails {
  return {
    name: details.name.trim(),
    partyName: details.partyName.trim(),
    description: details.description?.trim() || undefined,
    currentLocation: details.currentLocation?.trim() || undefined,
    status: details.status?.trim() || undefined,
  };
}

function requireDetails(details: CampaignDetails): CampaignDetails {
  const result = clean(details);
  if (!result.name || !result.partyName) {
    throw new Error('Enter a campaign name and party name.');
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
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  const next = { ...data, campaigns: [...data.campaigns, campaign] };
  repository.save(next);
  return { data: next, campaign };
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
  const next = {
    ...data,
    campaigns: data.campaigns.filter((campaign) => campaign.id !== id),
    characters: data.characters.filter(
      (character) => character.campaignId !== id,
    ),
    notes: data.notes.filter((note) => note.campaignId !== id),
  };
  repository.save(next);
  return next;
}
