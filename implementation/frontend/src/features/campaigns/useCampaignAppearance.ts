import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import type { AdventurerAppearance } from './camp/adventurerAppearance'
import {
  appearanceError,
  campaignAppearancesKey,
  resetCampaignAppearance,
  saveCampaignAppearance,
} from './camp/campAppearance'

export type AppearanceAction = 'save' | 'reset'

const fallbackCopy: Record<AppearanceAction, string> = {
  save: "We couldn't save your look. Check your connection and try again.",
  reset: "We couldn't reset your look. Check your connection and try again.",
}

/**
 * Saving and resetting the signed-in player's look for one campaign. Each action resolves
 * to whether it took effect; failures surface as safe copy.
 */
export function useCampaignAppearance(campaignId: string, userId: string) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const saveMutation = useMutation({
    mutationFn: (look: AdventurerAppearance) => saveCampaignAppearance(campaignId, look),
  })
  const resetMutation = useMutation({
    mutationFn: () => resetCampaignAppearance(campaignId, userId),
  })
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: campaignAppearancesKey(campaignId, userId) })
  const clearError = useCallback(() => setError(null), [])

  const save = async (look: AdventurerAppearance) => {
    setError(null)
    try {
      await saveMutation.mutateAsync(look)
      await refresh()
      return true
    } catch (failure) {
      setError(appearanceError(failure, fallbackCopy.save))
      return false
    }
  }

  const reset = async () => {
    setError(null)
    try {
      await resetMutation.mutateAsync()
      await refresh()
      return true
    } catch (failure) {
      setError(appearanceError(failure, fallbackCopy.reset))
      return false
    }
  }

  const pendingAction: AppearanceAction | null = saveMutation.isPending
    ? 'save'
    : resetMutation.isPending
      ? 'reset'
      : null

  return { error, clearError, pendingAction, save, reset }
}
