import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { adventureOptions, adventuresPrefix } from './adventureQueries'
import type { AdventureDetail } from './adventureTypes'
import type { HandoffExpected, HandoffRpcChanges } from './handoffChanges'
import {
  attachHandoff,
  handoffError,
  isHandoffConflict,
  isHandoffTargetUnavailable,
} from './handoffService'

const fallback = "We couldn't save this handoff. Check your connection and try again."

export type HandoffOutcome =
  | { kind: 'applied' }
  /** The adventure changed during review; `current` is the latest version, or null if unreadable. */
  | { kind: 'conflict'; current: AdventureDetail | null; message: string }
  /** The adventure was archived or is no longer readable: the dialog closes. */
  | { kind: 'unavailable' }
  | { kind: 'failed' }

/**
 * Attaching a reviewed handoff to one adventure. Success refreshes everything the adventure page
 * shows. A conflict loads the latest version so the review can start again; any other failure is
 * safe copy in `error`.
 */
export function useHandoffApply(adventureId: string, userId: string) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: (input: {
      expected: HandoffExpected | Record<string, never>
      changes: HandoffRpcChanges
      sourceText: string
      label: string | null
    }) => attachHandoff(adventureId, input.expected, input.changes, input.sourceText, input.label),
  })

  async function apply(
    expected: HandoffExpected | Record<string, never>,
    changes: HandoffRpcChanges,
    sourceText: string,
    label: string | null,
  ): Promise<HandoffOutcome> {
    setError(null)
    try {
      await mutation.mutateAsync({ expected, changes, sourceText, label })
      await queryClient.invalidateQueries({ queryKey: adventuresPrefix })
      return { kind: 'applied' }
    } catch (failure) {
      const message = handoffError(failure, fallback)
      if (isHandoffConflict(failure)) {
        let current: AdventureDetail | null = null
        try {
          current = await queryClient.fetchQuery({
            ...adventureOptions(adventureId, userId),
            staleTime: 0,
          })
        } catch {
          // The caller shows the conflict message either way.
        }
        void queryClient.invalidateQueries({ queryKey: adventuresPrefix })
        return { kind: 'conflict', current, message }
      }
      if (isHandoffTargetUnavailable(failure)) {
        void queryClient.invalidateQueries({ queryKey: adventuresPrefix })
        return { kind: 'unavailable' }
      }
      setError(message)
      return { kind: 'failed' }
    }
  }

  return {
    apply,
    isPending: mutation.isPending,
    error,
    clearError: () => setError(null),
  }
}
