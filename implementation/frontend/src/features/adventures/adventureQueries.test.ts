import { describe, expect, it, vi } from 'vitest'
import {
  adventuresKey,
  adventuresPrefix,
  characterAdventureCountKey,
  invitationsKey,
  invitationsOptions,
  requestCountKey,
  requestCountOptions,
} from './adventureQueries'
import { countAdventureRequests, listInvitations } from './adventureService'
import { campaignId, userId } from './adventureTestData'

vi.mock('./adventureService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./adventureService')>()),
  listInvitations: vi.fn().mockResolvedValue([]),
  countAdventureRequests: vi.fn().mockResolvedValue(2),
}))

describe('collaboration queries', () => {
  it('keeps every key under the adventures prefix, so membership changes refresh them', () => {
    for (const key of [
      adventuresKey(campaignId, userId),
      invitationsKey(campaignId, userId),
      requestCountKey(campaignId, userId),
      characterAdventureCountKey('c1', userId),
    ]) {
      expect(key.slice(0, adventuresPrefix.length)).toEqual([...adventuresPrefix])
    }
    expect(
      new Set([invitationsKey(campaignId, userId), requestCountKey(campaignId, userId)]).size,
    ).toBe(2)
  })

  it('reads invitations on focus, and the request count once without retries', async () => {
    const invitations = invitationsOptions(campaignId, userId)
    expect(invitations.refetchOnWindowFocus).toBe(true)
    await invitations.queryFn()
    expect(listInvitations).toHaveBeenCalledWith(campaignId)

    const count = requestCountOptions(campaignId, userId, false)
    expect(count.enabled).toBe(false)
    expect(count.retry).toBe(false)
    expect(count.refetchOnWindowFocus).toBe(true)
    await expect(count.queryFn()).resolves.toBe(2)
    expect(countAdventureRequests).toHaveBeenCalledWith(campaignId)
  })
})
