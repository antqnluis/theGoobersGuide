/** What the campaign's owner tells the table about the campaign as it stands. */
export type CampaignOverview = {
  campaign_id: string
  announcement: string
  location: string
  in_world_date: string
  chapter: string
  situation: string
  objective: string
  last_session: string
  /** ISO timestamp of the next session, or null when none is planned. */
  next_session_at: string | null
  next_session_note: string
  ruleset: string
  house_rules: string
  table_notes: string
  updated_at: string
}

/** What the owner writes: every field of the overview the owner can change. */
export type OverviewValues = Omit<CampaignOverview, 'campaign_id' | 'updated_at'>
