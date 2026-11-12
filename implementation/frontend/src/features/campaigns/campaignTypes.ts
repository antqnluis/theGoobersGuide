export type CampaignRole = 'owner' | 'member'

export type CampaignRecord = {
  id: string
  owner_id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export type CampaignListItem = CampaignRecord & { role: CampaignRole }

export type CampaignRosterMember = {
  profile_id: string
  role: CampaignRole
  username: string | null
}

export type CampaignInput = {
  name: string
  description: string | null
}
