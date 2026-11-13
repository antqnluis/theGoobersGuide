import type { CampaignRosterMember } from './campaignTypes'

/**
 * How a player is named in the Party panel and confirmations: their display name, then their
 * username. Only a former owner of an email-only account has neither.
 */
export function memberName(member: Pick<CampaignRosterMember, 'username' | 'display_name'>) {
  return member.display_name || member.username || 'this player'
}

/** The username shown beside a display name so players with similar names stay distinguishable. */
export function memberHandle(member: Pick<CampaignRosterMember, 'username' | 'display_name'>) {
  return member.display_name && member.username && member.display_name !== member.username
    ? member.username
    : null
}

export function memberLabel(member: Pick<CampaignRosterMember, 'username' | 'display_name'>) {
  const name = memberName(member)
  const handle = memberHandle(member)
  return handle ? `${name} (${handle})` : name
}
