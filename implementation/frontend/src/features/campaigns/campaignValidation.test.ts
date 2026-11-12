import { describe, expect, it } from 'vitest'
import { toCampaignInput, validateCampaignName } from './campaignValidation'

describe('campaign form values', () => {
  it('requires a name with non-whitespace content', () => {
    expect(validateCampaignName('  \n ')).toBe('Enter a campaign name.')
    expect(validateCampaignName('The Red Hand')).toBeNull()
  })

  it('trims saved values and stores an empty description as null', () => {
    expect(toCampaignInput('  The Red Hand  ', '   ')).toEqual({
      name: 'The Red Hand',
      description: null,
    })
    expect(toCampaignInput(' The Red Hand ', ' A short note ')).toEqual({
      name: 'The Red Hand',
      description: 'A short note',
    })
  })
})
