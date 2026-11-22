import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  DiceContext,
  type DiceContextValue,
  type DiceFailureState,
  type DiceLogState,
  type DiceScope,
  type RollOutcome,
  type RollRequest,
} from './diceContext'
import { applyMode, formatSpec, parseDice, specError } from './diceNotation'
import { rollSpec } from './diceRandom'
import { diceLogKey } from './diceQueries'
import {
  announcement as announce,
  localRollRecord,
  mergeRollIntoLog,
  type DiceRollRecord,
  type DiceSource,
  type DiceVisibility,
} from './diceRules'
import { diceFailure, rollInCampaign } from './diceService'
import type { RollSpec } from './diceTypes'
import { useDiceLog } from './useDiceLog'

const labelLimit = 80
const localLogLimit = 50

/** A roll ready to send: mode applied, every limit checked. Kept so it can be retried or repeated. */
type PreparedRoll = {
  spec: RollSpec
  visibility: DiceVisibility
  source: DiceSource
  label: string | null
  characterId: string | null
}

const fail = (message: string): RollOutcome => ({ ok: false, message })

export function DiceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [scope, setScopeState] = useState<DiceScope | null>(null)
  const [open, setOpenState] = useState(false)
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<DiceContextValue['mode']>('normal')
  const [isPrivate, setPrivate] = useState(false)
  const [pending, setPending] = useState<DiceContextValue['pending']>(null)
  const [result, setResult] = useState<DiceRollRecord | null>(null)
  const [failure, setFailure] = useState<DiceFailureState | null>(null)
  const [localRolls, setLocalRolls] = useState<DiceRollRecord[]>([])
  const [unseen, setUnseen] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const [resultSeq, setResultSeq] = useState(0)
  const [canRepeat, setCanRepeat] = useState(false)
  const [host, setHost] = useState<HTMLElement | null>(null)

  const scopeRef = useRef<DiceScope | null>(null)
  const openRef = useRef(false)
  const prepared = useRef<PreparedRoll | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    openRef.current = open
  }, [open])

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next)
    if (next) setUnseen(0)
  }, [])

  const setScope = useCallback((next: DiceScope | null) => {
    const previous = scopeRef.current
    scopeRef.current = next
    setScopeState(next)
    if ((previous?.campaignId ?? '') !== (next?.campaignId ?? '')) {
      // A new table (or none): the last roll, its retry, and the unseen count belong to the old one.
      prepared.current = null
      setCanRepeat(false)
      setResult(null)
      setFailure(null)
      setUnseen(0)
      setAnnouncement('')
    }
  }, [])

  const names = scope?.memberNames
  const characters = scope?.characterNames
  const userId = scope?.userId ?? ''

  const rollerName = useCallback(
    (roll: DiceRollRecord) => {
      if (!roll.roller_id || roll.roller_id === userId) return 'You'
      return names?.get(roll.roller_id) ?? 'Former member'
    },
    [names, userId],
  )
  const characterName = useCallback(
    (roll: DiceRollRecord) =>
      roll.character_id ? (characters?.get(roll.character_id) ?? null) : null,
    [characters],
  )

  const onRemoteRoll = useCallback((roll: DiceRollRecord) => {
    if (!openRef.current) {
      setUnseen((count) => count + 1)
      return
    }
    // Others' rolls are announced only while the tray is open, so a reader isn't flooded.
    const who = scopeRef.current?.memberNames.get(roll.roller_id) ?? 'Former member'
    setAnnouncement(announce(who, roll))
  }, [])

  const serverLog = useDiceLog({
    campaignId: scope?.campaignId ?? '',
    userId,
    onRemoteRoll,
  })

  const rollHere = useCallback((roll: PreparedRoll): DiceRollRecord => {
    const record = localRollRecord(rollSpec(roll.spec), { label: roll.label, source: roll.source })
    setLocalRolls((rolls) => [record, ...rolls].slice(0, localLogLimit))
    setResult(record)
    setResultSeq((seq) => seq + 1)
    setAnnouncement(announce('You', record))
    return record
  }, [])

  const execute = useCallback(
    async (roll: PreparedRoll): Promise<RollOutcome> => {
      if (busy.current) return fail('Still rolling…')
      busy.current = true
      prepared.current = roll
      setCanRepeat(true)
      setFailure(null)
      setPending({ title: roll.label ?? formatSpec(roll.spec) })
      try {
        const current = scopeRef.current
        if (!current)
          return { ok: true, roll: rollHere({ ...roll, visibility: 'self', characterId: null }) }

        let record: DiceRollRecord
        try {
          record = await rollInCampaign({
            campaignId: current.campaignId,
            spec: roll.spec,
            visibility: roll.visibility,
            source: roll.source,
            label: roll.label,
            characterId: roll.characterId,
          })
        } catch (error) {
          const problem = diceFailure(error)
          setFailure({ message: problem.message, canRollLocally: problem.kind === 'network' })
          setAnnouncement(problem.message)
          return { ok: false, message: problem.message, reported: true }
        }
        queryClient.setQueryData(
          diceLogKey(current.campaignId, current.userId),
          (data: Parameters<typeof mergeRollIntoLog>[0]) => mergeRollIntoLog(data, record),
        )
        setResult(record)
        setResultSeq((seq) => seq + 1)
        setAnnouncement(announce('You', record))
        return { ok: true, roll: record }
      } finally {
        busy.current = false
        setPending(null)
      }
    },
    [queryClient, rollHere],
  )

  const roll = useCallback(
    (request: RollRequest): Promise<RollOutcome> => {
      let spec = request.spec
      if (!spec) {
        const parsed = parseDice(request.text ?? '')
        if (!parsed.ok) return Promise.resolve(fail(parsed.error))
        spec = parsed.spec
      }
      const moded = applyMode(spec, request.mode ?? 'normal')
      if (!moded.ok) return Promise.resolve(fail(moded.reason))
      const problem = specError(moded.spec)
      if (problem) return Promise.resolve(fail(problem))

      return execute({
        spec: moded.spec,
        visibility: request.visibility ?? 'campaign',
        source: request.source ?? 'tray',
        label: request.label ? request.label.slice(0, labelLimit) : null,
        characterId: request.characterId ?? null,
      })
    },
    [execute],
  )

  const repeat = useCallback(
    () =>
      prepared.current ? execute(prepared.current) : Promise.resolve(fail('Nothing to repeat.')),
    [execute],
  )
  const retry = useCallback(() => {
    if (prepared.current) void execute(prepared.current)
  }, [execute])
  const rollLocally = useCallback(() => {
    const last = prepared.current
    if (!last) return
    setFailure(null)
    rollHere({ ...last, visibility: 'self', characterId: null })
  }, [rollHere])
  const dismissFailure = useCallback(() => setFailure(null), [])

  const log: DiceLogState = useMemo(
    () =>
      scope
        ? serverLog
        : {
            records: localRolls,
            live: 'off',
            isLoading: false,
            isError: false,
            hasMore: false,
            isLoadingMore: false,
            loadMore: () => {},
            refetch: () => {},
          },
    [localRolls, scope, serverLog],
  )

  const value = useMemo<DiceContextValue>(
    () => ({
      inCampaign: Boolean(scope),
      userId,
      open,
      setOpen,
      draft,
      setDraft,
      mode,
      setMode,
      isPrivate,
      setPrivate,
      roll,
      canRepeat,
      repeat,
      pending,
      result,
      resultSeq,
      failure,
      retry,
      rollLocally,
      dismissFailure,
      log,
      unseen,
      announcement,
      rollerName,
      characterName,
      setScope,
      host,
      setHost,
    }),
    [
      announcement,
      canRepeat,
      characterName,
      dismissFailure,
      draft,
      failure,
      host,
      isPrivate,
      log,
      mode,
      open,
      pending,
      repeat,
      result,
      resultSeq,
      retry,
      roll,
      rollLocally,
      rollerName,
      scope,
      setOpen,
      setScope,
      unseen,
      userId,
    ],
  )

  return <DiceContext.Provider value={value}>{children}</DiceContext.Provider>
}
