import { createContext } from 'react'
import type { DiceRollRecord, DiceSource, DiceVisibility } from './diceRules'
import type { RollMode, RollSpec } from './diceTypes'
import type { LiveState } from '../../lib/useRealtimeChanges'

/** The campaign the dice are rolling in, registered by the campaign workspace. */
export type DiceScope = {
  campaignId: string
  userId: string
  /** Profile id to the name shown in the log. */
  memberNames: ReadonlyMap<string, string>
  /** Character id to its name, for the characters the viewer can read. */
  characterNames: ReadonlyMap<string, string>
}

/** What a roll source asks for. Give `spec` or `text` (parsed as dice notation). */
export type RollRequest = {
  spec?: RollSpec
  text?: string
  label?: string | null
  source?: DiceSource
  /** Only your own character in this campaign (D6). */
  characterId?: string | null
  mode?: RollMode
  visibility?: DiceVisibility
  /**
   * For an attack: the damage to roll, doubled, if this roll's kept d20 is a natural 20 (D9).
   * The result then offers "Roll critical damage".
   */
  critical?: { label: string; spec: RollSpec }
}

export type RollOutcome =
  | { ok: true; roll: DiceRollRecord }
  // `reported` is true when the failure is already shown as the dock's failure notice.
  | { ok: false; message: string; reported?: boolean }

export type DiceFailureState = {
  message: string
  /** After a network failure, the roll can be made on this device instead (not saved). */
  canRollLocally: boolean
}

export type DiceLogState = {
  records: DiceRollRecord[]
  live: LiveState
  isLoading: boolean
  isError: boolean
  hasMore: boolean
  isLoadingMore: boolean
  loadMore: () => void
  refetch: () => void
}

export type DiceContextValue = {
  /** True inside a campaign: rolls are made and shared by the server. */
  inCampaign: boolean
  userId: string
  open: boolean
  setOpen: (open: boolean) => void
  draft: string
  setDraft: (draft: string) => void
  mode: RollMode
  setMode: (mode: RollMode) => void
  isPrivate: boolean
  setPrivate: (isPrivate: boolean) => void
  roll: (request: RollRequest) => Promise<RollOutcome>
  canRepeat: boolean
  repeat: () => Promise<RollOutcome>
  /** The roll in flight: its title, with no numbers until the server answers. */
  pending: { title: string } | null
  /** The latest roll this player made. */
  result: DiceRollRecord | null
  /** Counts rolls made by this player, so the dock can tell a new result from an old one. */
  resultSeq: number
  /** Set while the latest roll is a natural 20 on an attack that has damage to double. */
  critical: { label: string } | null
  rollCritical: () => Promise<RollOutcome>
  failure: DiceFailureState | null
  retry: () => void
  rollLocally: () => void
  dismissFailure: () => void
  log: DiceLogState
  /** Rolls by others since the tray was last open. */
  unseen: number
  /** Polite live-region text for the latest roll. */
  announcement: string
  rollerName: (roll: DiceRollRecord) => string
  characterName: (roll: DiceRollRecord) => string | null
  setScope: (scope: DiceScope | null) => void
  /** The element the dock renders into: the open journal, so it stays reachable, else the page. */
  host: HTMLElement | null
  setHost: (host: HTMLElement | null) => void
}

const unavailable = async (): Promise<RollOutcome> => ({
  ok: false,
  message: 'Dice are not available here.',
})

const emptyLog: DiceLogState = {
  records: [],
  live: 'off',
  isLoading: false,
  isError: false,
  hasMore: false,
  isLoadingMore: false,
  loadMore: () => {},
  refetch: () => {},
}

/** Used outside a `DiceProvider` (isolated component tests): rolling reports it is unavailable. */
export const unavailableDice: DiceContextValue = {
  inCampaign: false,
  userId: '',
  open: false,
  setOpen: () => {},
  draft: '',
  setDraft: () => {},
  mode: 'normal',
  setMode: () => {},
  isPrivate: false,
  setPrivate: () => {},
  roll: unavailable,
  canRepeat: false,
  repeat: unavailable,
  pending: null,
  result: null,
  resultSeq: 0,
  critical: null,
  rollCritical: unavailable,
  failure: null,
  retry: () => {},
  rollLocally: () => {},
  dismissFailure: () => {},
  log: emptyLog,
  unseen: 0,
  announcement: '',
  rollerName: () => '',
  characterName: () => null,
  setScope: () => {},
  host: null,
  setHost: () => {},
}

export const DiceContext = createContext<DiceContextValue>(unavailableDice)
