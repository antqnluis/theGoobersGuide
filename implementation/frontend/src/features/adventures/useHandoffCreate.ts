import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { adventureKey, adventuresPrefix } from './adventureQueries'
import type { AdventureDetail, AdventureType } from './adventureTypes'
import type { HandoffRpcChanges } from './handoffChanges'
import { createAdventureFromHandoff, handoffError } from './handoffService'

const fallback = "We couldn't start this adventure. Check your connection and try again."

export type HandoffCreateOutcome =
  { kind: 'created'; adventure: AdventureDetail } | { kind: 'failed' }

/**
 * Starting an adventure from a reviewed handoff. Success puts the adventure in the cache and
 * refreshes the board; any failure is safe copy in `error`, and nothing was created.
 */
export function useHandoffCreate(campaignId: string, userId: string) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: (input: {
      type: AdventureType
      characterId: string | null
      changes: HandoffRpcChanges
      sourceText: string
      label: string | null
    }) =>
      createAdventureFromHandoff(
        campaignId,
        input.type,
        input.characterId,
        input.changes,
        input.sourceText,
        input.label,
      ),
  })

  async function create(
    type: AdventureType,
    characterId: string | null,
    changes: HandoffRpcChanges,
    sourceText: string,
    label: string | null,
  ): Promise<HandoffCreateOutcome> {
    setError(null)
    try {
      const adventure = await mutation.mutateAsync({
        type,
        characterId,
        changes,
        sourceText,
        label,
      })
      queryClient.setQueryData(adventureKey(adventure.id, userId), adventure)
      await queryClient.invalidateQueries({ queryKey: adventuresPrefix })
      return { kind: 'created', adventure }
    } catch (failure) {
      setError(handoffError(failure, fallback))
      return { kind: 'failed' }
    }
  }

  return {
    create,
    isPending: mutation.isPending,
    error,
    clearError: () => setError(null),
  }
}
