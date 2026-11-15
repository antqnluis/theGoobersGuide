import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { readErrorMessage } from '../campaigns/rpcErrors'
import type { toImportPayload } from './characterDocument'
import { importCharacter, importError } from './characterImportService'
import { campaignCharactersKey } from './characterQueries'
import { isCharacterUnavailable } from './characterService'

const fallback = "We couldn't import this character. Check your connection and try again."

/**
 * Importing a character into one campaign. The result is the new character's id once the
 * campaign's character list has been refreshed, so the caller can open it at once; a failure
 * is safe copy in `error`, and the result is null.
 */
export function useCharacterImport(campaignId: string, userId: string) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: (input: { payload: ReturnType<typeof toImportPayload>; label: string | null }) =>
      importCharacter(campaignId, input.payload, input.label),
  })

  const charactersKey = campaignCharactersKey(campaignId, userId)

  async function importNew(
    payload: ReturnType<typeof toImportPayload>,
    label: string | null,
  ): Promise<string | null> {
    setError(null)
    try {
      const id = await mutation.mutateAsync({ payload, label })
      // Wait for the list, so the tent finds the new character when it opens it.
      await queryClient.invalidateQueries({ queryKey: charactersKey })
      return id
    } catch (failure) {
      const message = importError(failure, fallback)
      if (isCharacterUnavailable(failure)) {
        void queryClient.invalidateQueries({ queryKey: charactersKey })
        void queryClient.invalidateQueries({
          queryKey: ['campaigns', 'detail', campaignId, userId],
        })
        void queryClient.invalidateQueries({
          queryKey: ['campaigns', 'roster', campaignId, userId],
        })
      } else if (readErrorMessage(failure) === 'character_active_exists') {
        // Another device created or activated a character: show the truth.
        void queryClient.invalidateQueries({ queryKey: charactersKey })
      }
      setError(message)
      return null
    }
  }

  return {
    importNew,
    isPending: mutation.isPending,
    error,
    clearError: () => setError(null),
  }
}
