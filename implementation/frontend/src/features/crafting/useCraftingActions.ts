import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import {
  campaignLibrariesKey,
  libraryContentKey,
  libraryImportsKey,
  librariesKey,
} from './craftingQueries'
import {
  craftingError,
  createLibrary,
  deleteLibrary,
  importPack,
  isLibraryUnavailable,
  setCampaignLibrary,
  updateLibrary,
} from './craftingService'
import type { CraftingLibrary, CraftingPack, PackImportResult } from './craftingTypes'

/**
 * The DM's crafting writes. Each returns its result, or undefined after putting safe copy in
 * `error`; nothing is shown as done unless the database confirmed it.
 */
export function useCraftingActions(userId: string) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(0)

  const run = useCallback(
    async <T>(task: () => Promise<T>, fallback: string, onFailure?: () => void) => {
      setError(null)
      setPending((count) => count + 1)
      try {
        return await task()
      } catch (failure) {
        setError(craftingError(failure, fallback))
        // A library that is gone: refresh the list so it stops showing.
        if (isLibraryUnavailable(failure)) {
          void queryClient.invalidateQueries({ queryKey: librariesKey(userId) })
        }
        onFailure?.()
        return undefined
      } finally {
        setPending((count) => count - 1)
      }
    },
    [queryClient, userId],
  )

  const clearError = useCallback(() => setError(null), [])

  const refreshLibraries = () => queryClient.invalidateQueries({ queryKey: librariesKey(userId) })

  return {
    error,
    isPending: pending > 0,
    clearError,

    create: (name: string, description: string) =>
      run(async () => {
        const library = await createLibrary(name, description)
        await refreshLibraries()
        return library
      }, 'The library couldn’t be created. Check your connection and try again.'),

    rename: (library: CraftingLibrary, name: string, description: string) =>
      run(async () => {
        const updated = await updateLibrary(library.id, name, description)
        await refreshLibraries()
        return updated
      }, 'The library couldn’t be renamed. Check your connection and try again.'),

    remove: (libraryId: string, campaignId: string) =>
      run(async () => {
        await deleteLibrary(libraryId)
        await Promise.all([
          refreshLibraries(),
          queryClient.invalidateQueries({ queryKey: campaignLibrariesKey(campaignId, userId) }),
        ])
        queryClient.removeQueries({ queryKey: libraryContentKey(libraryId, userId) })
        return true as const
      }, 'The library couldn’t be deleted. Check your connection and try again.'),

    setEnabled: (campaignId: string, libraryId: string, enabled: boolean) =>
      run(async () => {
        await setCampaignLibrary(campaignId, libraryId, enabled)
        await queryClient.invalidateQueries({ queryKey: campaignLibrariesKey(campaignId, userId) })
        return true as const
      }, 'That couldn’t be changed. Check your connection and try again.'),

    importPack: (libraryId: string, pack: CraftingPack, label: string | null) =>
      run<PackImportResult>(async () => {
        const result = await importPack(libraryId, pack, label)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: libraryContentKey(libraryId, userId) }),
          queryClient.invalidateQueries({ queryKey: libraryImportsKey(libraryId, userId) }),
          refreshLibraries(),
        ])
        return result
      }, 'The pack couldn’t be imported. Nothing was changed. Check your connection and try again.'),
  }
}

export type CraftingActions = ReturnType<typeof useCraftingActions>
