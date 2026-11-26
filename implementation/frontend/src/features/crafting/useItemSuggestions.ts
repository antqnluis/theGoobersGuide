import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { suggestionsOptions } from './craftingQueries'
import { suggestionQueryLength } from './craftingService'
import type { ItemSuggestion } from './craftingTypes'

/** How long typing pauses before the search runs (plan §6.2). */
export const suggestionDebounceMs = 250

/**
 * Catalogue suggestions for the name a player is typing in the item form (plan C9). Nothing is
 * asked until the text is 2 to 80 characters and has stopped changing for a moment. A failure is
 * silent, so typing keeps working and the item still saves as typed.
 */
export function useItemSuggestions(characterId: string | undefined, text: string, active: boolean) {
  const trimmed = text.trim()
  const [settled, setSettled] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(trimmed), suggestionDebounceMs)
    return () => window.clearTimeout(timer)
  }, [trimmed])

  const eligible =
    Boolean(characterId) &&
    active &&
    settled.length >= suggestionQueryLength.min &&
    settled.length <= suggestionQueryLength.max
  const query = useQuery(suggestionsOptions(characterId ?? '', settled, eligible))

  const suggestions: ItemSuggestion[] = eligible && !query.isError ? (query.data ?? []) : []
  return { suggestions, isSearching: eligible && query.isFetching }
}
