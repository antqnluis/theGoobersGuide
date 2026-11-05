import type { AppData, AppRepository } from '../../shared/persistence/model';
import type { DemoUserId } from '../auth/demoAuth';

export function savePartyName(
  repository: AppRepository,
  data: AppData,
  campaignId: string,
  name: string,
): AppData {
  const partyName = name.trim();
  if (!partyName) throw new Error('Enter a party name.');
  if (!data.campaigns.some((campaign) => campaign.id === campaignId))
    throw new Error('Campaign no longer exists.');

  const next = {
    ...data,
    campaigns: data.campaigns.map((campaign) =>
      campaign.id === campaignId
        ? { ...campaign, partyName, updatedAt: new Date().toISOString() }
        : campaign,
    ),
  };
  repository.save(next);
  return next;
}

export function addPartyMember(
  repository: AppRepository,
  data: AppData,
  campaignId: string,
  characterId: string,
  actorUserId: DemoUserId,
): AppData {
  return setPartyMembership(
    repository,
    data,
    campaignId,
    characterId,
    actorUserId,
    true,
  );
}

export function removePartyMember(
  repository: AppRepository,
  data: AppData,
  campaignId: string,
  characterId: string,
  actorUserId: DemoUserId,
): AppData {
  return setPartyMembership(
    repository,
    data,
    campaignId,
    characterId,
    actorUserId,
    false,
  );
}

function setPartyMembership(
  repository: AppRepository,
  data: AppData,
  campaignId: string,
  characterId: string,
  actorUserId: DemoUserId,
  isMember: boolean,
): AppData {
  const campaign = data.campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error('Campaign no longer exists.');
  if (!campaign.partyName)
    throw new Error('Create a party before adding members.');
  const character = data.characters.find(
    (item) => item.id === characterId && item.campaignId === campaignId,
  );
  if (!character) throw new Error('Character not found in this campaign.');
  if (character.ownerUserId !== actorUserId)
    throw new Error(
      'You can only change party membership for your own characters.',
    );

  const members = new Set(campaign.partyMemberCharacterIds);
  if (isMember) members.add(characterId);
  else members.delete(characterId);
  const partyMemberCharacterIds = [...members];
  if (
    partyMemberCharacterIds.length ===
      campaign.partyMemberCharacterIds.length &&
    partyMemberCharacterIds.every(
      (memberId, index) => memberId === campaign.partyMemberCharacterIds[index],
    )
  )
    return data;

  const next = {
    ...data,
    campaigns: data.campaigns.map((item) =>
      item.id === campaignId
        ? {
            ...item,
            partyMemberCharacterIds,
            updatedAt: new Date().toISOString(),
          }
        : item,
    ),
  };
  repository.save(next);
  return next;
}
