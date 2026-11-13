import type { CampaignRosterMember } from './campaignTypes'

/** How a player is named in confirmations; only a former owner of an email-only account has no username. */
export function memberName(member: Pick<CampaignRosterMember, 'username'>) {
  return member.username || 'this player'
}
