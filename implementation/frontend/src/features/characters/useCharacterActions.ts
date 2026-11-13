import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { campaignCharactersKey, characterSheetKey } from './characterQueries'
import {
  characterError,
  createCharacter,
  deleteCharacter,
  isCharacterUnavailable,
  removeCharacterPortrait,
  isSheetConflict,
  setCharacterInParty,
  setCharacterStatus,
  setSheetVisibility,
  updateCharacterDetails,
  updateCharacterSheetBody,
  updateCharacterVitals,
  uploadCharacterPortrait,
} from './characterService'
import type {
  CharacterDetails,
  CharacterSheetBody,
  CharacterStatus,
  CharacterVitals,
  SheetVisibility,
} from './characterTypes'

export type CharacterAction =
  | 'create'
  | 'details'
  | 'status'
  | 'party'
  | 'visibility'
  | 'vitals'
  | 'sheet'
  | 'delete'
  | 'portrait'

const fallbackCopy: Record<CharacterAction, string> = {
  create: "We couldn't create this character. Check your connection and try again.",
  details: "We couldn't save this character. Check your connection and try again.",
  status: "We couldn't update this character. Check your connection and try again.",
  party: "We couldn't update the party. Check your connection and try again.",
  visibility: "We couldn't change who can see this sheet. Check your connection and try again.",
  vitals: "We couldn't save these stats. Check your connection and try again.",
  sheet: "We couldn't save this sheet. Check your connection and try again.",
  delete: "We couldn't delete this character. Check your connection and try again.",
  portrait: "We couldn't save this picture. Check your connection and try again.",
}

/**
 * Character mutations for one campaign. Called once by the workspace so mutation state
 * survives panels unmounting. Authorization stays in the database; failures surface as
 * safe copy. Every action resolves to whether it took effect, so the surface decides what
 * follows (announcing, moving focus).
 */
export function useCharacterActions(campaignId: string, userId: string) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ action: CharacterAction; characterId: string | null }>()

  const charactersKey = campaignCharactersKey(campaignId, userId)
  const detailKey = ['campaigns', 'detail', campaignId, userId]
  const rosterKey = ['campaigns', 'roster', campaignId, userId]

  const clearError = useCallback(() => setError(null), [])

  /** Runs one action; the task refreshes caches before the action reports success. */
  async function run(
    action: CharacterAction,
    characterId: string | null,
    task: () => Promise<void>,
  ) {
    setError(null)
    setPending({ action, characterId })
    try {
      await task()
      return true
    } catch (failure) {
      if (isCharacterUnavailable(failure)) {
        // The character or the membership is gone: show the truth.
        void queryClient.invalidateQueries({ queryKey: charactersKey })
        void queryClient.invalidateQueries({ queryKey: detailKey })
        void queryClient.invalidateQueries({ queryKey: rosterKey })
      }
      setError(characterError(failure, fallbackCopy[action]))
      return false
    } finally {
      setPending(undefined)
    }
  }

  const refreshCharacters = () => queryClient.invalidateQueries({ queryKey: charactersKey })

  const create = (details: CharacterDetails, inParty: boolean) =>
    run('create', null, async () => {
      await createCharacter(campaignId, details, inParty)
      await refreshCharacters()
    })

  const saveDetails = (characterId: string, details: CharacterDetails) =>
    run('details', characterId, async () => {
      await updateCharacterDetails(characterId, details)
      await refreshCharacters()
    })

  const changeStatus = (characterId: string, status: CharacterStatus) =>
    run('status', characterId, async () => {
      await setCharacterStatus(characterId, status)
      await refreshCharacters()
    })

  const changeParty = (characterId: string, inParty: boolean) =>
    run('party', characterId, async () => {
      await setCharacterInParty(characterId, inParty)
      await refreshCharacters()
    })

  const changeVisibility = (characterId: string, visibility: SheetVisibility) =>
    run('visibility', characterId, async () => {
      await setSheetVisibility(characterId, visibility)
      await refreshCharacters()
    })

  const saveVitals = (characterId: string, patch: Partial<CharacterVitals>) =>
    run('vitals', characterId, async () => {
      const sheet = await updateCharacterVitals(characterId, patch)
      queryClient.setQueryData(characterSheetKey(characterId, userId), sheet)
    })

  const saveSheet = (characterId: string, body: CharacterSheetBody, previousUpdatedAt: string) =>
    run('sheet', characterId, async () => {
      try {
        const sheet = await updateCharacterSheetBody(characterId, body, previousUpdatedAt)
        queryClient.setQueryData(characterSheetKey(characterId, userId), sheet)
      } catch (failure) {
        if (isSheetConflict(failure)) {
          // Let the surface offer the latest version.
          void queryClient.invalidateQueries({ queryKey: characterSheetKey(characterId, userId) })
        }
        throw failure
      }
    })

  const setPortrait = (characterId: string, file: File, previousPath: string | null) =>
    run('portrait', characterId, async () => {
      await uploadCharacterPortrait(characterId, file, previousPath)
      await refreshCharacters()
    })

  const clearPortrait = (characterId: string, path: string) =>
    run('portrait', characterId, async () => {
      await removeCharacterPortrait(characterId, path)
      await refreshCharacters()
    })

  const remove = (characterId: string, portraitPath?: string | null) =>
    run('delete', characterId, async () => {
      await deleteCharacter(characterId, portraitPath)
      queryClient.removeQueries({ queryKey: characterSheetKey(characterId, userId) })
      await refreshCharacters()
    })

  return {
    error,
    clearError,
    pendingAction: pending?.action ?? null,
    pendingCharacterId: pending?.characterId ?? null,
    create,
    saveDetails,
    changeStatus,
    changeParty,
    changeVisibility,
    saveVitals,
    saveSheet,
    setPortrait,
    clearPortrait,
    remove,
  }
}
