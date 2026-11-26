import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { visionsPrefix } from '../crafting/craftingQueries'
import { applyCharacterUpdate, importError, isImportConflict } from './characterImportService'
import {
  campaignCharactersKey,
  campaignCharactersOptions,
  characterImportsKey,
  characterItemsKey,
  characterItemsOptions,
  characterSheetKey,
  characterSheetOptions,
  coinLogKey,
} from './characterQueries'
import { isCharacterUnavailable } from './characterService'
import type { CurrentCharacter, ExpectedVersions, UpdatePayload } from './characterUpdateDocument'
import type { CharacterSummary } from './characterTypes'

const fallback = "We couldn't apply this update. Check your connection and try again."

export type UpdateOutcome =
  | { kind: 'applied' }
  /** The character changed during review; `current` is the latest version, or null if gone. */
  | { kind: 'conflict'; current: CurrentCharacter | null; message: string }
  | { kind: 'failed' }

/**
 * Applying a reviewed update to one character. Success refreshes everything the sheet shows.
 * A conflict (the character changed after the review was built) loads the latest version so
 * the review can start again; any other failure is safe copy in `error`.
 */
export function useCharacterUpdate(character: CharacterSummary, userId: string) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: (input: {
      expected: ExpectedVersions
      changes: UpdatePayload
      label: string | null
    }) => applyCharacterUpdate(character.id, input.expected, input.changes, input.label),
  })

  const campaignId = character.campaign_id
  const charactersKey = campaignCharactersKey(campaignId, userId)

  /** Fetches the character, sheet, and items again, ignoring anything cached. */
  async function loadLatest(): Promise<CurrentCharacter | null> {
    const [characters, sheet, items] = await Promise.all([
      queryClient.fetchQuery({ ...campaignCharactersOptions(campaignId, userId), staleTime: 0 }),
      queryClient.fetchQuery({ ...characterSheetOptions(character.id, userId), staleTime: 0 }),
      queryClient.fetchQuery({
        ...characterItemsOptions(character.id, userId),
        staleTime: 0,
      }),
    ])
    const latest = characters.find((entry) => entry.id === character.id)
    if (!latest || !sheet) return null
    return { character: latest, sheet, items }
  }

  async function apply(
    expected: ExpectedVersions,
    changes: UpdatePayload,
    label: string | null,
  ): Promise<UpdateOutcome> {
    setError(null)
    try {
      await mutation.mutateAsync({ expected, changes, label })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: charactersKey }),
        queryClient.invalidateQueries({ queryKey: characterSheetKey(character.id, userId) }),
        queryClient.invalidateQueries({ queryKey: characterItemsKey(character.id, userId) }),
        queryClient.invalidateQueries({ queryKey: coinLogKey(character.id, userId) }),
        queryClient.invalidateQueries({ queryKey: visionsPrefix(character.id) }),
        queryClient.invalidateQueries({ queryKey: characterImportsKey(character.id, userId) }),
      ])
      return { kind: 'applied' }
    } catch (failure) {
      const message = importError(failure, fallback)
      if (isImportConflict(failure)) {
        let current: CurrentCharacter | null = null
        try {
          current = await loadLatest()
        } catch {
          // The caller shows the conflict message either way.
        }
        setError(null)
        return { kind: 'conflict', current, message }
      }
      if (isCharacterUnavailable(failure)) {
        void queryClient.invalidateQueries({ queryKey: charactersKey })
        void queryClient.invalidateQueries({
          queryKey: ['campaigns', 'detail', campaignId, userId],
        })
        void queryClient.invalidateQueries({
          queryKey: ['campaigns', 'roster', campaignId, userId],
        })
      }
      setError(message)
      return { kind: 'failed' }
    }
  }

  return {
    apply,
    loadLatest,
    isPending: mutation.isPending,
    error,
    clearError: () => setError(null),
  }
}
