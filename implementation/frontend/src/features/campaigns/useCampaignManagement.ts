import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { deleteCampaign, updateCampaign } from './campaignService'
import type { CampaignInput } from './campaignTypes'
import { toCampaignInput } from './campaignValidation'

const saveError = "We couldn't save these changes. Check your connection and try again."
const deleteError = "We couldn't delete this campaign. Check your connection and try again."

/**
 * Owner-only update and delete for one campaign, shared by every surface that
 * offers them. Authorization stays in RLS: the service calls throw when the
 * database returns no row, and that surfaces here as the safe error copy.
 *
 * `save` and `remove` resolve to whether the change was stored, so each surface
 * decides what follows (closing a form, announcing, navigating).
 */
export function useCampaignManagement(campaignId: string, userId: string) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const updateMutation = useMutation({
    mutationFn: (input: CampaignInput) => updateCampaign(campaignId, input),
  })
  const deleteMutation = useMutation({ mutationFn: () => deleteCampaign(campaignId) })

  const clearError = useCallback(() => setError(null), [])

  const save = async (name: string, description: string) => {
    setError(null)
    try {
      await updateMutation.mutateAsync(toCampaignInput(name, description))
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      return true
    } catch {
      setError(saveError)
      return false
    }
  }

  const remove = async () => {
    setError(null)
    try {
      await deleteMutation.mutateAsync()
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.removeQueries({ queryKey: ['campaigns', 'detail', campaignId, userId] })
      queryClient.removeQueries({ queryKey: ['campaigns', 'roster', campaignId, userId] })
      return true
    } catch {
      setError(deleteError)
      return false
    }
  }

  return {
    error,
    clearError,
    isSaving: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    save,
    remove,
  }
}
