export function validateCampaignName(name: string): string | null {
  return name.trim() ? null : 'Enter a campaign name.'
}

export function toCampaignInput(name: string, description: string) {
  return {
    name: name.trim(),
    description: description.trim() || null,
  }
}
