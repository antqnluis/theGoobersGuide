import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { overviewKey } from './overviewQueries'
import { saveOverview } from './overviewService'
import type { OverviewValues } from './overviewTypes'

const saveError = "We couldn't save the overview. Check your connection and try again."

/**
 * Saving the campaign overview. Authorization stays in the database: a save by anyone but the
 * owner is refused and surfaces here as safe copy. `save` resolves to whether it was stored.
 */
export function useOverviewActions(campaignId: string, userId: string) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: (values: OverviewValues) => saveOverview(campaignId, values),
  })

  const clearError = useCallback(() => setError(null), [])

  const save = async (values: OverviewValues) => {
    setError(null)
    try {
      const saved = await mutation.mutateAsync(values)
      queryClient.setQueryData(overviewKey(campaignId, userId), saved)
      return true
    } catch {
      setError(saveError)
      return false
    }
  }

  return { error, clearError, isSaving: mutation.isPending, save }
}

export type OverviewActions = ReturnType<typeof useOverviewActions>
