import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { campaignCharactersKey, characterItemsKey, characterSheetKey } from './characterQueries'
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
import {
  addCharacterItem,
  adjustCharacterCurrency,
  adjustItemQuantity,
  deleteCharacterItem,
  inventoryError,
  isItemStale,
  setItemFlag,
  updateCharacterItem,
} from './inventoryService'
import type {
  CharacterDetails,
  CharacterItem,
  CharacterItemValues,
  CharacterPurse,
  CharacterSheet,
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
  | 'currency'
  | 'item-add'
  | 'item-edit'
  | 'item-flag'
  | 'item-quantity'
  | 'item-delete'

/** The coin and item actions: immediate saves, separate from the sheet's own editing. */
export const inventoryActions: readonly CharacterAction[] = [
  'currency',
  'item-add',
  'item-edit',
  'item-flag',
  'item-quantity',
  'item-delete',
]

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
  currency: "We couldn't update the coins. Check your connection and try again.",
  'item-add': "We couldn't save this item. Check your connection and try again.",
  'item-edit': "We couldn't save this item. Check your connection and try again.",
  'item-flag': "We couldn't update this item. Check your connection and try again.",
  'item-quantity': "We couldn't update this item. Check your connection and try again.",
  'item-delete': "We couldn't remove this item. Check your connection and try again.",
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
  const [pending, setPending] = useState<{
    action: CharacterAction
    characterId: string | null
    itemId: string | null
  }>()

  const charactersKey = campaignCharactersKey(campaignId, userId)
  const detailKey = ['campaigns', 'detail', campaignId, userId]
  const rosterKey = ['campaigns', 'roster', campaignId, userId]

  const clearError = useCallback(() => setError(null), [])

  /** Runs one action; the task refreshes caches before the action reports success. */
  async function run(
    action: CharacterAction,
    characterId: string | null,
    task: () => Promise<void>,
    itemId: string | null = null,
  ) {
    setError(null)
    setPending({ action, characterId, itemId })
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
      if (characterId && isItemStale(failure)) {
        // Another device changed or removed the item: show the latest list.
        void queryClient.invalidateQueries({ queryKey: characterItemsKey(characterId, userId) })
      }
      const describe = inventoryActions.includes(action) ? inventoryError : characterError
      setError(describe(failure, fallbackCopy[action]))
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
      queryClient.removeQueries({ queryKey: characterItemsKey(characterId, userId) })
      await refreshCharacters()
    })

  const itemsKey = (characterId: string) => characterItemsKey(characterId, userId)

  /** Edits the cached item list in place; absent caches are left alone. */
  const patchItems = (characterId: string, edit: (items: CharacterItem[]) => CharacterItem[]) =>
    queryClient.setQueryData<CharacterItem[]>(itemsKey(characterId), (items) =>
      items ? edit(items) : items,
    )

  /** Writes the changed row into the cache now, then refreshes the list in the background. */
  const settleItem = (characterId: string, edit: (items: CharacterItem[]) => CharacterItem[]) => {
    patchItems(characterId, edit)
    void queryClient.invalidateQueries({ queryKey: itemsKey(characterId) })
  }

  /** Positive amounts add coins, negative amounts spend them; all or nothing. */
  const adjustCurrency = (characterId: string, deltas: Partial<CharacterPurse>) =>
    run('currency', characterId, async () => {
      const { updated_at, ...purse } = await adjustCharacterCurrency(characterId, deltas)
      // The stamp is the body's concurrency token: adopt it so the next body save matches.
      queryClient.setQueryData<CharacterSheet | null>(
        characterSheetKey(characterId, userId),
        (sheet) => (sheet ? { ...sheet, ...purse, updated_at } : sheet),
      )
    })

  const addItem = (characterId: string, values: CharacterItemValues) =>
    run('item-add', characterId, async () => {
      const item = await addCharacterItem(characterId, values)
      settleItem(characterId, (items) => [...items, item])
    })

  const editItem = (characterId: string, item: CharacterItem, values: CharacterItemValues) =>
    run(
      'item-edit',
      characterId,
      async () => {
        const saved = await updateCharacterItem(item.id, values, item.updated_at)
        settleItem(characterId, (items) => items.map((row) => (row.id === saved.id ? saved : row)))
      },
      item.id,
    )

  const changeItemFlag = (
    characterId: string,
    itemId: string,
    flag: 'equipped' | 'attuned',
    value: boolean,
  ) =>
    run(
      'item-flag',
      characterId,
      async () => {
        const saved = await setItemFlag(itemId, flag, value)
        settleItem(characterId, (items) => items.map((row) => (row.id === saved.id ? saved : row)))
      },
      itemId,
    )

  /** Adds or removes some of an item. The list is refreshed before this reports success,
   *  because the new `updated_at` is what an open edit form saves against. */
  const changeItemQuantity = (characterId: string, itemId: string, delta: number) =>
    run(
      'item-quantity',
      characterId,
      async () => {
        const quantity = await adjustItemQuantity(itemId, delta)
        patchItems(characterId, (items) =>
          items.map((row) => (row.id === itemId ? { ...row, quantity } : row)),
        )
        await queryClient.invalidateQueries({ queryKey: itemsKey(characterId) })
      },
      itemId,
    )

  const removeItem = (characterId: string, itemId: string) =>
    run(
      'item-delete',
      characterId,
      async () => {
        await deleteCharacterItem(itemId)
        settleItem(characterId, (items) => items.filter((row) => row.id !== itemId))
      },
      itemId,
    )

  return {
    error,
    clearError,
    pendingAction: pending?.action ?? null,
    pendingCharacterId: pending?.characterId ?? null,
    pendingItemId: pending?.itemId ?? null,
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
    adjustCurrency,
    addItem,
    editItem,
    changeItemFlag,
    changeItemQuantity,
    removeItem,
  }
}
